从 Tool 开始：让大模型自动调工具读文件已付费
神说要有光
2025年12月22日 00:29 新加坡标题已修改
原创
神光的幸福生活
140人
我们和大模型聊天，可以问它一些问题，它告诉你怎么做。
但是大模型没法帮你去做。
比如你想创建一个 react + vite 的 todolist 项目，你直接问大模型，它只能告诉你应该创建
哪些文件，代码是什么，但是不能帮你读写文件、执行命令。
但是 cursor 是可以的：
你让它创建一个 todolist 项目，它会直接给你写入文件。
你还可以让它安装依赖，把项目跑起来：

这是怎么实现的呢？
开发一些 tool 交给 agent 调用就可以了。
比如读文件、写文件、读取目录、创建目录、执行命令
这节我们来学下 tool：
首先，我们找个大模型来用：
这里我们用阿里的千问，因为每个用户登录都有 100 万免费 token
够我们学习用了。
当然，就算以后不免费了，买也没多少钱，几十块可以用很久了。
你用别的大模型也一样，都可以。
首先，登录下：

https://bailian.console.aliyun.com/?tab=api#/api
点这里获取 api key：
视频演示：
然后就可以用 apikey 来调模型了。
找个模型：

搜 coder 相关的编码模型，这里是生成代码用。每个模型训练的数据集不同，都是用于不同
目的。
我们用 qwen-coder-turbo 这个就行。
然后来写代码调用。
创建项目：
```
mkdir tool-test
cd tool-test
npm init -y
```

用编辑器打开，然后创建一个文件：
src/hello-langchain.mjs

mjs 是 es module 格式的 js 文件的意思，可以用 import、export 语法
```
import { ChatOpenAI } from '@langchain/openai';
const model = new ChatOpenAI({
modelName: "qwen-coder-turbo",
apiKey: '你的 apiKey',
configuration: {
baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
},
});
const response = await model.invoke("介绍下自己");
console.log(response.content);
```

这里的 api key 换成你刚才复制的，然后 base url 是这个：
安装依赖：
```
pnpm install @langchain/openai
```

跑一下：
```
node ./src/hello-langchain.mjs
```

可以看到模型调用成功了。
不过这样把 api key 写死到代码里的方式不好，我们通过 .env 文件来管理，然后用 dotenv
这个包来读取
```
pnpm install dotenv
```

用 dotenv 来读取环境变量：
dotenv 的作用就是读取 .env 文件，设置到环境变量里
```
import dotenv from'dotenv';
import { ChatOpenAI } from'@langchain/openai';
```

```
dotenv.config();
const model = new ChatOpenAI({
modelName: process.env.MODEL_NAME || "qwen-coder-turbo",
apiKey: process.env.OPENAI_API_KEY,
configuration: {
baseURL: process.env.OPENAI_BASE_URL,
},
});
const response = await model.invoke("介绍下自己");
console.log(response.content);
```

所以我们在 .env 文件里配置这些变量，代码里动态读取：
```
# OpenAI API 配置
OPENAI_API_KEY=你的 api key
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
# 模型配置（可选，默认为 qwen-coder-turbo）
MODEL_NAME=qwen-coder-turbo
```

然后还要添加到 .gitignore，因为这些私密信息是不保存到 git 的，就像数据库的密码一样，
都是私下里传文件，不会提交 git
好了，准备工作结束！
接下来开发 tool：

