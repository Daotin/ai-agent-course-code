## 什么是RAG？

RAG 就是：用户问了个问题，你先去知识库里把相关的文档片段捞出来，塞到 prompt 里当背景知识，再让大模型基于这些内容来回答——检索（Retrieval）、增强（Augmented）、生成（Generation）。

为什么需要这个？大模型训练完之后知识就冻住了，你问它最新的事、问它公司内部的文档，它不知道，但它不会说"我不知道"，而是一本正经地瞎编，这就是幻觉。RAG 就是解决幻觉的核心手段。


## 怎么查出来的？

这是个好问题——用户问了"水果相关信息"，你怎么把苹果、香蕉、草莓的文档捞出来？关键词搜索显然不行，"水果"这个词在苹果的文档里可能压根没出现过。

所以要用向量做语义搜索。

每个概念都可以用一组数字（向量）来表示它在各个维度上的特征。比如按"食用性"和"硬度"两个维度来看：水果是 [0.9, 0.3]，苹果是 [0.9, 0.5]，石头是 [0.1, 0.9]。画出来你一眼就能看到，水果和苹果挨得很近，和石头离得很远。

怎么量化这个"远近"？用余弦相似度，就是算两个向量夹角的余弦值，夹角越小说明越相似。实际的向量当然不止两维，可能几百维，但原理一模一样。

那怎么知道一个概念的向量值呢？这就需要嵌入模型（Embedding Model）了。它和我们平时用的大语言模型不一样，它的功能就一件事：把文本（也可以是图片、语音）转成向量。写代码的时候我们会用专门的嵌入模型，比如阿里的 text-embedding-v3，费用比大模型便宜很多。


## 整个RAG流程

先说准备阶段：把你的知识库文档，通过嵌入模型全部转成向量，存进向量数据库。每条向量的元信息里会记录它对应的原始文档内容。

再说查询阶段：用户的问题进来后，同样通过嵌入模型转成向量，然后拿这个向量去向量数据库里做余弦相似度检索，找到最相似的几个文档片段（比如 top 3），把这些片段塞进 prompt 作为背景知识，最后交给大模型生成回答。

```
知识库文档 → 嵌入模型 → 向量 → 存入向量数据库
                                        ↑
用户提问 → 嵌入模型 → 向量 → 相似度检索 → 取出 top K 文档片段
                                                    ↓
                              原始 prompt + 文档片段 → 大模型 → 生成回答
```

代码层面，用 LangChain 来做的话其实很简单：`MemoryVectorStore.fromDocuments` 把文档向量化存入数据库，`asRetriever({ k: 3 })` 指定返回最相似的 3 个文档，`retriever.invoke(question)` 执行检索，拿到文档后拼进 prompt 给大模型就完事了。

---

## Loader 和 Splitter

先说个最直观的问题：我们做 RAG 的时候，原始数据可能是 PDF、网页、CSV、Markdown 各种格式，而且往往很长，大模型的上下文窗口塞不下，也不利于检索精度。怎么办？这就是 Loader 和 Splitter 要解决的事。

**Loader** 负责"加载"，把各种格式的原始文件读进来，统一转成 LangChain 的 `Document` 对象。你可以理解为一个格式转换器——不管你原来是 PDF、网页还是 Excel，Loader 都给你变成统一的文本 + 元数据的结构，方便后续处理。

**Splitter** 负责"切分"，把 Loader 加载进来的长文本按某种策略切成小块（chunk）。为什么要切？因为 embedding 模型和大模型都有 token 上限，而且检索时块太大会夹带无关信息，太小又会丢失上下文。所以怎么切、切多大，直接影响 RAG 的效果。

整个数据流大概是这样：

```
原始文件(PDF/网页/CSV...)
       ↓  Loader
  Document 对象(统一格式)
       ↓  Splitter
  小块 Document 列表
       ↓  Embedding
    向量数据库
```

项目代码 `loader-and-splitter.mjs` 里就是这个典型流程：先用 `CheerioWebBaseLoader` 把网页抓下来变成 Document，再用 `RecursiveCharacterTextSplitter` 切成小块。


## 常见 Loader

LangChain 提供了大量 Loader，覆盖各种数据源。常用的几类：

**文件类**——`TextLoader` 读纯文本、`PDFLoader` 读 PDF、`CSVLoader` 读 CSV、`DocxLoader` 读 Word 文档、`JSONLoader` 读 JSON。

