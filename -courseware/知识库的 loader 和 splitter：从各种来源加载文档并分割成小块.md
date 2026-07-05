知识库的 loader 和 splitter：从各种来源加载文档并分割成小块
已付费
神说要有光
2026年1月5日 02:07 山东
原创
神光的幸福生活
29人
上节我们学了 RAG ，它可以解决大模型的幻觉问题。
幻觉就是大模型对于它不知道的知识，会以为自己知道，然后胡乱回答。
解决方案 RAG 就是根据用户的 prompt，去知识库查询相关文档，加到 prompt 里给到大模
型作为背景知识来回答。
这种相关文档的检索，要根据 prompt 的语义来搜，所以一般要结合向量来实现：
基于嵌入模型把文档向量化，存入向量数据库，查询的时候把 prompt 向量化，根据余弦相
似度，来检索最相近的向量，然后把相关文档放到 prompt 里。

上节我们跑通了这个流程：
会查询出几个相似度最高的文档放到 prompt 里，大模型基于这些来回答。
但上节我们是直接创建的 Document 对象，然后用嵌入模型存入了向量数据库：

实际上知识的来源可能有很多：
一个 word 文档、一个 pdf 文件、一个 youtube 视频、一个 url、一个 x 的推文等。
这种显然就不是直接创建 Document 对象了，而是要用各种 loader 来转换：
经过对应的 loader 处理后，变成 Document，之后再由嵌入模型向量化后存入知识库。
知识有各种来源，所以对应的各种 loader 也很多：
现在 langchain  文档里有 180+ loader：
https://docs.langchain.com/oss/python/integrations/document_loaders

你可以把各种知识来源通过 loader 转化为文档存入知识库。
当然，有的文档可能会很大，比如一个 pdf 文件可能是一本书的大小。
这种很明显不能直接把转化后的 Document 向量化，需要先拆分文档。
也就是需要 Splitter
大的文档经过 TextSplitter 分割后，变成一个个小文档，再给到嵌入模型做向量化。
分割最简单的就是按照字符，比如换行符 \n
但并不是每一行一个 Document，而是要设置一个 chunk size，按照换行符分割好的内容加
入到这个 Chunk，当达到 chunk size 后，再继续生成下个 Chunk 。

这个 Chunk 也是 Document 对象，只是文档内容是分割好的一个个大小合适的块。
我们写代码来跑一边这个流程。
在上节的 rag-test 项目里继续写：
创建 src/loader-and-splitter.mjs
```
import "dotenv/config";
import"cheerio";
import { CheerioWebBaseLoader } from"@langchain/community/document_loaders/web/cheerio";
const cheerioLoader = new CheerioWebBaseLoader(
"https://juejin.cn/post/7233327509919547452",
{
selector: '.main-area p'
}
);
const documents = await cheerioLoader.load();
console.log(documents);
```

我们用 CheerioWebBaseLoader 这个 loader 来加载一个网页。
安装下用到的包：

```
pnpm install cheerio @langchain/community
```

各种 loader 显然是社区维护，所以在 @langchain/community 这个包下。
这里我们用 loader 加载网页，取出 .main-area 下所有 p 标签的内容。
跑一下：
可以看到，网页内容中选择器的部分被取出来了，放入了 Document 对象。
现在的 Document 太大了，我们分割下：

splitter 在 @langchain/textsplitters 这个包下，安装下：
```
pnpm install @langchain/textsplitters
```

我们指定了 chunkSize 是 400 个字符，然后前后重复 50 个字符。
分割符是优先 。 其次 ！？
跑一下：
可以看到，文档被分成了 4 个小的文档。

每个文档是都是 400 字符左右，前后重复了 50 个字符。
这样分割好的文档用来做 RAG 性能显然会更好，不需要加载整个大文档。
我们把完整的 RAG 流程写一下：
创建 src/loader-and-splitter2.mjs
```
import "dotenv/config";
import"cheerio";
import { ChatOpenAI, OpenAIEmbeddings } from"@langchain/openai";
import { RecursiveCharacterTextSplitter } from"@langchain/textsplitters";
import { MemoryVectorStore } from"@langchain/classic/vectorstores/memory";
import { CheerioWebBaseLoader } from"@langchain/community/document_loaders/web/cheerio";
const model = new ChatOpenAI({
temperature: 0,
model: process.env.MODEL_NAME,
apiKey: process.env.OPENAI_API_KEY,
configuration: {
baseURL: process.env.OPENAI_BASE_URL,
},
});
const embeddings = new OpenAIEmbeddings({
apiKey: process.env.OPENAI_API_KEY,
model: process.env.EMBEDDINGS_MODEL_NAME,
configuration: {
baseURL: process.env.OPENAI_BASE_URL
},
});
const cheerioLoader = new CheerioWebBaseLoader(
"https://juejin.cn/post/7233327509919547452",
{
selector: '.main-area p'
}
);
const documents = await cheerioLoader.load();
console.assert(documents.length === 1);
console.log(`Total characters: ${documents[0].pageContent.length}`);
const textSplitter = new RecursiveCharacterTextSplitter({
```