其实也很简单，我们先写一个读文件的 tool：
创建 src/tool-file-read.mjs
```
import 'dotenv/config';
import { ChatOpenAI } from'@langchain/openai';
import { tool } from'@langchain/core/tools';
import { HumanMessage, SystemMessage, ToolMessage } from'@langchain/core/messages';
import fs from'node:fs/promises';
import { z } from'zod';
const model = new ChatOpenAI({
modelName: process.env.MODEL_NAME || "qwen-coder-turbo",
apiKey: process.env.OPENAI_API_KEY,
temperature: 0,
configuration: {
baseURL: process.env.OPENAI_BASE_URL,
},
});
const readFileTool = tool(
async ({ filePath }) => {
const content = await fs.readFile(filePath, 'utf-8');
console.log(`  [工具调用] read_file("${filePath}") - 成功读取 ${content.length} 字节`);
return`文件内容:\n${content}`;
},
{
name: 'read_file',
description: '用此工具来读取文件内容。当用户要求读取文件、查看代码、分析文件内容时，调用此工具。输入
schema: z.object({
filePath: z.string().describe('要读取的文件路径'),
}),
}
);
const tools = [
readFileTool
];
const modelWithTools = model.bindTools(tools);
const messages = [
new SystemMessage(`你是一个代码助手，可以使用工具读取文件并解释代码。
```

工作流程：

```
1. 用户要求读取文件时，立即调用 read_file 工具
2. 等待工具返回文件内容
3. 基于文件内容进行分析和解释
```

可用工具：
```
- read_file: 读取文件内容（使用此工具来获取文件内容）
`),
new HumanMessage('请读取 src/tool-file-read.mjs 文件内容并解释代码')
];
let response = await modelWithTools.invoke(messages);
console.log(response);
```

这里需要用到 langchain 的核心包，以及 zod：
```
pnpm install @langchain/core zod
```

首先，创建一个模型 model
temperature 是温度，也就是 ai 的创造性，设置为 0，让它严格按照指令来做事情，不要自
己发挥
我们没有调用 dotenv.configure，引入了这个模块就行
然后创建一个 tool，调用 tool 的 api

这个很容易看懂，就是函数以及它的名字、描述、参数格式。
因为要给大模型用，你要描述下这个工具是干什么的。
描述下参数的格式。
这里用 zod 包来描述，就是传入一个 object，里面的 filePath 是一个 string
也就是这样：
```
{
filePath: 'xxx'
}
```

之后把这个 tool 传给大模型：
调用下：

具体的消息有四种：SystemMessage、HumanMessage、AIMessage、ToolMessage
SystemMessage：设置 AI 是谁，可以干什么，有什么能力，以及一些回答、行为的规范
等
HumanMessage：用户输入的信息
AIMessage：AI 的回复信息
ToolMessage：调用工具的结果返回
我们用 system message 告诉 ai，它是一个代码助手，可以读取文件并解释代码内容，给出
建议
跑下试试：
```
node ./src/tool-file-read.mjs
```

可以看到 AI 返回的消息是 AIMessage 实例
它返回了这个信息：
就是解析出来我们给的路径，拼接了调用工具的参数。
接下来我们基于这个参数调用下工具不就行了？

根据 tool_calls 的数组，分别从 tools 数组里找到对应的工具，取出来 invoke，传入大模型
解析出的参数
最后把工具调用结果作为 ToolMessage 传给大模型，让它继续回答：

注意，这里要用 toolCall 对应的 id 来关联执行结果，也就是告诉大模型，你让我调用的哪
个工具，返回的结果是什么
```
let response = await modelWithTools.invoke(messages);
// console.log(response);
messages.push(response);
while (response.tool_calls && response.tool_calls.length > 0) {
console.log(`\n[检测到 ${response.tool_calls.length} 个工具调用]`);
// 执行所有工具调用
const toolResults = awaitPromise.all(
response.tool_calls.map(async (toolCall) => {
const tool = tools.find(t => t.name === toolCall.name);
if (!tool) {
return`错误: 找不到工具 ${toolCall.name}`;
}
console.log(`  [执行工具] ${toolCall.name}(${JSON.stringify(toolCall.args)})`);
try {
const result = await tool.invoke(toolCall.args);
return result;
} catch (error) {
return`错误: ${error.message}`;
}
})
);
// 将工具结果添加到消息历史
response.tool_calls.forEach((toolCall, index) => {
messages.push(
new ToolMessage({
content: toolResults[index],
tool_call_id: toolCall.id,
})
);
});
// 再次调用模型，传入工具结果
response = await modelWithTools.invoke(messages);
}
```

