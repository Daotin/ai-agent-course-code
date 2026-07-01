# LCEL：LangChain 的声明式编排方式

## 一、LCEL 是什么？

LCEL（LangChain Expression Language）是 LangChain 提供的一种**声明式的组件编排方式**。

它的核心思想是：**把 AI 应用中的每个步骤（提示词、模型、解析器、工具……）都看成一个统一的"Runnable 组件"，然后像搭积木一样把它们组合起来。**

你不需要手动写"先调这个、再调那个、然后把输出传给下一个"，只需要声明"这些组件按这个顺序排列"，LangChain 自动帮你处理数据流转。

---

## 二、没有 LCEL 之前是什么样的？

看 `src/before.mjs`，这是传统写法：

```js
// 步骤 1：手动格式化 prompt
const promptValue = await promptTemplate.invoke({ subject });

// 步骤 2：手动调用模型
const response = await model.invoke(promptValue);

// 步骤 3：手动解析输出
const result = await outputParser.invoke(response);
```

三个步骤，三次手动调用，每次都要手动把上一步的输出传给下一步。

问题显而易见：
- 步骤一多就很啰嗦
- 每换一个组件就要改调用代码
- 不好复用，不好测试，不好扩展

---

## 三、LCEL 写法：声明式管道

看 `src/runnable.mjs`，改成 LCEL：

```js
const chain = RunnableSequence.from([
  promptTemplate,
  model,
  outputParser,
]);

const result = await chain.invoke({ subject });
```

三个组件"串"成一条链，`invoke` 一次，数据自动从头流到尾。

**类比理解：** 就像 Linux 的管道命令 `cat file | grep keyword | wc -l`，每个步骤的输出自动成为下一步的输入。

---

## 四、核心知识点：所有 Runnable 类型

### 1. RunnableLambda — 把普通函数变成 Runnable

```js
const addOne = RunnableLambda.from((x) => x + 1);
const chain = RunnableSequence.from([addOne, multiplyTwo, addOne]);
await chain.invoke(5); // 5+1=6 → 6*2=12 → 12+1=13
```

任何普通函数都可以包装进来，参与链式调用。

---

### 2. RunnableSequence — 串行管道（最常用）

```js
const chain = RunnableSequence.from([A, B, C]);
// 等价于：A的输出 → B → C的输出
```

这是 LCEL 最基础的用法，A/B/C 可以是任意 Runnable。

---

### 3. RunnableMap — 并行处理多个字段

```js
const map = RunnableMap.from({
  summary: summaryChain,
  keywords: keywordsChain,
  sentiment: sentimentChain,
});

const result = await map.invoke({ text: "..." });
// result = { summary: "...", keywords: [...], sentiment: "positive" }
```

多个 Runnable **同时执行**（互不依赖），结果合并成一个对象。

---

### 4. RunnableBranch — 条件分支

```js
const branch = RunnableBranch.from([
  [(x) => x > 0, handlePositive],
  [(x) => x < 0, handleNegative],
  handleZero, // 默认分支
]);
```

根据条件走不同的处理逻辑，类似 if/else，但以声明式表达。

示例见 `src/runnables/RunnableBranch.mjs`，以及 `src/cases/mcp-test.mjs` 中用它来判断"LLM 是否要调用工具"。

---

### 5. RunnablePassthrough — 数据透传 / 扩展

```js
// 用法1：直接透传原始输入，不做任何修改
RunnablePassthrough

// 用法2：在透传的同时，扩展新字段
RunnablePassthrough.assign({
  context: retrieverChain,  // 新增 context 字段
})
```

在 RAG 场景中非常常见：原始问题透传 + 检索结果一起送给 LLM。

示例见 `src/runnables/RunnablePassthrough.mjs`。

---

### 6. RunnableEach — 对数组批量处理

```js
const chain = new RunnableEach({ bound: processItem });
await chain.invoke(["alice", "bob", "carol"]);
// 对每个元素分别执行 processItem，返回数组
```

示例见 `src/runnables/RunnableEach.mjs`。

---

### 7. RunnablePick — 提取指定字段

```js
new RunnablePick(["name", "age"])
// 输入对象中只保留 name 和 age，其余字段丢弃
```

适合在链中间裁剪数据，避免无关字段污染后续步骤。

示例见 `src/runnables/RunnablePick.mjs`。

---

### 8. RouterRunnable — 动态路由

```js
const router = new RouterRunnable({
  runnables: {
    translate: translateChain,
    summarize: summarizeChain,
  }
});

await router.invoke({ key: "translate", input: "hello" });
// 根据 key 动态选择执行哪个 Runnable
```