**网页类**——`CheerioWebBaseLoader` 用 Cheerio 解析网页 HTML 提取文本，项目里用的就是这个；还有 `PuppeteerWebBaseLoader` 能处理需要 JS 渲染的动态页面。

**其他**——`NotionLoader` 读 Notion 导出数据、`GitbookLoader` 读 GitBook 文档、`DirectoryLoader` 批量加载一个目录下的多种文件。

选哪个 Loader 取决于你的数据源格式，没什么复杂的，对号入座就行。


## 常见 Splitter 及对比

这是重点。LangChain 提供了好几种 Splitter，我们来逐个看它们怎么切、区别在哪。

### CharacterTextSplitter

最朴素的方式：指定一个分隔符（默认是 `\n\n`，也就是双换行），按这个分隔符劈开文本。项目里的测试代码设置的 `separator` 是 `" "`（空格），按空格切。

核心参数就两个：`chunkSize`（每块最大字符数）和 `chunkOverlap`（相邻两块之间重叠的字符数，用来保留上下文连续性）。

问题是什么？它**只认一个分隔符**。如果你指定按 `\n\n` 切，但文本里根本没有双换行，那它就切不动，整段文本原封不动返回。或者切出来的块有的很大有的很小，不均匀。实际项目中，这种"一刀切"的方式太粗糙了。

### RecursiveCharacterTextSplitter

这是 LangChain 官方最推荐的 Splitter，也是绝大多数场景的首选。

它跟 `CharacterTextSplitter` 的核心区别是什么？它不只认一个分隔符，而是维护一个**分隔符优先级列表**，默认是 `["\n\n", "\n", " ", ""]`。切的时候先试最大粒度的 `\n\n`，切完如果某块还是超过 `chunkSize`，就用下一级 `\n` 继续切，还大就用空格切，实在不行就按单个字符切。

这种"递归降级"的策略好处很明显：**尽可能保留语义完整性**。它优先按段落切，段落太长才按句子切，句子太长才按词切。这比固定一个分隔符灵活太多了。

而且它还针对不同文件格式预设了专用的分隔符列表。项目里就有三个例子：

- `RecursiveCharacterTextSplitter.fromLanguage("js")` 按 JavaScript 代码结构切，分隔符列表是函数声明、类声明、if/for 语句这些代码边界
- `RecursiveCharacterTextSplitter.fromLanguage("markdown")` 按 Markdown 标题层级切，优先按 `#`、`##`、`###` 这些标题分隔
- `RecursiveCharacterTextSplitter.fromLanguage("latex")` 按 LaTeX 环境切，优先按 `\section`、`\begin` 这些结构分隔

也就是说，**一个 RecursiveCharacterTextSplitter 就能搞定几乎所有格式**——通用文本用默认分隔符列表，特定格式调用 `fromLanguage` 拿到专用列表。课件标题说的"全部 Splitter 其实只需要一个"，指的就是它。

### TokenTextSplitter

前面两个 Splitter 都是按**字符数**算 chunkSize 的。但大模型实际消耗的是 token，字符数和 token 数并不等价。项目里 `tiktoken-test.mjs` 就演示了这个差异——英文 "apple" 是 1 个 token，"pineapple" 是 2 个 token，中文"苹果"是 2 个 token，"一二三"是 3 个 token。

`TokenTextSplitter` 就是按 **token 数**来切分的。它先用 tiktoken 把文本编码成 token 序列，按 token 数量切块，再解码回文本。好处是切出来的每个块的 token 数量是精确可控的，不会出现"字符数没超但 token 数超了"的情况。

什么时候用它？当你需要精确控制每个 chunk 的 token 数（比如要严格匹配 embedding 模型的 token 限制），或者处理中文等非拉丁文本时，按 token 切比按字符切更准确。但缺点是它不考虑语义边界，纯粹按 token 数量机械切割，可能把一句话切到两个块里。

### 三者对比总结

`CharacterTextSplitter` 只认一个分隔符，简单但粗糙，实际项目基本不用。`RecursiveCharacterTextSplitter` 多级分隔符递归降级，兼顾语义完整性和块大小控制，是默认首选。`TokenTextSplitter` 按 token 精确切割，适合对 token 数有严格要求的场景，但牺牲了语义连贯性。

实际工程里，90% 的场景直接用 `RecursiveCharacterTextSplitter` 就够了。需要处理特定格式就调用 `fromLanguage` 获取对应的分隔符列表。只有当你必须精确控制 token 数量时，才考虑 `TokenTextSplitter`。

---

