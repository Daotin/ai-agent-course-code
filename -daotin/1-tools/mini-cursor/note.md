# mini-cursor.mjs 执行流程

程序启动后先用 `ChatOpenAI` 初始化一个模型实例，并通过 `bindTools` 绑定四个工具（读文件、写文件、执行命令、列目录），得到 `modelWithTools`——这样模型每次调用时都自带工具描述，能自主决定要不要调用工具。

进入 `runAgentWithTools(query)`，先构造消息数组 `messages`，塞入一条 `SystemMessage`（写明当前工作目录、工具用法、以及 `execute_command` 配合 `workingDirectory` 时不要重复 `cd` 的强调规则——这是因为之前踩过坑，模型容易在已切换目录后再次 `cd` 导致找不到路径）和一条 `HumanMessage`（用户的具体需求，即 case1 里的建 TodoList 应用需求）。`messages` 就是整个对话的状态载体，后续所有轮次都在这个数组上追加。

接着进入最多 `maxIterations`（30）次的循环，这是给 Agent 的"思考-行动"自主空间上限，防止死循环：

- 把当前 `messages` 整体传给 `modelWithTools.invoke`，拿到一条 `response`（AIMessage），随即原样 push 进 `messages`——保持对话历史完整，让模型下一轮能看到自己刚才说过/调用过什么。
- 检查 `response.tool_calls`：如果没有工具调用，说明模型认为任务已完成或只是在回复，直接返回 `response.content`，循环结束。
- 如果有工具调用，遍历每一个 `toolCall`，按名字在 `tools` 数组里找到对应工具，用 `toolCall.args`（模型生成的参数）执行 `foundTool.invoke`，把执行结果包成 `ToolMessage`（带上 `tool_call_id` 以对应到具体那次调用）push 进 `messages`。这一步把工具的真实执行结果反馈回对话上下文，模型下一轮 `invoke` 时就能看到工具输出，据此决定下一步做什么。

如此循环，直到某一轮模型不再产生 `tool_calls` 为止，返回其最终回复；如果 30 轮耗尽仍未结束，则兜底返回 `messages` 里最后一条消息的内容。

最外层用 `try/catch` 包裹调用，异常直接打印错误信息。

## 流程图（工具调用循环）

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
