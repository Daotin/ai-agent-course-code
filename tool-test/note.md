流程梳理：tool-file-read.mjs

先创建模型 model，再定义 read_file 工具（读文件内容并返回），用 bindTools 把工具绑定给模型——这样模型才知道"有这个工具可以用"。

构造初始 messages：System 消息告诉模型工作流程和可用工具，Human 消息是用户的读文件请求。messages 之后会一直被追加，作为模型和工具之间传递上下文的载体。

第一次调用 modelWithTools.invoke(messages)。因为模型自己不能产生副作用（读文件），它只能返回一个"申请调用 read_file 工具"的响应（带 tool_calls），还不是最终答案。把这条响应也 push 进 messages，保留上下文。

进入 while 循环，只要 response.tool_calls 不为空就继续：执行对应工具、把工具返回的结果作为 ToolMessage push 进 messages，再重新 invoke 一次模型。用循环而不是单次调用，是为了兼容"可能需要多轮工具调用才能拿到答案"的情况（本例其实只走一轮，但结构上留了扩展空间）。

模型拿到工具结果后，判断不再需要调用工具，tool_calls 为空，循环结束，打印最终的解释性回复。

流程图（有循环判断，画一下）

```
初始化模型/工具
      │
      ▼
构造 messages(System+Human)
      │
      ▼
invoke(messages) ──► response，push 进 messages
      │
  ┌─► response 有 tool_calls? ──否──► 打印最终结果 [结束]
  │         │是
  │         ▼
  │   执行工具 → ToolMessage → push 进 messages
  │         │
  │   再次 invoke(messages) ──► response
  └─────────┘
```

---

## mini-cursor.mjs 执行流程

程序启动后先用 `ChatOpenAI` 初始化一个模型实例，并通过 `bindTools` 绑定四个工具（读文件、写文件、执行命令、列目录），得到 `modelWithTools`——这样模型每次调用时都自带工具描述，能自主决定要不要调用工具。

进入 `runAgentWithTools(query)`，先构造消息数组 `messages`，塞入一条 `SystemMessage`（写明当前工作目录、工具用法、以及 `execute_command` 配合 `workingDirectory` 时不要重复 `cd` 的强调规则——这是因为之前踩过坑，模型容易在已切换目录后再次 `cd` 导致找不到路径）和一条 `HumanMessage`（用户的具体需求，即 case1 里的建 TodoList 应用需求）。`messages` 就是整个对话的状态载体，后续所有轮次都在这个数组上追加。

接着进入最多 `maxIterations`（30）次的循环，这是给 Agent 的"思考-行动"自主空间上限，防止死循环：

- 把当前 `messages` 整体传给 `modelWithTools.invoke`，拿到一条 `response`（AIMessage），随即原样 push 进 `messages`——保持对话历史完整，让模型下一轮能看到自己刚才说过/调用过什么。
- 检查 `response.tool_calls`：如果没有工具调用，说明模型认为任务已完成或只是在回复，直接返回 `response.content`，循环结束。
- 如果有工具调用，遍历每一个 `toolCall`，按名字在 `tools` 数组里找到对应工具，用 `toolCall.args`（模型生成的参数）执行 `foundTool.invoke`，把执行结果包成 `ToolMessage`（带上 `tool_call_id` 以对应到具体那次调用）push 进 `messages`。这一步把工具的真实执行结果反馈回对话上下文，模型下一轮 `invoke` 时就能看到工具输出，据此决定下一步做什么。

如此循环，直到某一轮模型不再产生 `tool_calls` 为止，返回其最终回复；如果 30 轮耗尽仍未结束，则兜底返回 `messages` 里最后一条消息的内容。

最外层用 `try/catch` 包裹调用，异常直接打印错误信息。

### 流程图（工具调用循环）

```
初始化 messages = [SystemMessage, HumanMessage]
        │
        ▼
┌─────────────────────────────┐
│  for i in 0..maxIterations   │
│                               │
│  1. response = model.invoke(messages)
│  2. messages.push(response)  │
│                               │
│  3. 有 tool_calls？           │
│     │                        │
│     ├─ 否 → return response.content ──▶ [结束]
│     │                        │
│     └─ 是                    │
│         │                    │
│         ▼                    │
│    对每个 toolCall:           │
│      找到对应 tool            │
│      → tool.invoke(args)     │
│      → messages.push(ToolMessage)
│         │                    │
│         └──回到循环头（进入下一轮 invoke）
└─────────────────────────────┘
        │（循环耗尽 30 轮仍未 return）
        ▼
return messages[最后一条].content
```

