实现 mini cursor：大模型自动调用 tool 执行命令已付费
神说要有光
2025年12月22日 15:17 山东
原创
神光的幸福生活
69人
上节我们给大模型扩展了读文件的 tool，你说一个文件路径让它解释，它就可以自动调工具
读文件内容给出解释了。
那继续思考：
如果我们给它扩展了执行命令、写文件、创建目录、读取目录、读文件等 tool，是不是就能
实现 cursor 的功能呢？
比如创建项目对文件做增删改：
项目创建后自动执行命令安装依赖和跑服务：

是不是现在就可以实现了！
虽然我们不会做那么完善，但是简易版确实可以写了。
这节我们就来实现下大模型根据 prompt 生成项目代码，自动读写文件、通过命令安装依
赖、自动把项目跑起来，全程自己调用 tool 的功能：
不创建新项目了，直接在上节的 tool-test 项目继续写。
首先， node 里如何执行命令呢？
用 child_process 这个内置模块。
创建 src/node-exec.mjs

```
import { spawn } from'node:child_process';
const command = 'ls -la';
const cwd = process.cwd();
// 解析命令和参数
const [cmd, ...args] = command.split(' ');
const child = spawn(cmd, args, {
cwd,
stdio: 'inherit', // 实时输出到控制台
shell: true,
});
let errorMsg = '';
child.on('error', (error) => {
errorMsg = error.message;
});
child.on('close', (code) => {
if (code === 0) {
process.exit(0);
} else {
if (errorMsg) {
console.error(`错误: ${errorMsg}`);
}
process.exit(code || 1);
}
});
```

spawn 可以指定在 cwd 这个目录下执行命令，会创建一个子进程来跑，这也是为啥这个模
块叫 child_process。
用空格分割出命令和参数部分，分别作为 cmd、args
inherit 就是这个子进程的 stdout 也输出到父进程的 stdout，也就是控制台。
跑一下：
```
node ./src/node-exec.mjs
```

最终我们是要跑 npx create-vite 这个命令的，试一下：
```
const command = 'echo -e "n\nn" | pnpm create vite react-todo-app --template react-ts';
```

echo 两个 n 是有时候 vite 会让你选择两个选项：用不用 rolldown、安不安装依赖
echo n 然后通过管道操作符输出给那个进程就和我们键盘输入 n 一样的效果。
测试完之后，接下来就是封装 tools 了。
我们单独一个文件来放所有的 tools：
src/all-tools.mjs
```
import { tool } from'@langchain/core/tools';
import fs from'node:fs/promises';
```

```
import path from'node:path';
import { spawn } from'node:child_process';
import { z } from'zod';
// 1. 读取文件工具
const readFileTool = tool(
async ({ filePath }) => {
try {
const content = await fs.readFile(filePath, 'utf-8');
console.log(`  [工具调用] read_file("${filePath}") - 成功读取 ${content.length} 字节`)
return`文件内容:\n${content}`;
} catch (error) {
console.log(`  [工具调用] read_file("${filePath}") - 错误: ${error.message}`);
return`读取文件失败: ${error.message}`;
}
},
{
name: 'read_file',
description: '读取指定路径的文件内容',
schema: z.object({
filePath: z.string().describe('文件路径'),
}),
}
);
// 2. 写入文件工具
const writeFileTool = tool(
async ({ filePath, content }) => {
try {
const dir = path.dirname(filePath);
await fs.mkdir(dir, { recursive: true });
await fs.writeFile(filePath, content, 'utf-8');
console.log(`  [工具调用] write_file("${filePath}") - 成功写入 ${content.length} 字节`)
return`文件写入成功: ${filePath}`;
} catch (error) {
console.log(`  [工具调用] write_file("${filePath}") - 错误: ${error.message}`);
return`写入文件失败: ${error.message}`;
}
},
{
name: 'write_file',
description: '向指定路径写入文件内容，自动创建目录',
schema: z.object({
filePath: z.string().describe('文件路径'),
content: z.string().describe('要写入的文件内容'),
}),
}
```