```
console.log('\n[最终回复]');
console.log(response.content);
```

跑下试试：
可以看到，检测到了 tool_calls 工具调用，用 read_file 这个工具读取了文件，然后让大模型
分析了文件内容，给出了代码解释。
是不是现在大模型就能读文件了！
这就是通过工具给大模型扩展了能力。
代码上传了课程仓库： https://github.com/QuarkGluonPlasma/ai-agent-course-code
总结

修改于2025年12月22日
这节我们入门了 langchain，调用了大模型，并且实现了第一个 tool
我们用的千问的模型，因为它有免费额度，获取 api key 后，用 .env 管理。
.env 这个文件不提交 git，都是聊天软件发送的方式口口相传，就和数据库密码一样。
我们用 tool 创建了一个工具，写一下函数，以及加下名字、描述、参数的格式（用 zod 声
明）就可以了。
用 model.bindTools 传给大模型，在 system message 告诉它这个工具的信息，以及规范下
它的回答流程。
message 分为 SystemMessage、HumanMessage、AIMessage、ToolMessage 四种
之后，直接问大模型某个代码的信息，它就会调用工具读取文件，然后来解答了。
实现了第一个 tool 之后，你可以想一下 cursor 怎么实现，后面我们实现一个简易版
cursor！
3108 人付费
转型 Agent 全栈工程师：企业级知识库项目 · 目录
上一篇
AI Agent 开发要学什么？
下一篇
实现 mini cursor：大模型自动调用 tool 执行
命令
留言 110
神光的幸福生活作者2025年12月25日
置顶
写留言
代码链接去掉后面的 /tool-test 访问

李宝马重庆1月28日
神光的幸福生活作者1月28日
勿忘初心上海4月1日
iamcxc 北京5天前
🥭Reeves 北京2025年12月22日
神光的幸福生活作者2025年12月22日
🥭Reeves 北京2025年12月22日
洁洁洁洁洁儿北京2月28日
神光的幸福生活作者2月28日
小蟋蟀广东1月28日
神光的幸福生活作者1月28日
小蟋蟀广东1月28日
瓶子～四川4月10日
16
我觉得可以明确一个概念，LLM大模型本身并不调用工具，它做的事情永远是通过纯文本回答用
户的问题。其他的MCP/SKILLS/TOOLS都是上层的封装。比如文章中调用工具的流程实际上是
langChain做了一层封装。没有langChain我们也可以手动通过prompt来告诉大模型我有哪些工具
可以用，参数是怎么样，然后让它按照规范的格式返回要调用的工具及其参数
2
是的，大模型返回 tool calls 信息，自己实现 tool 调用
10
整体流程
1.初始化大模型
2.创建工具函数，并绑定到到模型
3.设定人设以及用户问题
4.执行第一轮调用，并放在历史中，拿到tool_calls，存在则代表大模型想要继续执行
5.循环tool_calls，依次调用对应的工具，并拿到执行的结果
6.将工具执行结果以及工具id存储到历史对话
7. 根据历史记录再次进行调用，并输出最终结果
对着代码，再结合这段话。很容易就看懂了
10
不错不错,我看的好多教程上来就是一堆概念,喜欢这种上来就开整的,但是也建议穿插讲解引入的
库大概是搞什么的
,是什么,怎么用,一般用在哪里
8
下节开始做实战，手写 cli 版 cursor，学完一个功能做一个小实战
完成,打卡
3
Tool的下一章感觉应该是skill？会讲AI Skill这部分吗？
skill 是用户侧的概念，代码层面只有 tool mcp
2
我去看了langchain文档，再看这里感觉有点乱
主要就Tool调用那一块，为什么绑定了tools之
后还要再通过response去调用tool？为什么在messsages里push了四种的Message
3
绑定了 tools 只是告诉它什么时候调用这个 tool，它返回 tool_calls 信息之后，tool 的调用
时自己做的，大模型不会给调。
messages 数组就是 memory，大模型是无状态的，需要放到 messages 数组里给它它才知
道之前做过什么
这里用的是langchain/core，langchain的写法更加简洁，是不是langchain对文章中tools的
那层中反复调用进行了封装
1
回复 小蟋蟀：是的，这里是手动去进行循环调用工具。可能是让我们更加了解大模型的执行
流程吧，官方示例是用了 createReactAgent 这个 api 做自动处理工具调用的