---

# MCP 编写与 LangChain 调用 MCP

## 一、怎么写一个 MCP Server

上节我们用 LangChain 的 `tool()` 写了读文件、写文件这些工具，但这些工具只能在自己的代码里用。

那有没有办法把工具写一次，cursor、别的项目都能用呢？这就是 MCP 干的事。

MCP Server 其实就是一个**子进程**，它通过 stdin/stdout 和 Client（比如 Cursor、LangChain）互传 JSON-RPC 消息。Client 启动的时候会 spawn 这个进程，通信通道就建立了。

```
Client (spawn) ──stdin/stdout──▶ Server 子进程
        ◀───JSON-RPC messages───
```

怎么写呢？用 `@modelcontextprotocol/sdk` 这个包。

先创建一个 `McpServer` 实例，给个名字和版本号，然后往上面挂东西，主要挂两种：**Tool** 和 **Resource**。

**Tool** 是核心，就是 LLM 可以主动调用的能力。通过 `server.registerTool(name, config, handler)` 注册，config 里用 zod 描述入参 schema，LLM 靠 description 决定什么时候调、传什么参数。handler 是实际执行逻辑，返回固定格式 `{ content: [{ type: "text", text: "..." }] }`。跟之前写 LangChain tool 差不多，只是返回格式不一样。

**Resource** 是可选的，它是只读的静态信息，比如使用指南、配置说明之类的。Client 可以通过 `listResources` / `readResource` 拉取，通常注入到 system prompt 里让 LLM 了解这个 server 的背景知识。

最后创建 `StdioServerTransport`，调用 `server.connect(transport)` 启动就行了，server 就跑起来等着 Client 连了。

---

## 二、LangChain 怎么调用 MCP

Tool 写好了，怎么在 LangChain 里用呢？

用 `@langchain/mcp-adapters` 这个包，它提供了 `MultiServerMCPClient`，能同时连多个 MCP Server，不管是自己写的还是社区的，统一转成 LangChain Tool 格式。

整体流程和之前手写 tool 的 Agent 循环是一样的：

```
用户输入
  │
  ▼
messages[] ──▶ modelWithTools.invoke(messages)
  │                      │
  │          ┌───────────┘
  │          ▼
  │   response.tool_calls 有值？
  │          │
  │    No ───┼──▶ 输出 response.content，结束
  │          │
  │    Yes   ▼
  │   遍历 tool_calls，找到对应 tool 执行
  │          │
  │          ▼
  │   将 ToolMessage 追加到 messages[]
  │          │
  └──────────┘  （循环直到无 tool_calls）
```

先说初始化。在 `MultiServerMCPClient` 的 `mcpServers` 配置里，每一项就是一个子进程配置（command + args）。自己写的 server 用 `node xxx.mjs`，社区的用 `npx -y @xxx/server-xxx`，写法完全一样。然后调 `mcpClient.getTools()` 就能拿到所有 server 的工具了，已经是 LangChain Tool 格式，直接 `model.bindTools(tools)` 绑上去就行。

绑完之后就是 Agent 循环了，跟之前手写 tool 那节一模一样——循环调 LLM，检查 `response.tool_calls`，有的话就找到对应 tool 执行，把结果追加到 messages，再调 LLM，直到 LLM 不再调工具。

这里有个坑要注意：`tool.invoke(toolCall)` 和 `tool.invoke(toolCall.args)` 是不一样的。传整个 toolCall 对象（带 id/name/args），返回的直接就是 ToolMessage，自动关联了 tool_call_id；只传 args 的话返回的是纯字符串，得自己手动包 ToolMessage 填 id。推荐用前者，省事不出错。

如果 MCP Server 注册了 Resource，还可以在启动时通过 `mcpClient.listResources()` 和 `mcpClient.readResource(serverName, uri)` 拉取内容，拼成 SystemMessage 放到 messages 最前面，这样 LLM 一开始就知道 server 的背景信息了。

最后别忘了 `mcpClient.close()`，用 `try/finally` 包住，退出时把所有 MCP Server 子进程终止掉。

这套东西用 LangChain 的 LCEL Runnable 也能写——`RunnableLambda` 包函数、`RunnableBranch` 做条件分支、`RunnableSequence` 串联多步——但逻辑跟手写循环完全等价，只是换了个可组合的写法，看项目需要选就行。
