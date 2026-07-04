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