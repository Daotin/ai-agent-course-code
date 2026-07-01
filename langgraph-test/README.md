# 总结

## 为什么要用多 Agent 架构

1. **prompt 更纯净**：把不同职责的指令拆分到多个 Agent，每个 Agent 的 context 更短、更专注，token 消耗更少，决策更准确
2. **并行执行**：多个 Agent 可以同时思考和执行各自的子任务，缩短整体响应时间
3. **相互讨论和纠错**：Agent 之间可以基于各自角色互相审查输出、补充信息，提升结果质量
4. 复杂的 Agent 产品基本都是多 Agent 架构，是行业主流方向

## LangGraph 核心概念

**State（状态）**

用 `Annotation.Root` 定义，每个字段配两个选项：
- `default`：字段的初始值
- `reducer`：新值如何合并到旧值（覆盖 / 追加 / 自定义逻辑）

**图的构建**

用 `StateGraph` 创建，三个核心操作：
- `addNode`：添加节点（一个函数，接收 state 返回更新）
- `addEdge`：添加固定边（节点 A 执行完直接到节点 B）
- `addConditionalEdges`：添加路由边（根据 state 动态决定下一步），也可以让边指回当前节点实现**循环**

**Checkpointer（检查点）**

用 `MemorySaver` 等实现，挂载到 `compile({ checkpointer })` 后，每步执行结果自动保存。用 `thread_id` 隔离不同会话，下次调用自动从上次状态恢复。

**Interrupt（中断）**

节点内调用 `interrupt(value)` 让图暂停，控制权交回外部等待人工确认。再次 `invoke(new Command({ resume: 值 }), config)` 从断点继续执行，实现 Human-in-the-loop。

**预置组件**

| 组件 | 作用 |
|------|------|
| `ToolNode` | 自动执行 AIMessage 中的所有 tool_call，结果包成 ToolMessage 追加到 state |
| `toolsCondition` | 检测 AIMessage 是否含 tool_call，决定走工具节点还是 END |
| `createAgent` | 封装完整 ReAct 图（含 ToolNode、toolsCondition、checkpointer），开箱即用 |

## 多 Agent 架构

**Supervisor - Worker 模式**

- **Supervisor**：主管节点，只负责任务分发，不处理具体业务；分析用户意图后决定派给哪个 Worker，Worker 执行完后控制权回到 Supervisor，再决定继续派发还是结束
- **Worker**：各自专注自己领域，持有各自的工具，彼此不感知

直接用 `@langchain/langgraph-supervisor` 的 `createSupervisor` 即可，传入子 Agent 的 `.graph`，内部自动把每个子 Agent 包装成 tool 供 Supervisor 调用。

**流式调试**

`app.stream(input, { streamMode: ["updates","values"] })` 同时输出两种事件：
- `updates`：本步哪些节点执行了、输出了什么增量 state（适合追踪执行路径）
- `values`：每步后的完整 state 快照（适合拿最终结果）

日志太多时可直接用断点调试，在节点函数内打断点查看 state 流转更直观。

---

# 图介绍

## 线性图

示例代码：`src/basic-graph.mjs`

节点按固定顺序依次执行，无分支、无循环，数据从 START 流向 END。

**拓扑结构**

```
START → step1 → step2 → END
```

**执行流程**

```
invoke({ text: "hello" })
  │
  ├─ step1：接收 state.text = "hello"
  │          返回 { text: "hello -> step1" }
  │          reducer 覆盖，state.text = "hello -> step1"
  │
  ├─ step2：接收 state.text = "hello -> step1"
  │          返回 { text: "hello -> step1 -> step2" }
  │          reducer 覆盖，state.text = "hello -> step1 -> step2"
  │
  └─ END：返回最终 state
```

最终输出：

```js
result: { text: "hello -> step1 -> step2" }
```

**关键点**

- `StateAnnotation` 定义全局状态结构，`reducer: (_prev, next) => next` 表示新值直接覆盖旧值
- 每个节点只需返回要变更的字段，框架自动合并回 state
- `graph.getGraphAsync().drawMermaid()` 可将图拓扑序列化为 Mermaid 字符串，用于可视化，不影响执行

## 条件路由图

示例代码：`src/conditional-routing.mjs`

路由节点根据 state 内容决定下一步走哪条边，实现动态分支。

**拓扑结构**

```
START → router → (条件判断)
                  ├─ route === "math" → math → END
                  └─ route === "chat" → chat → END
```

**执行流程**

```
invoke({ query: "你好" })
  │
  ├─ router：query 不含 + - * /，返回 { route: "chat" }
  ├─ 条件边：state.route === "chat" → 走 chat 节点
  ├─ chatNode：返回 { answer: "你说的是：你好" }
  └─ END：{ query: "你好", route: "chat", answer: "你说的是：你好" }

invoke({ query: "10 * 8" })
  │
  ├─ router：query 含 *，返回 { route: "math" }
  ├─ 条件边：state.route === "math" → 走 math 节点
  ├─ mathNode：eval("10 * 8") = 80，返回 { answer: "80" }
  └─ END：{ query: "10 * 8", route: "math", answer: "80" }
```