示例见 `src/runnables/RouterRunnable.mjs`。

---

### 9. 修饰型 Runnable（增强现有 Runnable 的能力）

这四个是"包装器"，套在任何 Runnable 外面，增加额外能力：

#### withRetry — 失败自动重试

```js
const safe = unstableRunnable.withRetry({ stopAfterAttempt: 5 });
// 失败最多重试 5 次
```

示例见 `src/runnables/RunnableWithRetry.mjs`。

#### withFallbacks — 优雅降级

```js
const translator = premium.withFallbacks({
  fallbacks: [standard, local],
});
// premium 失败 → standard → local
```

示例见 `src/runnables/RunnableWithFallbacks.mjs`。

#### withConfig — 绑定运行时配置

```js
const chain = myChain.withConfig({
  configurable: { userId: "123", locale: "zh-CN" }
});
// 链内所有步骤都可以读取这些配置
```

示例见 `src/runnables/RunnableWithConfig.mjs`。

#### withCallbacks — 执行过程监听

```js
await chain.invoke(input, {
  callbacks: [{
    handleChainStart: (chain) => console.log("开始:", chain),
    handleChainEnd: (output) => console.log("结束:", output),
  }]
});
```

用于日志、监控、调试，不影响主流程。示例见 `src/runnables/RunnableWithCallbacks.mjs`。

---

### 10. RunnableWithMessageHistory — 自动管理对话历史

```js
const chain = new RunnableWithMessageHistory({
  runnable: myChain,
  getMessageHistory: (sessionId) => getHistory(sessionId),
  inputMessagesKey: "question",
  historyMessagesKey: "history",
});

await chain.invoke(
  { question: "我叫小明" },
  { configurable: { sessionId: "user-001" } }
);

await chain.invoke(
  { question: "我叫什么名字？" },
  { configurable: { sessionId: "user-001" } }
);
// 自动携带上轮对话，LLM 能回答"你叫小明"
```

不需要手动维护消息列表，框架自动追加历史。示例见 `src/runnables/RunnableWithMessageHistory.mjs`。

---

## 五、如何把硬编码流程改成 LCEL？

下面用一个具体例子演示改造过程。

### 场景：RAG 问答流程

**改造前（命令式、硬编码）：**

```js
async function ragAnswer(question) {
  // 步骤1：向量检索
  const docs = await vectorStore.similaritySearch(question, 4);
  
  // 步骤2：拼接上下文
  const context = docs.map(d => d.pageContent).join("\n");
  
  // 步骤3：构建 prompt
  const promptValue = await promptTemplate.invoke({ question, context });
  
  // 步骤4：调用模型
  const response = await model.invoke(promptValue);
  
  // 步骤5：解析输出
  const answer = await outputParser.invoke(response);
  
  return answer;
}
```

**改造后（LCEL 声明式）：**

```js
const ragChain = RunnableSequence.from([
  RunnablePassthrough.assign({
    context: RunnableLambda.from(async ({ question }) => {
      const docs = await vectorStore.similaritySearch(question, 4);
      return docs.map(d => d.pageContent).join("\n");
    }),
  }),
  promptTemplate,
  model,
  outputParser,
]);

const answer = await ragChain.invoke({ question });
```

**改造思路三步走：**

1. **识别步骤**：找出流程中有几个独立步骤
2. **包装成 Runnable**：每个步骤用合适的 Runnable 类型表达
   - 普通函数 → `RunnableLambda.from(fn)`
   - 需要透传+扩展数据 → `RunnablePassthrough.assign({ ... })`
   - 顺序执行 → `RunnableSequence.from([...])`
   - 并行处理 → `RunnableMap.from({ ... })`
   - 条件分支 → `RunnableBranch.from([...])`
3. **组合链**：用 `RunnableSequence.from` 或 `.pipe()` 串联

---

## 六、LCEL 的核心价值总结

| 维度 | 硬编码 | LCEL |
|---|---|---|
| 可读性 | 流程散落在函数调用里 | 一眼看清数据流向 |
| 可复用 | 难以复用局部步骤 | 每个 Runnable 可独立复用 |
| 可扩展 | 加步骤要改核心逻辑 | 插入/替换组件不影响其他 |
| 流式输出 | 需要手动实现 | `.stream()` 开箱即用 |
| 错误处理 | 每处手写 try/catch | `withRetry`/`withFallbacks` 统一处理 |
| 可观测 | 手动埋点 | `withCallbacks` 统一监听 |

LCEL 不是魔法，它只是把"写死的流程控制代码"替换成了"可组合的数据管道声明"。理解了这一点，再复杂的 Agent 流程都能清晰地用它表达出来。
