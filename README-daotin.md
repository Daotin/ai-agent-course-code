拉别人更新：git fetch upstream && git merge upstream/main

推送自己改动：正常 git push（默认推到 origin）

---

模型列表：

- qwen3.6-flash-2026-04-16
- qwen3.5-plus-2026-04-20
- deepseek-v4-flash
- qwen3.6-35b-a3b
- qwen3.7-plus
- glm-5.1

- qwen3.7-max-2026-05-17
- qwen3.7-max-2026-06-08
- qwen3.7-max-preview

---

python3 ~/Documents/daotin-code/pdf2md/pdf2md.py ../-courseware/实现\ mini\ cursor：大模型自动调用\ tool\ 执行命令.pdf


---

请根据项目代码和课件资料，回答问题到项目的note.md（如果不存在则创建）
- 什么是RAG？用一句话来表示。
- 怎么查出来的？用什么方法？原理是什么？怎么知道一个概念的向量值呢？
- 整个RAG的流程是怎样的？

输出约束：/Users/fengdaoting/Documents/daotin-code/ai-agent-course-code/prompt.md

参考资料：
- 课件文档：/Users/fengdaoting/Documents/daotin-code/ai-agent-course-code/-courseware/RAG：把文档向量化，基于向量实现真正的语义搜索.md
- 项目路径：/Users/fengdaoting/Documents/daotin-code/ai-agent-course-code/-daotin/2-rag/rag-test


---

## AI Agent开发到底学什么？

AI不管如何发展，它总是有一些问题需要解决的。比如需要加记忆Memory能力，然后专业领域的调用能力，就是就要加Tools。然后还有一些知识库查询，需要RAG技术。这就是AI Agent的开发能力。

Agent是什么？就是大模型它本来就可以思考，然后你给它加了这些能力之后。它就可以自己来做事情了。相当于你给大脑来装了一些外挂，让它知道一些内部知识，有更好的一个记忆，然后通过Tools去操作一些东西。

那这些Memory、Tools、RAG技术要用什么框架呢？

最常用的就是Langchain。他们对这些技术做了一个API封装，可以直接调用。

但是涉及到多个Agent协作的话，就需要LangGraph了。

所以这门课程主要是通过Langchain、LangGraph来开发各种AI Agent的。

又因为大多数AI的执行是在后端运行的。所以学后端的技术也是很必要的。

总结：

- 本课程聚焦AI Agent开发，核心能力包括Memory（记忆）、Tools（工具调用）和RAG（知识检索）。
- 常用框架为LangChain（封装Agent能力）与LangGraph（支持多Agent协作）。
- 实际应用多在后端运行，因此掌握后端技术同样重要。


## 学习路线图

### AI Agent第一阶段：基础知识

- [ ] Tools学习
  - [ ] 从tools开始，让大模型能够读写文件。
  - [ ] 实现mini cursor。
  - [ ] 可跨进程调用的tools：实现MCP
  - [ ] 使用别人的tools：比如高德MCP，浏览器MCP。
- [ ] RAG
  - [ ] RAG的demo。基于向量的语义搜索。
  - [ ] 支持各种文档的搜索和拆分，Loader和Splitter
  - [ ] 向量数据库Milvus
  - [ ] Milvus加RAG实战，实现电子书搜索。
- [ ] Memory
  - [ ] Memory管理的三大策略。
- [ ] chain的结构化输出，Prompt管理，流程组装
  - [ ] 结构化大模型输出。Output parser
  - [ ] Prompt template 组件化管理Prompt
  - [ ] Runnable.
  - [ ] LCEL组装chain

### AI Agent第二阶段：加入后端，实战延伸

- [ ] 加入后端，实战延伸
  - [ ] Langchain加Nest实现SSE流式输出。
  - [ ] 实现OpenClaw同款定时功能。
  - [ ] 给Agent加上ASR语音输出。
  - [ ] 使用Vercel AI SDK实现流式输出组件。
- [ ] LangGraph
  - [ ] 基于LangGraph实现大模型自主决策RAG闭环系统
  - [ ] Elasticsearch全文检索。
  - [ ] 混合检索RAG。
  - [ ] Neo4j知识图谱。
  - [ ] LangSmith全链路监测。