**关键点**

- `addConditionalEdges(节点, 选择函数, 映射表)`：选择函数返回一个字符串 key，映射表决定该 key 对应哪个目标节点
- 路由逻辑写在普通节点（`router`）里，把结果写入 state；条件边只负责读 state 做分发，两者职责分离
- 多个分支最终都汇向 END，彼此互斥

## 循环重试图

示例代码：`src/loop-retry.mjs`

同一个节点可以通过条件边指回自身，形成循环，直到满足退出条件才流向 END。

**拓扑结构**

```
START → attempt → (条件判断)
                   ├─ ok === false → retry → attempt（循环）
                   └─ ok === true  → done  → END
```

**执行流程**

```
invoke({ tries: 0 })
  │
  ├─ attempt（第1次）：tries=1, ok=false → message="第1次失败，继续重试"
  │   条件边返回 "retry" → 回到 attempt
  │
  ├─ attempt（第2次）：tries=2, ok=false → message="第2次失败，继续重试"
  │   条件边返回 "retry" → 回到 attempt
  │
  ├─ attempt（第3次）：tries=3, ok=true  → message="第3次成功"
  │   条件边返回 "done" → END
  │
  └─ END：{ tries: 3, ok: true, message: "第3次成功" }
```

**关键点**

- 条件边的映射表中 `retry: "attempt"` 把目标指回当前节点自身，即构成循环
- 循环退出靠 state 中的字段（`ok`）驱动，节点每次执行都会更新它
- 文件中引入了 `MemorySaver` 但未使用，它的作用是为图添加持久化检查点，支持跨调用恢复 state（本例未启用）

## 检查点记忆图

示例代码：`src/checkpointer-memory.mjs`

用 `MemorySaver` 为图挂载检查点，每次 `invoke` 结束后自动保存 state。下次以相同 `thread_id` 调用时，从上次保存的 state 继续，而不是从默认值重新开始。不同 `thread_id` 的 state 完全隔离。

**拓扑结构**

```
START → recordVisit → END
```

**执行流程**

```
app.invoke({}, user1)  // thread_id = "用户-小张"，第1次
  ├─ 无历史 state，从默认值开始：visitCount=0
  ├─ recordVisit：visitCount=1，message="这是你在本会话里第 1 次进入。"
  └─ 保存检查点：{ visitCount: 1, ... }

app.invoke({}, user1)  // thread_id = "用户-小张"，第2次
  ├─ 从检查点恢复：visitCount=1
  ├─ recordVisit：visitCount=2，message="这是你在本会话里第 2 次进入"
  └─ 保存检查点：{ visitCount: 2, ... }

app.invoke({}, user1)  // thread_id = "用户-小张"，第3次
  ├─ 从检查点恢复：visitCount=2
  ├─ recordVisit：visitCount=3，message="这是你在本会话里第 3 次进入"
  └─ 保存检查点：{ visitCount: 3, ... }

app.invoke({}, user2)  // thread_id = "用户-小李"，第1次
  ├─ 无历史 state（独立 thread），从默认值开始：visitCount=0
  ├─ recordVisit：visitCount=1，message="这是你在本会话里第 1 次进入。"
  └─ 保存检查点：{ visitCount: 1, ... }
```

最终输出：

```js
{ visitCount: 1, message: '这是你在本会话里第 1 次进入。' }
{ visitCount: 2, message: '这是你在本会话里第 2 次进入' }
{ visitCount: 3, message: '这是你在本会话里第 3 次进入' }
{ visitCount: 1, message: '这是你在本会话里第 1 次进入。' }
```

**关键点**

- `graph.compile({ checkpointer })` 开启检查点，每次 invoke 后自动持久化 state
- `thread_id` 是会话隔离的 key，相同 thread_id 的多次调用共享同一份累积 state
- `invoke` 的第一个参数传 `{}` 而非初始 state，框架会自动用检查点里的 state 覆盖默认值
- `MemorySaver` 将 state 存在内存中，进程退出后丢失；生产环境可替换为数据库实现的 Saver

## 人工中断确认图

示例代码：`src/graph-interrupt.mjs`

图执行到某个节点时可以主动暂停，把控制权交回外部（人或上层系统），等收到 resume 信号后再从断点继续，实现「Human-in-the-loop」。

**拓扑结构**

```
START → showTransfer → waitConfirm → END
                            ↑
                       interrupt() 在此暂停
                       resume 后继续
```

**执行流程**