Erica 陕西1月3日
神光的幸福生活作者1月3日
2条回复
见字如晤广东3月14日
Super喵喵玄美国2月2日
神光的幸福生活作者2月2日
神光的幸福生活作者2月2日
Super喵喵玄上海2月2日
:)
浙江6月8日
Yin-佑德广东5月24日
请教一下，为什么要不停的push message呢🤔 我试了下不传toolMessage回复就是空了，所以
在这里感觉message很重要。那传入message的顺序有讲究吗？还是一般使用流程就是先
SystemMessage、HumanMessage然后AIMessage、ToolMessage？最后AIMessage也就是
response也放入messages作用是什么呢？（求解答
）
3
这就是对话过程啊，ai 返回 tool calls 告诉你要调工具，你调用后分装成 ToolMessage 放入
messages 表示工具调用结果，然后 ai 基于工具结果再做思考，message 就是对话过程
2
千问的免费额度还需要手动开启才能使用，不然报403
1
第一次传入 messages 后调用拿到结果以后，往 messages 里 push 数据再次调用，和第一次调
用会有重复的执行吗？就是第一次传入调用过的前两条 message 数据。
2
这个是 memory，需要传给大模型的，不然大模型不知道之前做了什么，它是无状态的。不
会重复执行，它会基于之前做的继续往下做
后面有一节 memory 会详细讲这个，继续往后看就好了
回复 神光的幸福生活：结合你前面其他的回复说这是个对话过程，理解了
1
用户：请读取 src/tool-file-read.mjs 并解释
↓
模型：我需要调用 read_file 工具
↓
Node.js 代码：执行 read_file，读取本地文件
↓
工具返回：文件内容
↓
Node.js 代码：把文件内容作为 ToolMessage 传回模型
↓…
展开
1
记录下遇到的几个问题：
1、为什么 while？不会死循环吗？
这个是大模型决定的，当大模型认为不需要再执行 tool 的时候，tool_calls 会返回 undefined，
结合这个文件读取的例子，大模型第一次读取，读取后发现内容不全，就需要再次读取，这时候
就会再次调用 tool，直到大模型认为已经读取到足够的信息了，就不会再调用 tool 了，这时候
tool_calls 就会返回 undefined，while 循环就结束了
2、  Promise.all 是必须的吗？不是的，这个是按照逻辑决定的，如果你觉得这里应该是没有关系
的批量读取，可以这么写，如果你觉得应该是有先后关系的逐个读取，那就不能用 Promise.all
了，必须要等上一个工具调用完成后再进行下一个工具调用了，这个是根据实际情况来决定的
3、tool_call_id 是用来关联工具调用和工具结果的，模型在生成回复时会根据 tool_call_id 来…
展开