```
chunkSize: 500,  // 每个分块的字符数
chunkOverlap: 50,  // 分块之间的重叠字符数
separators: ["。", "！", "？"],  // 分割符，优先使用段落分隔
});
const splitDocuments = await textSplitter.splitDocuments(documents);
console.log(`文档分割完成，共 ${splitDocuments.length} 个分块\n`);
console.log("正在创建向量存储...");
const vectorStore = await MemoryVectorStore.fromDocuments(
splitDocuments,
embeddings,
);
console.log("向量存储创建完成\n");
const retriever = vectorStore.asRetriever({ k: 2 });
const questions = [
"父亲的去世对作者的人生态度产生了怎样的根本性逆转？"
];
// RAG 流程：对每个问题进行检索和回答
for (const question of questions) {
console.log("=".repeat(80));
console.log(`问题: ${question}`);
console.log("=".repeat(80));
// 使用 retriever 获取相关文档
const retrievedDocs = await retriever.invoke(question);
// 使用 similaritySearchWithScore 获取相似度评分
const scoredResults = await vectorStore.similaritySearchWithScore(question, 2);
// 打印检索到的文档和相似度评分
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
if (doc.metadata && Object.keys(doc.metadata).length > 0) {
```

```
console.log(`元数据:`, doc.metadata);
}
});
// 构建 prompt
const context = retrievedDocs
.map((doc, i) =>`[片段${i + 1}]\n${doc.pageContent}`)
.join("\n\n━━━━━\n\n");
const prompt = `你是一个文章辅助阅读助手，根据文章内容来解答：
```

文章内容：
```
${context}
问题: ${question}
你的回答:`;
console.log("\n【AI 回答】");
const response = await model.invoke(prompt);
console.log(response.content);
console.log("\n");
}
```

整体流程和上节一样：用嵌入模型把文档存入向量数据库，先检索和用户的问题相似度最高
的 2 个文档，把它加入 prompt，然后调用大模型基于文档回答。
可以看到，loader 加载了文档，用 splitter 分成了 4 个分块（chunk）。
回答的时候检索了相似度最高的 2 个文档块，基于这个做了回答。

修改于2026年1月5日
代码上传了课程仓库： https://github.com/QuarkGluonPlasma/ai-agent-course-code
总结
这节我们学了 loader 和 splitter。
loader 可以从各种地方加载内容作为 Document，比如 word、pdf、网页、youtube、x 的
推文等等。
现在有 180+ 的 loader，社区维护，所以是在 @langchain/community 这个包。
加载后的 Document 可能会很大，需要分割成一个个小的文档，所以需要 Splitter。
splitter 在 @langchain/text-splitters 这个包。
我们写了一个读取网页里的文章内容作为文档，分割后放入知识库的 RAG 案例。
这节只要理解这俩概念就行，具体 loader 和 splitter 有很多类型，下节我们详细过一遍。
3167 人付费
转型 Agent 全栈工程师：企业级知识库项目 · 目录
上一篇
RAG：把文档向量化，基于向量实现真正的语
义搜索
下一篇
LangChain 全部 Splitter，其实只需要其中的
一个
留言 55
尝试者说湖北1月13日
写留言
7
还是光神能做到深入浅出，去年买了个aigent的课程，看的晕头转向，一看一懵b，光神真解渴啊