```
第一次 invoke({}, config)
  │
  ├─ showTransfer：写入 actionSummary = "向张三转账 ¥100"
  │
  ├─ waitConfirm：执行到 interrupt()，图立即暂停
  │   ├─ 检查点保存当前 state（thread_id = "interrupt-demo"）
  │   └─ 返回 { __interrupt__: [{ value: { hint, actionSummary } }] }
  │
  └─ 外部读取 __interrupt__，向用户展示待确认信息，等待终端输入

用户在终端输入确认文字，回车

第二次 invoke(new Command({ resume: line }), config)
  │
  ├─ 从检查点恢复，定位到 waitConfirm 节点的断点
  ├─ interrupt() 返回 resume 值（用户输入的文字）
  ├─ waitConfirm：写入 userInput = "<用户输入>"
  └─ END：{ actionSummary: "向张三转账 ¥100", userInput: "<用户输入>" }
```

**关键点**

- `interrupt(value)` 不是 JS 的 throw，而是框架内部机制：调用后图暂停、保存检查点，把 value 附在返回结果的 `__interrupt__` 字段里
- 暂停期间 state 已持久化到 `MemorySaver`，进程可以继续做其他事甚至等待很久
- 恢复时用 `new Command({ resume: <值> })` 代替普通 state 作为第一个参数，框架识别后从断点继续，`interrupt()` 的返回值即为 resume 传入的值
- 必须配合 `checkpointer` 使用，没有检查点无法保存断点位置

## 预置 ToolNode 图

示例代码：`src/prebuilt-tool-node.mjs`（工具数据：`src/inventory-mock.mjs`）

用 LangGraph 预置的 `ToolNode` 和 `toolsCondition` 搭建标准 ReAct Agent 循环：模型决定是否调工具，调完结果自动回填，再次交给模型，直到模型不再调工具为止。

**拓扑结构**

```
START → agent → toolsCondition
                  ├─ 有 tool_call → tools → agent（循环）
                  └─ 无 tool_call → END
```

**执行流程**

```
invoke({ messages: [HumanMessage("查一下 SKU-001 的库存…")] })
  │
  ├─ agent：LLM 判断需要查库存，返回含 tool_call 的 AIMessage
  │   messages 追加：[HumanMessage, AIMessage(tool_call)]
  │
  ├─ toolsCondition：检测到 AIMessage 含 tool_call → 走 tools 节点
  │
  ├─ tools（ToolNode）：执行 get_product_stock({ sku: "SKU-001" })
  │   → getProductBySku("SKU-001") 返回 { found:true, sku:"SKU-001", name:"无线鼠标", stock:42 }
  │   messages 追加：[ToolMessage(结果)]
  │
  ├─ agent：LLM 读取 ToolMessage，组织最终回答，返回普通 AIMessage
  │   messages 追加：[AIMessage("无线鼠标 SKU-001 当前库存 42 件")]
  │
  ├─ toolsCondition：AIMessage 无 tool_call → 走 END
  │
  └─ END：返回完整 messages 数组，取最后一条即为最终回答
```

**关键点**

- `MessagesAnnotation` 是 LangGraph 内置的消息状态，reducer 为数组追加（append），每次节点返回的 messages 自动拼在末尾，不会覆盖历史
- `ToolNode` 自动解析 AIMessage 中的所有 `tool_calls`，逐一执行对应工具函数，把结果包成 `ToolMessage` 追加到 state
- `toolsCondition` 检查最新一条 AIMessage 是否含 `tool_calls`，有则路由到 `tools`，无则路由到 `END`，是标准 ReAct 循环的固定搭配
- `llm.bindTools(tools)` 把工具 schema 注册到模型，模型才能输出合法的 tool_call 格式

## 预置 createAgent 图

示例代码：`src/prebuilt-agent.mjs`

上一个示例（prebuilt-tool-node）需要手动拼 `StateGraph`、挂 `ToolNode`、写 `toolsCondition`、配 `checkpointer`。`createAgent` 把这些全部封装好，只需声明模型、工具、系统提示和检查点，即可得到一个开箱即用的 ReAct Agent。

**与 prebuilt-tool-node 的对比**

| | prebuilt-tool-node | prebuilt-agent |
|---|---|---|
| 图结构 | 手动拼 StateGraph | createAgent 内部自动构建 |
| ToolNode | 手动 new ToolNode | 内部自动挂载 |
| toolsCondition | 手动 addConditionalEdges | 内部自动配置 |
| checkpointer | compile 时传入 | createAgent 参数直接传入 |
| bindTools | 手动 llm.bindTools | 内部自动处理 |

**执行流程**

