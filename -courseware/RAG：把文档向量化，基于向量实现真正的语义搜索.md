RAG：把文档向量化，基于向量实现真正的语义搜索已付费
神说要有光zxg
2025年12月29日 23:55 山东
原创
神光的幸福生活
69人
大模型所知道的知识，取决于在训练的时候给它的数据集。
如果你问它最近发生的事情，或者你企业内部私有文档的一些事情，它是不知道的。
但它很可能不会说自己不知道，而是会胡乱回答，也就是所谓的幻觉（以为自己知道）。
如何解决大模型的幻觉呢？
其实也很容易想到：
用户要查询的内容，我们先去内部知识库里查一下，把它放到 prompt 里再给大模型。
这样大模型通过这些文档知道了背景知识，就可以回答响应的问题了。
这就是 RAG：
Retrieval 检索 - Augmented 增强 - Generation 生成
去知识库里检索用户问的知识的相关文档片段，作为背景知识加到 prompt 里增强它，让大
模型根据这些来生成回答。
这个是很容易想到的思路，也是很贴切的名字。
但有个问题：

用户问了一个问题，你怎么把相关的文档片段查出来呢？
比如用户查水果的信息，你要把苹果、香蕉、草莓的相关文档查出来。
想想怎么做？
关键词搜索可以么？
很明显不行。
这种语义搜索就需要向量（Vector）了。
比如如果按照两个维度存储信息，分为可食用性、硬度：
维度 1： 食用性（0 = 无，1 = 高）
维度 2： 硬度（0 = 软/液体，1 = 硬）
那这几个概念大概是这样的向量：
水果：[0.9, 0.3] 极高食用性，中低硬度
苹果：[0.9, 0.5] 高食用性，硬度适中
香蕉：[0.9, 0.1] 高食用性，非常软
石头：[0.1, 0.9] 几乎不可食用，非常硬
可视化一下是这样：

明显可以看出来，苹果、水果、香蕉，这三个概念相关性很大，而水果和石头相关性就不
大。
计算的话，可以通过夹角判断相似度，夹角越小相似度越高：
也就是余弦相似度（两个向量夹角的余弦值）。
当然，具体的向量数据肯定不会只有二维，可能会是几百维。
虽然高纬度没法可视化，但是原理是一样的。
我们都是通过两个概念对应的向量的余弦相似度来判断相关性。
也就是说通过向量计算实现语义检索！
是不是很巧妙！
这就是为啥 RAG 一般都结合向量化来做，虽然基于关键词来做也是 RAG，但是那种没法语
义搜索，意义不大。
有的同学可能会问，那给你一个概念，怎么计算它的向量值呢？
这个需要用到专门的模型，叫嵌入模型（Embedding Model）。
它和大语言模型（LLM）是不一样的，它的功能就只有把知识转成向量。

这个知识可以是文本、图片、语音等，向量化之后，就都可以实现语义搜索了！
我们写代码会用专门的嵌入模型，收费比大模型便宜很多很多。
那加上向量化之后的 RAG 流程是什么样的呢？
用户的 prompt 会通过嵌入模型转成向量，然后 retriever 基于这个向量去向量数据库中检
索，找到相似的向量，把对应的文档块返回，加到 prompt 里作为背景知识，给大模型。
存的不是向量么？怎么记录向量关联的文档？
文档在向量化的时候，会在向量的元信息里记录来源文档。
综上，我们可以在原始 prompt 给到大模型之前，查询下知识库，把相关的文档作为背景知
识加入到 Prompt 里，再让大模型回答，这就是 RAG。
RAG 要实现语义查询，需要基于向量来做，把文档向量化存储到向量数据库，查询的时候
也把 Prompt 向量化，去数据库中做相似度检索，这样就可以找到语义相近的文档块。

知道了什么是 RAG，我们来写代码试一下：
```
mkdir rag-test
cd rag-test
npm init -y
```

进入项目，安装下依赖：
```
pnpm install @langchain/core @langchain/openai dotenv
```

