import "dotenv/config";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

/**
 * StateAnnotation 声明图的全局状态只有一个字段 text，
 * reducer 设为 (_prev, next) => next，意思是每次节点返回新值时直接覆盖旧值（不做合并）。
 */
const StateAnnotation = Annotation.Root({
  text: Annotation({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
});

// 每个节点接收当前 state，返回要更新的字段。返回值会经过 reducer 合并回 state。
const step1 = (state) => ({ text: `${state.text} -> step1` });
const step2 = (state) => ({ text: `${state.text} -> step2` });

const graph = new StateGraph(StateAnnotation)
  .addNode("step1", step1)
  .addNode("step2", step2)
  .addEdge(START, "step1")
  .addEdge("step1", "step2")
  .addEdge("step2", END)
  .compile();

// 导出为 Mermaid：可复制到 https://mermaid.live 或 Markdown 的 ```mermaid 代码块
const drawable = await graph.getGraphAsync();
const mermaid = drawable.drawMermaid({ withStyles: true });
console.log(mermaid);

/**
 * invoke({ text: "hello" })
  │
  ├─ 进入 step1：state.text = "hello"
  │   返回 { text: "hello -> step1" }
  │   reducer 覆盖：state.text = "hello -> step1"
  │
  ├─ 进入 step2：state.text = "hello -> step1"
  │   返回 { text: "hello -> step1 -> step2" }
  │   reducer 覆盖：state.text = "hello -> step1 -> step2"
  │
  └─ 到达 END，返回最终 state

 */
const result = await graph.invoke({ text: "hello" });
console.log("result:", result);