```
agent.invoke({ messages: [HumanMessage("SKU-002 还剩多少库存？")] }, { thread_id })
  │
  ├─ agent 节点：LLM 判断需要查库存，返回含 tool_call 的 AIMessage
  │
  ├─ tools 节点：执行 get_product_stock({ sku: "SKU-002" })
  │   → { found:true, sku:"SKU-002", name:"机械键盘", stock:7 }
  │
  ├─ agent 节点：LLM 读取结果，返回最终回答
  │
  └─ END：返回完整 messages，最后一条为 "机械键盘 SKU-002 当前库存 7 件"
```

**关键点**

- `createAgent` 来自 `langchain` 包（非 `@langchain/langgraph`），是更高层的封装，内部仍基于 LangGraph 的 ReAct 图
- 传入 `checkpointer: new MemorySaver()` 后，多轮对话的历史消息会按 `thread_id` 自动保存和恢复，不需要手动管理
- `agent.graph` 暴露底层 StateGraph 实例，可用于调试（如导出 Mermaid）
- 适合快速接入场景；若需要自定义节点、条件分支或多 Agent 协作，仍应手动拼 StateGraph

## 多 Agent Supervisor 图

示例代码：`src/multi-agent-supervisor.mjs`（工具数据：`src/simple-mock.mjs`）

Supervisor 模式：一个调度 Agent 负责理解用户意图、决定把任务交给哪个子 Agent，子 Agent 各司其职只处理自己领域的问题。用户的一条消息可以依次触发多个子 Agent。

**拓扑结构**

```
START → supervisor → weather_agent → supervisor
                  ↘ trivia_agent  ↗          → END
```

supervisor 每次选完一个子 Agent 执行后，控制权回到 supervisor，再决定下一步是继续派发还是结束。

**执行流程**

以「查一下杭州的天气，再讲一条和杭州有关的小知识」为例：

```
invoke({ messages: [HumanMessage("查一下杭州的天气，再讲一条和杭州有关的小知识。")] })
  │
  ├─ supervisor：分析问题含「天气」→ 派给 weather_agent
  │
  ├─ weather_agent：
  │   ├─ LLM 判断需要查天气 → tool_call: lookup_weather({ city:"杭州" })
  │   ├─ 工具返回 { summary:"多云转小雨", tempHighC:22, tempLowC:15, aqi:"良" }
  │   └─ LLM 组织回答，追加 AIMessage
  │
  ├─ supervisor：天气已回答，问题还含「小知识」→ 派给 trivia_agent
  │
  ├─ trivia_agent：
  │   ├─ LLM 判断需要查小知识 → tool_call: lookup_city_trivia({ city:"杭州" })
  │   ├─ 工具返回 { trivia:"西湖文化景观是世界文化遗产之一。" }
  │   └─ LLM 组织回答，追加 AIMessage
  │
  ├─ supervisor：两个子任务均已完成 → 结束
  │
  └─ END：nodePath = supervisor → weather_agent → supervisor → trivia_agent → supervisor
```

**关键点**

- `createSupervisor` 来自 `@langchain/langgraph-supervisor`，接收子 Agent 的 `.graph` 实例，内部为每个子 Agent 生成一个可调用的 tool，supervisor LLM 通过 tool_call 来派发任务
- supervisor 本身不直接回答业务问题，只负责路由；子 Agent 也不感知彼此，只处理自己的工具
- 子 Agent 执行完毕后控制权自动回到 supervisor，supervisor 可以继续派发或输出 `FINISH` 结束整个图
- `app.stream({ streamMode: ["updates","values"] })` 同时接收两种事件：`updates` 记录每步经过的节点名，`values` 拿到最新完整 state，两者配合可追踪完整执行路径

**流式事件结构说明**

`streamMode` 同时传 `"updates"` 和 `"values"` 时，每次 `for await` 拿到的 `event` 是一个二元组 `[mode, payload]`：

```
event = ["updates", { supervisor: { messages: [...] } }]
         ──────────  ────────────────────────────────────
         模式标识     本步更新的内容，key 是刚执行的节点名

event = ["values", { messages: [...所有消息...] }]
         ─────────  ──────────────────────────────
         模式标识   执行到当前为止的完整 state 快照
```

代码逻辑分解：

```js
for await (const event of stream) {
  const [mode, payload] = event;               // 解构出模式和数据

  if (mode === "updates") {
    nodePath.push(...Object.keys(payload));     // payload 的 key 就是本步执行的节点名
                                               // 如 "supervisor"、"weather_agent"
  } else if (mode === "values") {
    finalState = payload;                      // 每次都覆盖，循环结束后即为最终完整 state
  }
}
```

两种模式的用途不同：

| 模式 | payload 含义 | 用来做什么 |
|------|-------------|-----------|
| `updates` | 本步哪些节点执行了、更新了什么 | 追踪执行路径、调试节点顺序 |
| `values` | 当前完整 state | 获取最终消息、监控中间状态 |

循环结束后：`nodePath` 记录了所有节点的执行顺序，`finalState.messages.at(-1)` 取最后一条消息即为最终回答。