神光的幸福生活作者5月25日
serendipity 北京4月8日
神光的幸福生活作者4月8日
Shichao 上海3月11日
作者赞过
啊好的还是过去
北京3月6日
仲夏夜微风北京4月16日
1条回复
尝试者说湖北2025年12月31日
神光的幸福生活作者2025年12月31日
Sun 白俄罗斯2025年12月22日
神光的幸福生活作者2025年12月22日
神光的幸福生活作者2025年12月22日
一位靓仔路过浙江2025年12月22日
3条回复
winhok的打工… 广东2025年12月22日
首评
神光的幸福生活作者2025年12月22日
1
👍🏻
感觉好乱啊，message是干啥的，执行tools那又是什么个流程啊。
1
message 是对话记录，如果大模型返回了 tool call，就需要去调用对应的tool 把结果也放到
message 数组里
1
完成大卡
下面这个为啥不放到 promiseAll 里面呢？下面还得 iterate 一遍
messages.push(
new ToolMessage({
content: toolResults[index],
tool_call_id: toolCall.id,
})
);
1
每个tool执行时间不一样，有可能后执行的被先push进去了，倒是可以加一些key匹配机制
坚持更新一个消化一个，明天再看明天永远不会看了，加油
1
实践一下，写写代码就懂了
不能浏览器打开，一直提示要给豆，但是已经付过了，扫码不会登陆，死循环了
1
你微信浏览器打开试试
就是微信桌面端里点击这个链接
回复 神光的幸福生活：公司电脑不给装微信怎么办
冬至快乐～果然下班就能看到啦
1
学完这节就知道 cursor 是怎么实现了，可以先想一下思路。后面实现简易版 cursor

夏沫广东昨天
神光的幸福生活作者昨天
夏沫广东10小时前
2条回复
edgex 山西2天前
神光的幸福生活作者2天前
天地一沙鸥北京6月23日
神光的幸福生活作者6月23日
浩山东6月7日
转眼广东5月26日
神光的幸福生活作者5月26日
土厚载物湖南5月25日
淘气包包四川5月25日
神光的幸福生活作者5月25日
Joeky 列广东5月8日
Echoes of Co… 北京5月4日
神光的幸福生活作者5月4日
远上海4月29日
keep alive 四川4月25日
没成功找不到文件路径
直接跑下仓库代码
回复 神光的幸福生活：群和代码仓库在哪
文中代码无法复制呀
微信刚改的，直接从仓库复制吧，文字的话截图让豆包提取文字
zod 安装了没看到应用啊
tool 的参数的类型，用这个声明
打卡
刚买课程，请问视频都是没声音的吗
前面没录，后面的章节录了声音
完成打卡
现在学是不是 很多tool都有现成的可以使用？
是的，看下 mcp 那节
打卡
每一篇有个编号就好了，和对应的 github 上的代码也有对应的编号，哈哈哈
合集的列表里有序号
完成打卡

神光的幸福生活作者4月25日
lin 广东4月20日
神光的幸福生活作者4月20日
🐴🐒烧酒浙江4月17日
神光的幸福生活作者4月17日
希格斯陕西4月15日
我会像青草一… 上海4月8日
Lc 浙江3月30日
小王同志北京3月26日
。浙江3月22日
无言北京3月12日
神光的幸福生活作者3月12日
今天也要吃早餐北京2月28日
神光的幸福生活作者2月28日
ClariS 重庆3月14日
河南2月25日
光哥，注入环境变量这行可以改为dotenv.config({ override: true })，可以避免被系统里同名的环
境变量覆盖
好的，ai 时代代码细节不重要，主要是 dotenv 是干啥的知道就行
光哥，后面可以加一个用户侧的skill编写吗
可以，skill 是prompt 的封装，和 tool 是两个东西
这些代码有 github 仓库吗
文章最后有
打卡
之前看了很多文章关于Agent Skills Mcp和Tools的区别，都是浮于理论层面，还是需要这样动手
实现一遍才能更加真切地理解
学习打卡
打卡
打卡
messages.push(response)是不是应该塞入 while循环里，如果llm多次调用 tools的话
是的，agent loop 是个循环，直到没有 tool call 退出，这里用 for 也可以，循环不了那么多
次
// 将工具结果添加到消息历史
response.tool_calls.forEach，
为什么还是遍历的response.tool_calls而不是toolResults呢
tool_calls 可能多个，需要循环调用，然后调用结果封装到 ToolMessage 放入 messages
因为需要用到 tool_calls 里面的 id 属性吧