神光的幸福生活作者1月13日
kingswei 北京6月24日
Ankkaya
河南1月5日
神光的幸福生活作者1月5日
苏彧浙江3月4日
神光的幸福生活作者3月4日
小江大浪广东3月9日
10条回复
ψ
广东3月1日
神光的幸福生活作者3月1日
一梦浮生广东1月5日
神光的幸福生活作者1月5日
1
回复 神光的幸福生活：我现在才看到你1月的内容
，我要加油看了
3
检索时候调用了两次检索，vectorStore.similaritySearchWithScore 返回了 pageContent 和评
分，为什么还需要 retriever.invoke(question)
3
确实。vectorStore.similaritySearchWithScore(question, 2) 是拿到问题最相关的两个文档
和评分，retriever.invoke(question) 是拿到最相关的文档，两者二选一即可。上节是为了演
示各种 API 才这么写，下节开始直接调用 similaritySearchWithScore
怎么获取的是空的
1
我跑过是没问题的，你可以换一个 url 试试
1
灰尘擦一下吧
1
光哥有个疑问，下面的代码console出来的score始终是NaN，一致找不到问题
const retrievedDocs = await retriever.invoke(question)
const scoredResults = await vectorStore.similaritySearchWithScore(question,2)
console.log("\n【检索到的文档及相似度评分】");
retrievedDocs.forEach((doc,i) => {
const scoredResult = scoredResults.find(([scoredDoc]) =>
scoredDoc.pageContent === doc.pageContent
)
const score = scoredResult ? scoredResult[1] : null
console.log(chalk.bgGray(`相似度评分: ${score}`))
评论区有人聊这个了，你看看，应该是用 withScore 那个 api 就好了
光哥，这个AI全栈系列大概会更多少节？
1
100+，具体不确定，看更新情况，主要更 langchain langgraph 基础和几个agent项目

浩山东6月16日
莫得感情的杀手广东6月16日
金山东6月9日
神光的幸福生活作者6月16日
阿尔皮斯广东4月24日
神光的幸福生活作者4月24日
W罐头有保质…
重庆3月21日
W罐头有保质…
重庆3月21日
神光的幸福生活作者3月21日
神光的幸福生活作者3月21日
芝诺Zenos📷云南3月6日
喜欢桃子的石… 广东2月7日
神光的幸福生活作者2月12日
猿大侠的日常
广东1月27日
神光的幸福生活作者1月27日
尝试者说湖北1月13日
神光的幸福生活作者1月13日
阿凯碎碎念
北京1月9日
打卡，感觉很有意思，希望还不晚
依旧点个赞
光哥，我看 @langchain/community这个库说要废弃了，有新的替代方案么？
只是api放到别的包了，api还有，问题不大
我想问下，像这种我们还需要自己再跟着敲一遍吗？还是说理解就行啊？
可以跑下仓库代码
还是喜欢在掘金看你文章的时候，在公司电脑不能登录微信，不好在摸鱼的时候学习
阅读体验也没掘金舒服，感觉界面和操作不好用
回复 W罐头有保质期W：这个可以传视频，掘金不行
可以空闲看文章理思路，平时在公司跑仓库代码
好
切割的长度怎么决定呢？
chunkSize 设置的，但不是说分块一定是这个大小，可能超过也可能不到
光哥，快点更呀，年后好找工作呀
待会更
有个问题不太懂，如果一个文档很大，分割后只是分成一块一块的，整体还是存储在向量数据库
中啊？向量数据库是一个内存数据库吗？我看并没有像mysql一样的硬盘来存储数据，如果数据
量很大，会不会把内存撑满？
现在是测试，用的内存向量数据库，实际项目会用专门的数据库服务，你可以看一下最新那
节 milvus
光哥，把更新的内容加个编号吧，我看着都不知道前后顺序了

神光的幸福生活作者1月9日
钢蛋北京1月6日
神光的幸福生活作者1月7日
金北京1月6日
神光的幸福生活作者1月6日
金北京1月6日
1条回复
$pades  K 重庆1月5日
神光的幸福生活作者1月5日
$pades  K 重庆1月5日
1条回复
light 江苏1月5日
神光的幸福生活作者1月5日
见渊浙江1月5日
首评
神光的幸福生活作者1月5日
从前往后看就行。你可以点开合集，是按顺序的列表
光哥加速更~
好的，这周还会有两三节
光哥有个疑问，这样文档特别多会不会把内存撑爆了？
不会。1.分割后的文档 chunk size 是可控的 2. 取多少条相关文档也是自己决定的
回复 神光的幸福生活：这个做好了可以类比谷歌搜索么，整个的 代码的 rag 需要有一个服务
专门简历项目索引，然后 llm 去用这个服务。
哎 敲着代码看到questions，瞬间感觉代码都变得有点伤感了，这就是代码与人生嘛
我只是随便找了个问题可以关联查出部分文档的
回复 神光的幸福生活：哈哈哈 光哥可以往代码加人文发展  往代码用例中加入一些人生感悟
那光哥就成为了IT届的余华了
这节的代码没上传
好了
这么晚还不睡？
写完比较晚了