创建 src/hello-rag.mjs
```
import "dotenv/config";
import { ChatOpenAI, OpenAIEmbeddings } from"@langchain/openai";
import { Document } from"@langchain/core/documents";
import { MemoryVectorStore } from"@langchain/classic/vectorstores/memory";
const model = new ChatOpenAI({
temperature: 0,
model: process.env.MODEL_NAME,
apiKey: process.env.OPENAI_API_KEY,
configuration: {
baseURL: process.env.OPENAI_BASE_URL,
},
});
```

```
const embeddings = new OpenAIEmbeddings({
apiKey: process.env.OPENAI_API_KEY,
model: process.env.EMBEDDINGS_MODEL_NAME,
configuration: {
baseURL: process.env.OPENAI_BASE_URL
},
});
const documents = [
new Document({
pageContent: `光光是一个活泼开朗的小男孩，他有一双明亮的大眼睛，总是带着灿烂的笑容。光光最喜欢的事情
metadata: {
chapter: 1,
character: "光光",
type: "角色介绍",
mood: "活泼"
},
}),
new Document({
pageContent: `东东是光光最好的朋友，他是一个安静而聪明的男孩。东东喜欢读书和画画，他的画总是充满了想
metadata: {
chapter: 2,
character: "东东",
type: "角色介绍",
mood: "温馨"
},
}),
new Document({
pageContent: `有一天，学校要举办一场足球比赛，光光非常兴奋，他邀请东东一起参加。但是东东从来没有踢过
metadata: {
chapter: 3,
character: "光光和东东",
type: "友情情节",
mood: "鼓励",
},
}),
new Document({
pageContent: `接下来的日子里，光光每天放学后都会教东东踢足球。光光耐心地教东东如何控球、传球和射门，
metadata: {
chapter: 4,
character: "光光和东东",
type: "友情情节",
mood: "互助",
},
}),
new Document({
```

```
pageContent: `比赛那天终于到了，光光和东东一起站在球场上。虽然东东的技术还不够熟练，但他非常努力，而
metadata: {
chapter: 5,
character: "光光和东东",
type: "高潮转折",
mood: "激动",
},
}),
new Document({
pageContent: `从那以后，光光和东东成为了学校里最要好的朋友。光光教东东运动，东东教光光画画，他们互相
metadata: {
chapter: 6,
character: "光光和东东",
type: "结局",
mood: "欢乐",
},
}),
new Document({
pageContent: `多年后，光光成为了一名职业足球运动员，而东东成为了一名优秀的插画师。虽然他们走上了不同
metadata: {
chapter: 7,
character: "光光和东东",
type: "尾声",
mood: "温馨",
},
}),
];
const vectorStore = await MemoryVectorStore.fromDocuments(
documents,
embeddings,
);
const retriever = vectorStore.asRetriever({ k: 3 });
const questions = [
"东东和光光是怎么成为朋友的？"
];
for (const question of questions) {
console.log("=".repeat(80));
console.log(`问题: ${question}`);
console.log("=".repeat(80));
// 使用 retriever 获取文档
const retrievedDocs = await retriever.invoke(question);
```

```
// 使用 similaritySearchWithScore 获取相似度评分
const scoredResults = await vectorStore.similaritySearchWithScore(question, 3);
// 打印用到的文档和相似度评分
console.log("\n【检索到的文档及相似度评分】");
retrievedDocs.forEach((doc, i) => {
// 找到对应的评分
const scoredResult = scoredResults.find(([scoredDoc]) =>
scoredDoc.pageContent === doc.pageContent
);
const score = scoredResult ? scoredResult[1] : null;
const similarity = score !== null ? (1 - score).toFixed(4) : "N/A";
console.log(`\n[文档 ${i + 1}] 相似度: ${similarity}`);
console.log(`内容: ${doc.pageContent}`);
console.log(`元数据: 章节=${doc.metadata.chapter}, 角色=${doc.metadata.character}, 类型=
});
// 构建 prompt
const context = retrievedDocs
.map((doc, i) =>`[片段${i + 1}]\n${doc.pageContent}`)
.join("\n\n━━━━━\n\n");
const prompt = `你是一个讲友情故事的老师。基于以下故事片段回答问题，用温暖生动的语言。如果故事中没有提到
故事片段:
${context}
问题: ${question}
老师的回答:`;
console.log("\n【AI 回答】");
const response = await model.invoke(prompt);
console.log(response.content);
console.log("\n");
}
```

安装下用到的包：
```
pnpm install @langchain/classic
```

这里我们用到了大语言模型 LLM，还有嵌入模型 OpenAIEmbeddings

具体的 model name 在 .env 里配置下：
```
# OpenAI API 配置
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
MODEL_NAME=qwen-plus
EMBEDDINGS_MODEL_NAME=text-embedding-v3
```

这几个 Document 比较容易理解。这个故事直接问大模型，显然它是不知道的：

知识库里存的就是这些文档，可以加一些元数据。
用嵌入模型把这些文档向量化之后存入向量数据库。
并且返回一个 retriever，k 是 3 就是返回余弦相似度最大的 3 个 Document。

用 retriever 把 query 传入，通过向量的余弦相似度，找到语义最相关的 3 个文档片段，传
入 prompt：
这就是增强后的 Prompt 了，之后问大模型问题的时候，它就有背景知识了。
跑一下：

可以看到，根据你的问题，查询到了 3 个文档，然后大模型基于这些做了回答。
这样我们就跑通了 RAG 的流程！
回过头来再看下这张图：
是不是就很清楚了！
我们对 query 通过嵌入模型向量化，然后查询出了余弦相似度最大的 3 个文档，用它增强
Prompt 后再问大模型，大模型基于这个生成回答。
这就是 RAG。
代码上传了课程仓库： https://github.com/QuarkGluonPlasma/ai-agent-course-code
总结

大模型训练完后，知识就不再更新了，它没法知道最新的一些信息，以及一些非互联网上公
开的信息。
所以对于它不知道的东西，会胡乱回答，也就是幻觉问题。
解决这个问题的方式就是 RAG。
RAG 是检索、增强、生成，会基于用户的 query 去检索知识库，拿到相关文档后放到
Prompt 里增强它，之后给大大模型来生成回答。
检索肯定是要语义检索，但是关键词检索做不到这点，我们需要用向量来做，通过嵌入模型
把知识向量化，这样就可以通过向量的余弦相似度（也就是夹角大小）来计算出两个知识的
相关性，从而根据用户的 query 查询出相关的文档。
我们基于 LangChain 写了 RAG 的代码：
fromDocuments api 基于 embeddings 模型把文档向量化存入数据库。
asRetriever 指定查询相似度最大的几个文档。
similaritySearchWithScore 相似度评分
retriever.invoke 来查询文档。
只要你理解了 RAG 的流程，这些 api 自然也就会用了。
想一下，如果你要做公司内部文档的智能助手，是不是就可以用 RAG 来实现呢？
3167 人付费
转型 Agent 全栈工程师：企业级知识库项目 · 目录
上一篇
高德 MCP + 浏览器 MCP：LangChain 复用
别人的 MCP Server 有多爽！
下一篇
知识库的 loader 和 splitter：从各种来源加
载文档并分割成小块

修改于2025年12月30日
留言 66
Ink 广东1月17日
神光的幸福生活作者1月17日
stanny的音乐…
上海1月19日
太阳骑士四川2025年12月31日
神光的幸福生活作者2025年12月31日
曾忆城。福建2月26日
ZERO羽炎北京2月3日
神光的幸福生活作者2月3日
写留言
const similarity = score !== null ? (1 - score).toFixed(4) : "N/A";
感觉这个相似度计算有点问题
尝试加了几个document，换了question，计算出来的结果反而是不相关的文档相似度排在前
面。我理解是不是相似度直接取原本的分数就可以了
可能是搞反了，这个不重要，一般不用内存向量数据库，都用 milvus。继续往后看就好了
3
我查过，这里的score（余弦距离）是越小代表语义越接近
光哥，问个关于让大模型结构化输出的问题哈。我用langchain的
with_structured_output+pydantic，想让大模型结构化输出json, 总是时灵时不灵的，光哥能给
个建议吗
from pydantic import BaseModel, Field
from langchain.chat_models import init_chat_model
class Person(BaseModel):
"""人物信息"""
name: str = Field(description="姓名")
age: int = Field(description="年龄")
occupation: str = Field(description="职业")…
展开
2
最好用 tool，tool 是大模型原生级别做了结构化，如果生成的不符合结构会重新生成再返
回。你用 OutputParser 的话也可以实现，但会反复沟通，直到生成符合结构的。首选
tool，其次是 OutputParser
1
用text-embedding-v3以下的嵌入模型，相似度也挺高的，试了几次就是回答不出来
光哥，实际上两个获取相似doc的api是不是用其中一个就够了
1
是的，不过这个内存数据库一般用不到，继续往后看好了，后面用 milvus 才是重点

泛泛而谈. 北京1月11日
神光的幸福生活作者1月11日
盈舟北京1月11日
金北京2025年12月31日
神光的幸福生活作者2025年12月31日
一路向西去大理陕西4天前
神光的幸福生活作者4天前
莫得感情的杀手广东6月12日
:)
浙江6月8日
HYQ 北京5月24日
神光的幸福生活作者5月24日
类维松北京5月19日
1
感觉自己node有点差  像langchain的语法根本不知道，目前都是跟着敲之后去理解
不懂得可以让 ai 给解释下，看演示效果理解实现了什么功能就行。后面会大量用到
回复 神光的幸福生活：现在是让AI生成了一份langchain的笔记和案例
我的文档是代码仓库，那如何把整个代码仓库转化成向量呢？
1
下节会讲，需要各种 loader
这里的逻辑是不是有点冗余。
之前：2 次 LLM embedding 调用 + 手动 match 结果
retriever.invoke()  → 拿文档（无分数）
similaritySearchWithScore() → 拿文档+分数（重复查询）
再 find() 把两边结果对起来
现在：1 次 LLM embedding 调用
similaritySearchWithScore() → 文档+分数一次搞定
直接从结果里拆出 docs 和 scores
调一个 api 就好了，当时写重复了
讲的通俗易懂
，后续应该会将怎么切片吧
准备故事文档
↓
用 Embedding 模型把文档转成向量
↓
存进 MemoryVectorStore
↓
用户提问
↓
把问题也转成向量
↓…
展开
const similarity = score !== null ? (1 - score).toFixed(4) : "N/A";
这个转换有问题， 因为 score 本身就是余弦相似度（值越大越相似），不应该用 1 - score 。
这个地方写错了，但问题不大
既然const scoredResults = await vectorStore.similaritySearchWithScore(question, 3);可以获
取相关文档和评分，那还单独再const retrievedDocs = await retriever.invoke(question);获取一
下文档干啥，直接用scoredResults不就能拿到相关文档了吗

类维松北京5月19日
小王同志北京4月13日
TwqYa 湖北4月13日
ghbee653ce…
广东3月31日
神光的幸福生活作者3月31日
ㄎㄞㄒ浙江3月31日
ghbee653ce…
广东3月31日
5条回复
凉白开重庆3月28日
想广东3月10日
神光的幸福生活作者3月10日
芝诺Zenos📷云南3月5日
芝诺Zenos📷云南3月6日
噢噢，我看到其他人也问了，这两个用一个就行，忽略
打卡
我用的gml-5的向量模型 这里打印全是0了
为什么用LM Studio自带的文本嵌入模型text-embedding-nomic-text-v1.5通过
similarSearchWithScore能获取到三段文档，但相似度都是NaN
你直接打印下返回的值，nan 是处理过后的文本
我的也是，相似度都是NAN，怎么弄都是前3个，你解决了嘛，是模型问题？
回复 ㄎㄞㄒ：没解决，准备回家有空用线上API试试看；你也是本地模型吗
学习完总结，就是现有自己的文档（知识库），然后带着原始Prompt去只是库里面找最相关的几
个片段（这里用的余弦），带着这个片段和原始Prompt，作为新的Prompt传给大模型，其实大模
型收到的信息就只有最后传过去的部分，就是例子里面最相近的3个片段，而不是最初了7个，信
息更精准的同时，大大减少了上下文。我也在想，我们用的AI开发工具，查询代码有没有做分块
做向量化。还有我们的skill，大多数都是一些.md文件，有没有进一步做向量化减少token损耗
光哥，对于：
const vectorStore = await MemoryVectorStore.fromDocuments(
documents,
embeddings,
);
这种，是MemoryVectorStore内部帮我们做了分词和向量化吗，我看一般的都需要先分词，然后
再使用向量化的模型，我之前写的是这样的：
const docs = await fs.readFile(new URL("../docs/2025年总结.md", import.meta.url), {
encoding: "utf-8"})
const textSplitter = new RecursiveCharacterTextSplitter({  chunkSize: docs.length / 8,  …
展开
这里我直接传入的是分好的文档，就不用 splitter 了，那个下一节讲
我看过滤相关文档有三步：
1. 找出语义最相关的三个
2.根据问题，找到最相关的文档
3. 找出符合分数的文档
第一步不会把想要的内容过滤掉吗 @神光的幸福生活

神光的幸福生活作者3月6日
Fine 四川3月3日
神光的幸福生活作者3月3日
XM 江苏2月27日
神光的幸福生活作者2月28日
婧四川2月14日
神光的幸福生活作者2月14日
sisi 北京2月3日
神光的幸福生活作者2月3日
YOUNG 四川2月1日
神光的幸福生活作者2月1日
Le destin 北京1月20日
$pades  K 重庆1月5日
神光的幸福生活作者1月5日
Kyle 广东1月3日
神光的幸福生活作者1月4日
Elin 北京1月1日
回复 芝诺Zenos📷：是根据向量的余弦相似度计算出来的，语义最匹配的
获取获取相似度评分的意义是啥呀
这个是相似度的大小吧 🤔，可以自己排序，当然，用默认顺序就不需要这个分数了
数据中metadata部分那些mood等的作用是啥，在这里我好像除了看见展示一下没有其他用处
了。实际应用中，这些数据会参与数据过滤嘛？但是用户输入的又是自然语言，是不是还需要用
模型把自然语言中的mood等信息尝试解析出来参与筛选
就是除了向量化的内容外，还可以加一些字段，用于过滤之类的。你后面学到 miluvs 会看
到集合里除了向量字段还可以加其他字段
milvus数据库只能通过docker下载镜像在容器里面跑的方式来安装吗
也不是，但是一般都有 docker，比较简单
1-score是不是写错了，similarity应该直接用similaritySearchWithScore得出的结果吧
是的，直接用那个 api 就行。这块理解原理就行，一般不用内存的向量数据库，后面主要是
milvus
对于大模型的幻觉问题，后面会涉及到模型微调相关的教学吗
会讲，那个了解即可，ai agent 开发一般不用微调模型
如果文档都是图片的形式，文档内部还有图片，这需要先转文本再做向量化吗
光哥，这东东和光光是你真实故事嘛
不是，ai 生成的，就是测试 rag 用的
大佬，后续会有工程级的agent项目实践不
有，我在公司就是做 ai agent 全栈的
光哥，我想给我组件库的，做一个agent。但是向量检索依赖关键提示词，但实际上有些重要文
档可能是隐形的，提示词相似度不够，就又导致胡乱回答了。如何才能保证百分百精准呢？

其乐湖南4月17日
神光的幸福生活作者4月17日
6条回复
赵卫华陕西2025年12月31日
神光的幸福生活作者2025年12月31日
light 江苏2025年12月31日
🥭Reeves 北京2025年12月30日
首评
Elin哥，我最近也在想给公司的业务组件库，搞一个Agent。能加你微信学习一下吗
回复 其乐：可以啊，guangguangsunlight
大模型训练完后，知识就不再更新了，它没法知道最新的一些信息，以及一些非互联网上公开的
信息。
那它使用的知识库就可以保证有最新的消息么
不是，这里可以结合 google search 的 tool 或者 mcp。内部文档可以放到知识库
cursor里查bug的时候，它经常会search网上的问题，然后给我解答
打卡打卡