AIKO的AI世界
湖北2月9日
神光的幸福生活作者2月10日
苏彧浙江1月28日
神光的幸福生活作者1月28日
神光的幸福生活作者1月28日
吕腾腾腾腾飞江苏1月27日
神光的幸福生活作者1月27日
相甫重庆1月23日
神光的幸福生活作者1月23日
snapp·影 more 上海1月21日
月光临海
四川1月21日
神光的幸福生活作者1月22日
snapp·影 more 上海1月21日
写的很好,例子的实现也很好,就是有点想法:就是你看写的代码其实就是几个思路,首先是写一个调
用model的代码用来连接LLM,然后写一个tool把工具函数绑定到model上,不是让LLM拥有什么能
力,而是一个Tool Calling,让他做之前,先看看有没有工具函数,做完后再次投喂给model;消息什么
的还是可以直白理解的,但是下边的while检测工具,执行工具,然后返回工具结果啥的,我也能看懂,
就是感觉自己不知道从哪里才能知道这些API,什么时候使用什么API,感觉自己跟着写挺爽的,哈哈
哈,就是写不出第二遍,光哥,为啥的你学习能力,实现能力,需求转化为代码的能力这么强啊
Langchain是怎么让大模型每次返回标准化固定字段的AIMessages的？
这个是大模型的接口返回的，langchain 只是封装了下
这是langchain1.x版本吗
最新版本
"@langchain/core": "^1.1.17",
message 输入的格式有要求吗？看官网都是字符串，图中你写的工作流程那段的写法也都支持
是不是没限制啊？
message 只有那几种，其他的调用方式底层也是封装成 HumanMessgae 等的
最近团队想让我分享一下AI，光哥之前团队分享AI资料求分享
就是课程的内容，你可以把 tool mcp rag memory 分享下
学习打卡
不用 ts 了吗？
学习用 js 就行，具体开发项目再用 ts
为啥我这个qwen-coder-turbo不支持工具调用…第一次消息输出时的确返回的是tool_calls=[]。
换了个其他支持工具的模型，输出符合预期了。

神光的幸福生活作者1月22日
军北京1月19日
神光的幸福生活作者1月19日
stanny的音乐…
浙江1月17日
姜涛江苏1月15日
神光的幸福生活作者1月15日
AJ1230 江苏1月15日
Elin 河北1月1日
神光的幸福生活作者1月1日
神光的幸福生活作者1月1日
Steins Gate 江苏4月12日
见渊浙江2025年12月30日
神光的幸福生活作者2025年12月30日
$pades  K 重庆2025年12月29日
神光的幸福生活作者2025年12月29日
$pades  K 重庆2025年12月29日
qwen-coder-turbo 这个模型比较老，换 qwen-plus 吧
纯后端要看这些的话需要会哪些前端知识，代码只能大概看懂，但前端基础不行
不用前端知识，会写 js 就行，用到的 node API 可以问问 ai。js 应该后端都会写
挺实用的，适合前端转型
为啥最后AI返回的代码解释就很简单的几句话，和文章中截图的详细的代码解释不一样呢？
每次调用都不一样，这个不是重点，重点是 ai 是否读取到了文件内容，是的话就说明 tool
生效了。 你可以换个模型，比如 qwen-plus
回复 神光的幸福生活：嗯，tool是生效了，我换个模型试试，多谢
光哥，zod我看起来有点难懂，我尝试不用zod，直接 ```schema: {      filePath: {        type:
"string",        description: "要读取的文件路径",      },    }``` 这样定义也能跑通。 是不是后面都可
以跳过zod
zod 有啥难懂的，就和 ts 类型一样，声明结构和类型
你把前几节 tool 的部分看一下
感觉就是简化了代码
invoke作用是啥
传入 message 调用大模型
光哥 后面会不会有部署本地模型然后训练本地模型的教程啊
那个叫微调，这个了解就行，开发不需要搞这些，后面会介绍下
回复 神光的幸福生活：

GYB 陕西2025年12月29日
神光的幸福生活作者2025年12月29日
tool 调用是 function calling 吗？看起来也和 mcp 很像
tool 就是 tool calls，function call 是过去的名字了