```
);
// 3. 执行命令工具（带实时输出）
const executeCommandTool = tool(
async ({ command, workingDirectory }) => {
const cwd = workingDirectory || process.cwd();
console.log(`  [工具调用] execute_command("${command}")${workingDirectory ? ` - 工作目录
returnnewPromise((resolve, reject) => {
// 解析命令和参数
const [cmd, ...args] = command.split(' ');
const child = spawn(cmd, args, {
cwd,
stdio: 'inherit', // 实时输出到控制台
shell: true,
});
let errorMsg = '';
child.on('error', (error) => {
errorMsg = error.message;
});
child.on('close', (code) => {
if (code === 0) {
console.log(`  [工具调用] execute_command("${command}") - 执行成功`);
const cwdInfo = workingDirectory
? `\n\n重要提示：命令在目录 "${workingDirectory}" 中执行成功。如果需要在这个项目目录中继
: '';
resolve(`命令执行成功: ${command}${cwdInfo}`);
} else {
console.log(`  [工具调用] execute_command("${command}") - 执行失败，退出码: ${code}
resolve(`命令执行失败，退出码: ${code}${errorMsg ? '\n错误: ' + errorMsg : ''}`);
}
});
});
},
{
name: 'execute_command',
description: '执行系统命令，支持指定工作目录，实时显示输出',
schema: z.object({
command: z.string().describe('要执行的命令'),
workingDirectory: z.string().optional().describe('工作目录（推荐指定）'),
}),
}
);
```

```
// 4. 列出目录内容工具
const listDirectoryTool = tool(
async ({ directoryPath }) => {
try {
const files = await fs.readdir(directoryPath);
console.log(`  [工具调用] list_directory("${directoryPath}") - 找到 ${files.length} 个
return`目录内容:\n${files.map(f => `- ${f}`).join('\n')}`;
} catch (error) {
console.log(`  [工具调用] list_directory("${directoryPath}") - 错误: ${error.message}
return`列出目录失败: ${error.message}`;
}
},
{
name: 'list_directory',
description: '列出指定目录下的所有文件和文件夹',
schema: z.object({
directoryPath: z.string().describe('目录路径'),
}),
}
);
export { readFileTool, writeFileTool, executeCommandTool, listDirectoryTool };
```

创建了这几个 tool：
读文件
写文件（包含创建目录了）
读目录
执行命令

这里的工具调用返回结果，我额外加了 cwd 的信息，避免之后命令胡乱 cd
```
重要提示：命令在目录 "${workingDirectory}" 中执行成功。
```

如果需要在这个项目目录中继续执行命令，
```
请使用 workingDirectory: "${workingDirectory}" 参数，
不要使用 cd 命令。
```

每个 tool 都是 name、description 以及基于 zod 声明的参数格式。
接下来就可以调用了：
创建 src/mini-cursor.mjs
```
import 'dotenv/config';
import { ChatOpenAI } from'@langchain/openai';
import { HumanMessage, SystemMessage, ToolMessage } from'@langchain/core/messages';
import { executeCommandTool, listDirectoryTool, readFileTool, writeFileTool } from'./all-
const model = new ChatOpenAI({
modelName: "qwen-plus",
apiKey: process.env.OPENAI_API_KEY,
temperature: 0,
configuration: {
baseURL: process.env.OPENAI_BASE_URL,
},
});
const tools = [
readFileTool,
writeFileTool,
executeCommandTool,
listDirectoryTool,
];
```

```
// 绑定工具到模型
const modelWithTools = model.bindTools(tools);
// Agent 执行函数
asyncfunction runAgentWithTools(query, maxIterations = 30) {
const messages = [
new SystemMessage(`你是一个项目管理助手，使用工具完成任务。
当前工作目录: ${process.cwd()}
```

工具：
```
1. read_file: 读取文件
2. write_file: 写入文件
3. execute_command: 执行命令（支持 workingDirectory 参数）
4. list_directory: 列出目录
重要规则 - execute_command：
- workingDirectory 参数会自动切换到指定目录
- 当使用 workingDirectory 时，绝对不要在 command 中使用 cd
- 错误示例: { command: "cd react-todo-app && pnpm install", workingDirectory: "react-todo-a
这是错误的！因为 workingDirectory 已经在 react-todo-app 目录了，再 cd react-todo-app 会找不到目录
- 正确示例: { command: "pnpm install", workingDirectory: "react-todo-app" }
这样就对了！workingDirectory 已经切换到 react-todo-app，直接执行命令即可
回复要简洁，只说做了什么`),
new HumanMessage(query)
];
for (let i = 0; i < maxIterations; i++) {
console.log(`⏳ 正在等待 AI 思考...`);
const response = await modelWithTools.invoke(messages);
messages.push(response);
// 检查是否有工具调用
if (!response.tool_calls || response.tool_calls.length === 0) {
console.log(`\n✨ AI 最终回复:\n${response.content}\n`);
return response.content;
}
// 执行工具调用
for (const toolCall of response.tool_calls) {
const foundTool = tools.find(t => t.name === toolCall.name);
if (foundTool) {
const toolResult = await foundTool.invoke(toolCall.args);
messages.push(new ToolMessage({
content: toolResult,
tool_call_id: toolCall.id,
```

```
}));
}
}
}
return messages[messages.length - 1].content;
}
```

代码大部分我们都写过。
首先创建大模型对象：
temperature 温度指定为 0，不让 AI 随意发挥。
模型用 qwen-plus，这个更好一点。
然后把 tools 绑定到模型：

后面就是返回的对话了，因为可能会反复对话、返回调用 tools 很多次，这里加了个最大限
制。
具体的调用过程和之前一样：
用 System message 指定 AI 可以做什么，回答的规范：

告诉它有哪些工具：
我还特意说明了下 cd 的问题，有了 cwd 之后，就不用 cd 了。
之后把调用 tool 返回的内容封装成 ToolMessage：
这样，模型、工具、调用流程就搭建完了。
接下来我们开始调用：
首先我们用 chalk 加点颜色，不然都是白色不好看：
```
pnpm install chalk
```

这行背景变绿：
```
import chalk from 'chalk';
console.log(chalk.bgGreen(`⏳ 正在等待 AI 思考...`));
```

接下来写个 case：
```
const case1 = `创建一个功能丰富的 React TodoList 应用：
1. 创建项目：echo -e "n\nn" | pnpm create vite react-todo-app --template react-ts
2. 修改 src/App.tsx，实现完整功能的 TodoList：
- 添加、删除、编辑、标记完成
- 分类筛选（全部/进行中/已完成）
- 统计信息显示
- localStorage 数据持久化
3. 添加复杂样式：
```

```
- 渐变背景（蓝到紫）
- 卡片阴影、圆角
- 悬停效果
4. 添加动画：
- 添加/删除时的过渡动画
- 使用 CSS transitions
5. 列出目录确认
注意：使用 pnpm，功能要完整，样式要美观，要有动画效果
之后在 react-todo-app 项目中：
1. 使用 pnpm install 安装依赖
2. 使用 pnpm run dev 启动服务器
`;
try {
await runAgentWithTools(case1);
} catch (error) {
console.error(`\n❌ 错误: ${error.message}\n`);
}
```

告诉它创建一个 todo app，然后安装依赖，跑起来。
你是不是在 cursor 里经常做这种事情？
今天用自己写的工具来做：
```
node ./src/mini-cursor.mjs
```

可以看到，过程中调用了各种工具：
我们写的 tool 都用上了。
读取目录、写入文件、读取文件、执行命令
当然，这个过程慢很正常，生成过程本来就慢，我们没用流式展示过程，其实你等待的时间
一直在输出内容。流式相关的后面再做。

但是，这个项目的代码是用我们写的 mini cursor 自动创建、自动跑起来的：
它和 cursor 肯定有差距，但是已经实现部分功能了。
我们不是想真的实现 cursor，只是要知道它的实现原理。
代码上传了课程仓库： https://github.com/QuarkGluonPlasma/ai-agent-course-
code/tool-test
总结
这节我们创建了更多的 tool，比如目录、文件的读写，还有用 spawn 执行命令。
我们基于这些 tool 实现了部分 cursor 功能，最终效果是，它可以帮你创建项目，写入文
件，执行安装依赖、跑项目的命令。
相信学到这，你就知道 cursor 的大概实现原理了。
你也可以基于 tool + llm 来做一些自己想做的功能，边学边练，AI 学起来还是很有趣的！
3165 人付费

修改于2025年12月22日
转型 Agent 全栈工程师：企业级知识库项目 · 目录
上一篇
从 Tool 开始：让大模型自动调工具读文件
下一篇
MCP：可跨进程调用的 Tool
留言 119
神光的幸福生活作者2025年12月25日
置顶
神光的幸福生活作者2025年12月25日
置顶
神光的幸福生活作者2025年12月25日
赵卫华陕西2025年12月25日
4条回复
Eli 四川2025年12月24日
神光的幸福生活作者2025年12月24日
Mr.Dong 日本2025年12月22日
写留言
代码链接去掉后面的 /tool-test 访问
echo -e "n\nn" | pnpm create vite react-todo-app --template react-ts 这个 echo 命令在
windows 可能不支持，可以去掉前面的 echo，应该不需要用户选择也可以
2
其实就是输入两个 no，替用户回车。no 的简写是 n
6
windows用下面这段  和千问老师学的
cmd没有自带换行 所以换成powershell
const command = '"n`nn`n" | pnpm create vite react-todo-app --template react-ts';
// 获取当前工作目录
const cwd = process.cwd();
// 使用 spawn 创建子进程执行命令
const child = spawn(command, {
cwd, // 设置子进程的工作目录
stdio: 'inherit', // 实时输出到控制台（继承父进程的 stdin, stdout, stderr）
shell: 'powershell.exe'// 从 Node.js 18.17.0 和 20.0.0 开始，spawn 的 shell 选项可以传
字符串});
20
光哥很擅长从复杂的技术里抓住关键点，再通过一个个小的实战来不断加深理解。边做边学、由
浅入深的方式特别符合人的学习习惯。很幸运能看到这个教程。
6
，一个 ai 技术点一个小实战
5
使用LangChain淡化了对ReAct的理解，我感觉这块还是挺重要的，之前我自己是从零到1手写了
一个ReAct Loop，这样ai agent才有了非常深的理解。当然熟悉原理之后，肯定要用
Langchain。包括MCP这块，课程代码也比较弱化，后面如果做到知识库查询、智能客服，用到
RAG的时候，建议可以先图文讲解理论，然后再实战，个人觉得更加友好。

神光的幸福生活作者2025年12月22日
柒广东1月12日
郑成文上海2025年12月23日
神光的幸福生活作者2025年12月23日
Czc  广东3月17日
神光的幸福生活作者3月17日
芝诺Zenos📷云南3月7日
Doby 内蒙古3月5日
神光的幸福生活作者3月5日
梦泉江苏6月3日
1条回复
曾忆城。福建2月24日
神光的幸福生活作者2月24日
Steins Gate 江苏4月12日
7
1. MCP 也是 tools 的一种，我打算下一节就讲 MCP 封装成 tools
2. RAG、ReAct 等理论知识多的，会多加一些图解
3. 现在的都是小练习，学一点练一点，再学后面的技术点
4. 后面更到 Agent、RAG 等看到哪里讲的不清楚随时提
3
Vue的创建项目命令: npm create vue@latest vue-todo-app -- --default
1
能把付费的人拉个群 讨论讨论吗
3
等更完基础篇和第一个项目实战的，到时候会直播答疑，再研究拉群
使用的一样的模型，一样的代码。
发现它修改完vite生成模板代码后，并没有安装新添加的依赖。导致没法跑起来。
1
🤔，换 qwen max 试试，或者换一个专门的编程模型，这个 qwen plus 是通用模型，编程
能力一般
1
照着写了一遍，成功生成一个项目跑起来了，很成功
有个问题就是
for (let i = 0; i < maxIterations; i++) 为什么需要这个遍历
1
就是要ai 不断的思考，直到不再调用 tool，就结束循环，这里搞了个最大循环次数，其实换
成 while（true） 就行
回复 神光的幸福生活：不对把，这里是reAct循环的过程，应该有一个最大调用次数，防止死
循环
1
看了眼生成的代码 css都写了就是懒得来一句import "App.css"
模型还是不太行
我测试的时候可以，你换个 qwen-max 试试
我的也是哈哈

神光的幸福生活作者4月12日
2条回复
Dear Ultram…
湖北1月28日
神光的幸福生活作者1月28日
冬煦河北5月3日
1条回复
snapp·影 more 上海1月23日
神光的幸福生活作者1月23日
敲代码的小黑猫浙江1月19日
神光的幸福生活作者1月19日
金北京2025年12月27日
神光的幸福生活作者2025年12月27日
1
回复 Steins Gate：那就明确告诉它引入就好了。qwen plus 不是专门写代码的模型
光哥，为什么跑不起来呀
1
需要 shell 环境，你问问 ai 在 windows 下怎么跑 shell 命令
1
ls -la就是列出当前目录文件，window系统的是
const command = "dir";
1
打卡打卡，用的qwen3-coder-plus。虽然生成的代码逻辑还是有点bug…
1
这个模型太老了，用 qwen plus 吧
1
哇塞，记录一个坑点：同样的代码，如果还用 qwen-coder-turbo 模型的话，response 里返回
的 tool_calls 有很大概率是 []，然后就不会执行任何工具调用。换成 qwen-plus 就好了。(上
图：qwen-code-turbo；下图：qwen-plus)
是的，那个 qwen coder turbo的模型比较老，新模型一般对 tool calls 支持都很好
这个我发现无法持续对话，让他解读公司的大型项目会出现 token 过大的问题。光哥，这个怎么
解决呢？
这个需要 memory 的管理，后面会讲

神光的幸福生活作者2025年12月27日
夏沫广东昨天
李振浙江6天前
ly 四川6月16日
神光的幸福生活作者6月16日
木叶四川2天前
:)
浙江6月8日
浩山东6月7日
DDKris 江苏6月6日
1
cursor 也不是读整个项目的代码啊，它一般会根据关键词搜索，只读特定文件
打卡
我在windows环境，执行node-exec文件，命令行返回-e "n，但是执行mini-cursor文件又可以
成功，打印发现大模型调用工具的时候，\n会变成\\n。所以可能失败并返回-e "n的原因就是\n
被当成了换行符，于是我把命令改成下面这样可以成功。另外注意如果当前已经存在react-
todo-app文件夹也会失败。
'echo -e "n\\nn" | pnpm create vite react-todo-app --template react-ts'
const [cmd, ...args] = command.split(' '); 的意义是什么我没懂,不是直接就可以执行吗? const
child = spawn(command, {
cwd,
stdio: 'inherit',
shell: true,
});
你打印下就知道了
嗯，确实，command 不用解构成命令和参数，直接执行就行了，估计和 shell: true 有关系
用户提出任务
↓
AI 分析任务
↓
AI 判断需要调用哪个工具
↓
AI 返回 tool_calls
↓
你的 Node.js 代码执行工具
↓…
展开
打卡打卡，已成功    [工具调用] execute_command("pnpm run dev") - 工作目录:
C:\Users\bjh\tool-test\react-todo-app
$ vite
VITE v8.0.16  ready in 361 ms
➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
➜  press h + enter to show help
在上述文章描述中有个 ，asyncfunction ，合到一起了，应该是async function。

神光的幸福生活作者6月6日
浅浅墨璃玥🎀北京5月28日
浅浅墨璃玥🎀北京5月28日
神光的幸福生活作者5月28日
liugq 上海5月28日
神光的幸福生活作者5月28日
远上海4月29日
Toby 上海4月27日
地主没有欢乐… 北京4月27日
神光的幸福生活作者4月27日
init 上海4月22日
神光的幸福生活作者4月22日
阿尔皮斯广东4月17日
神光的幸福生活作者4月17日
编辑器问题 从仓库复制吧
看完评论是这样的  功能上好像还差点
我做出来的跟光哥做出来的为啥差这么多
App.css 没引入，他经常犯这个毛病，你可以在 prompt 里说明下这个
有些代码粘贴下来因为格式问题需要微调才能跑， 比如这一章中 returnnewPromise ，希望后面
能改善一下
编辑器问题，直接从仓库复制吧
打卡
return messages[messages.length - 1].content;
为什么这里只需要最后一次的, 但是之前tool-file-read.mjs里是全部传入的呢?
response = await modelWithTools.invoke(messages);
大佬有个地方不懂，上一节是invoke所有toolCall后再push所有toolMessage，这节invoke
toolCall与push toolMessage同时进行，为什么此节改为这样，两者有什么区别吗？
都行，只要 toil call id 关联上就行
老哥,页面里面的视频都是没有声音吗
前面没录，后面章节有
在这个过程中，readFileTool是不是可有可无？试着去掉这个工具，也可以创建成功。
是的，这里用不到

希格斯陕西4月16日
神光的幸福生活作者4月16日
神光的幸福生活作者4月16日
希格斯陕西4月16日
其乐湖南4月14日
神光的幸福生活作者4月14日
TwqYa 湖北4月8日
神光的幸福生活作者4月8日
JJLau 广东4月4日
神光的幸福生活作者4月4日
小王同志北京4月3日
神光的幸福生活作者4月3日
溪林听雨湖南5月25日
1条回复
加油!卡卡罗特辽宁4月2日
神光的幸福生活作者4月2日
加油!卡卡罗特辽宁4月3日
3条回复
大耳朵图图四川3月30日
熙湖南3月22日
workingDirectory  AI它老是不进刚创建的目录里面去,导致命令一直在外边执行,为什么呢
prompt 里说明下就好了，然后用聪明一点的模型，比如 qwen plus、qwen max
你用的哪个模型
回复 神光的幸福生活：没事了，我少写参数了
生成的结果差距有点大
可能是没引入 css，你看看是不是 app.js里没引入 app.css，你可以 prompt 加上这条提示
如果不写这个【 创建项目：echo -e "n\nn" | pnpm create vite react-todo-app --template
react-ts】是不是它就不知道怎么去创建项目？
也可以的，他也知道执行什么命令，但最明确告诉他怎么创建项目
光哥，请问 list_directory 这个 tool 在这里发挥了什么作用？
可以知道当前目录有哪些文件
佬，希望后面能对windows的命令行额外说明一下
windows 应该也能支持 shell 命令
const command = process.platform === 'win32' ? 'dir' : 'ls -la';
大佬，如果要把executeCommandTool执行命令的结果交给大模型，怎么办？
用 ToolMessage 放到 messages 数组里啊
回复 神光的幸福生活：子进程的输出吗？
如果遇到第一步执行命令报错，注意一下自己的node版本。低版本node安装react模板的时候会
不支持
写得很好，受益匪浅

神光的幸福生活作者3月22日
星辰大海广东3月21日
Shichao 上海3月12日
浪了浪湖南3月10日
神光的幸福生活作者3月10日
神光的幸福生活作者3月10日
七月夏天北京3月4日
神光的幸福生活作者3月4日
七月夏天北京3月5日
芝诺Zenos📷云南3月4日
￴ ￴ ￴河南2月25日
神光的幸福生活作者2月25日
Jack Li 新加坡1月30日
神光的幸福生活作者1月30日
姜涛江苏1月29日
打卡
周四上班时打卡
用qwen-plus跑的项目能出来，但样式太乱了
那是被index.css的样式影响了，你让他去掉就好了
或者你看看是不是 app.tsx里没引入 css，有的时候会这样，这个大模型不是专门写代码用
的
为啥我的执行完读取 App.css 文件就卡住了，半天都没反应
🤔，你用的是 qwen plus 么，不行再跑一遍试试，我测过好多次都是可以的
回复 神光的幸福生活：原来是因为操作系统, linux 执行就好了
很好，很清楚
我只能说,受益匪浅啊
有交流群吗有交流群吗
先集中更新内容，暂时不搞群，等更完第一个项目我研究下咋答疑，可能直播也可能收集艺
波问题录视频答疑
最后一个执行pnpm run dev的命令的tool invoke后，程序是不是就停住了，toolResult也没有
push到messages中去？整个maxIterations循环一直无法结束了？

神光的幸福生活作者1月29日
神光的幸福生活作者1月29日
神光的幸福生活作者2月3日
念鲁上海1月23日
神光的幸福生活作者1月23日
神光的幸福生活作者1月23日
Aiolimp 北京1月23日
神光的幸福生活作者1月23日
来自远古星星… 上海1月11日
rubin 浙江1月8日
神光的幸福生活作者1月8日
rubin 浙江1月8日
赵卫华陕西2025年12月25日
神光的幸福生活作者2025年12月25日
神光的幸福生活作者2025年12月25日
赵卫华陕西2025年12月25日
是的，跑起来就不需要继续调用大模型了，再调用也就是做下总结，意义不大
这个循环本来就是可以随时打断的，不需要调用大模型就退出
这个想解决也是可以的，spawn 调用的时候加一个 detach 参数，就会单独的进程跑，不阻
塞当前进程，不耽误后面继续调用 ai
tools和skill的概念有什么区别吗
代码层面只有 tool，skill 底层应该也是 tool 实现的
tool 是给开发者用的，skill 应该是封装了一下给普通用户用的
emm..视频是本来就没有声音吗还是我耳机的问题
暂时不用录声音，只是演示，后面需要配合讲解再录声音
不错，可以
当前这个例子的话，如果tool是不能超过30个迭代吗，如果超过30的话，直接返回最后一轮
message的内容
因为大模型上下文是有限的，所以限制了下沟通次数，你可以改大点。这个等后面学了
Memory 就不这么写了。比如你用 cursor 之类的，是不是也是聊一段时间就需要把之前的
总结一下再聊了？一个意思。
回复 神光的幸福生活：明白了
为什么我生成的vue那么丑呢
改下提示词，只要流程跑通就行，生成什么代码都可以
现在唯一的问题是生成过程没有流式展示过程，有的代码生成比较久就要一直等，等后面讲
完流式内容的解析，体验就和 cursor 一样了

神光的幸福生活作者2025年12月25日
神光的幸福生活作者2025年12月25日
第五季节江苏1月5日
太阳骑士四川2025年12月23日
效率AI之路
上海2025年12月22日
首评
@神光的幸福生活光哥 你写这种复杂的命令的时候能不能兼容下windows  我今天琢磨这句琢磨
了半天
const command = 'echo -e "n\nn" | pnpm create vite react-todo-app --template react-ts'
额，下次注意，这个去掉 echo 应该也可以，不一定需要用户选择。你跑跑试试
其实就是输入两个 no，替用户回车。no 的简写是 n
'(echo. & echo n & echo.) | pnpm create vite react-todo-app --template react-ts'
node版本大于18.12，wins下可以（仅供参考）
支持光哥！
这更的速度很到位
，必须点赞！
