import 'dotenv/config'
import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import { ChatOpenAI } from '@langchain/openai'
import { log, formatToolOutput } from './utils/index.mjs'
import { HumanMessage, ToolMessage, SystemMessage } from '@langchain/core/messages'

const model = new ChatOpenAI({
	modelName: process.env.MODEL_NAME,
	apiKey: process.env.MODEL_API_KEY,
	configuration: {
		baseURL: process.env.MODEL_BASE_URL,
	},
})

// 跑一个子进程，作为MCP server
const mcpClient = new MultiServerMCPClient({
	mcpServers: {
		'my-mcp-server': {
			command: 'node',
			args: ['/Users/fengdaoting/Documents/daotin-code/ai-agent/mini-cursor-mcp/src/my-mcp-server.mjs'],
		},
		'filesystem': {
			command: 'npx',
			args: ['-y', '@modelcontextprotocol/server-filesystem', ...(process.env.ALLOWED_PATHS.split(',') || '')],
		},
		'chrome-devtools': {
			command: 'npx',
			args: ['-y', 'chrome-devtools-mcp@latest'],
		},
	},
})

const tools = await mcpClient.getTools()
const modelWithTools = model.bindTools(tools)

// 获取资源文件
async function getResourceContent() {
	const res = await mcpClient.listResources()
	// console.log(res, Object.entries(res))
	let resourceContent = ''
	for (const [serverName, resources] of Object.entries(res)) {
		for (const resource of resources) {
			const content = await mcpClient.readResource(serverName, resource.uri)
			resourceContent += content[0].text
		}
	}
	return resourceContent
}

async function runAgentWithTools(query, maxIterations = 30) {
	const messages = [new SystemMessage(await getResourceContent()), new HumanMessage(query)]

	for (let i = 0; i < maxIterations; i++) {
		log.greenBright('正在等待 AI 思考...')
		const response = await modelWithTools.invoke(messages)
		messages.push(response)

		// 检查是否有工具调用
		if (!response.tool_calls || response.tool_calls.length === 0) {
			log.bgGreenBright(`\n✨ AI 最终回复:\n`)
			console.log(response.content)
			return response.content
		}

		log.blueBright(`[检测到 ${response.tool_calls.length} 个工具调用]`)
		log.blueBright(`    [工具调用: ${response.tool_calls.map(t => t.name).join(', ')}]`)

		// 执行工具调用
		for (const toolCall of response.tool_calls) {
			const foundTool = tools.find(t => t.name === toolCall.name)
			if (foundTool) {
				// let toolContent
				// try {
				// 	const toolResult = await foundTool.invoke(toolCall.args)
				// 	toolContent = formatToolOutput(toolResult)
				// } catch (err) {
				// 	toolContent = `Tool call failed: ${err.message}`
				// }
				// messages.push(
				// 	new ToolMessage({
				// 		content: toolContent,
				// 		tool_call_id: toolCall.id,
				// 	}),
				// )

				let toolMessage
				try {
					toolMessage = await foundTool.invoke(toolCall)
				} catch (err) {
					toolMessage = new ToolMessage({
						content: `Tool call failed: ${err.message}`,
						tool_call_id: toolCall.id,
					})
				}
				messages.push(toolMessage)
			}
		}
	}

	// 返回最终响应
	log.bgGreenBright(`\n✨ AI 最终回复1:\n${messages[messages.length - 1].content}`)
	return messages[messages.length - 1].content
}

try {
	// await runAgentWithTools('查一下用户 003 的信息')
	// await runAgentWithTools('mcp server 有哪些资源？用户 003 的信息是什么？')
	// await runAgentWithTools(
	// 	'桌面现在有哪些文件？在桌面新增一个 aaa 文件夹，里面新增一个 aaa.txt 文件，文件内容为 hello world.',
	// )
	await runAgentWithTools(
		'打开百度，搜索“shoplazza”，进入 shoplazza 的官网，截图，然后保存到桌面，文件名为 shoplazza.png',
	)
} finally {
	await mcpClient.close()
}
