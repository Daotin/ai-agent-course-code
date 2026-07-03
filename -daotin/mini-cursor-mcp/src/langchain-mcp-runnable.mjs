import 'dotenv/config'
import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import { ChatOpenAI } from '@langchain/openai'
import { RunnableLambda, RunnableSequence, RunnableBranch } from '@langchain/core/runnables'
import { HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { log } from './utils/index.mjs'

const model = new ChatOpenAI({
	modelName: process.env.MODEL_NAME,
	apiKey: process.env.MODEL_API_KEY,
	configuration: {
		baseURL: process.env.MODEL_BASE_URL,
	},
})

const mcpClient = new MultiServerMCPClient({
	mcpServers: {
		'my-mcp-server': {
			command: 'node',
			args: ['/Users/fengdaoting/Documents/daotin-code/ai-agent/mini-cursor-mcp/src/my-mcp-server.mjs'],
		},
		filesystem: {
			command: 'npx',
			args: ['-y', '@modelcontextprotocol/server-filesystem', ...(process.env.ALLOWED_PATHS.split(',') || '')],
		},
		'chrome-devtools': {
			command: 'npx',
			args: ['-y', 'chrome-devtools-mcp@latest'],
		},
	},
})

const resourceLoader = RunnableLambda.from(async () => {
	const res = await mcpClient.listResources()
	let content = ''
	for (const [serverName, resources] of Object.entries(res)) {
		for (const resource of resources) {
			const result = await mcpClient.readResource(serverName, resource.uri)
			content += result[0].text
		}
	}
	return content
})

async function buildPipeline() {
	const [tools, systemContent] = await Promise.all([mcpClient.getTools(), resourceLoader.invoke()])
	const modelWithTools = model.bindTools(tools)

	// 执行所有工具调用，返回 ToolMessage[]
	const toolExecutor = RunnableLambda.from(async (response) => {
		log.blueBright(`[检测到 ${response.tool_calls.length} 个工具调用]`)
		log.blueBright(`    [工具调用: ${response.tool_calls.map(t => t.name).join(', ')}]`)
		return Promise.all(
			response.tool_calls.map(async (toolCall) => {
				const tool = tools.find(t => t.name === toolCall.name)
				try {
					return await tool.invoke(toolCall)
				} catch (err) {
					return new ToolMessage({ content: `Tool call failed: ${err.message}`, tool_call_id: toolCall.id })
				}
			}),
		)
	})

	// 根据是否有工具调用进行分支
	const branch = RunnableBranch.from([
		[(response) => response.tool_calls?.length > 0, toolExecutor],
		RunnableLambda.from((response) => response.content),
	])

	// 外层循环：维护 messages 状态，驱动 modelWithTools → branch 的迭代
	const agentLoop = RunnableLambda.from(async (messages) => {
		for (let i = 0; i < 30; i++) {
			log.greenBright('正在等待 AI 思考...')
			const response = await modelWithTools.invoke(messages)
			messages.push(response)

			const result = await branch.invoke(response)

			if (typeof result === 'string') {
				log.bgGreenBright('\n✨ AI 最终回复:\n')
				console.log(result)
				return result
			}

			messages.push(...result)
		}
	})

	// 完整 pipeline：query → 初始消息 → agentLoop
	return RunnableSequence.from([
		RunnableLambda.from((query) => [new SystemMessage(systemContent), new HumanMessage(query)]),
		agentLoop,
	])
}

try {
	const pipeline = await buildPipeline()
	await pipeline.invoke('打开百度，搜索"马秋歌"，截图，然后保存到桌面，文件名为马秋歌.png')
} finally {
	await mcpClient.close()
}
