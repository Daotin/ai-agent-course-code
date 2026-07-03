import 'dotenv/config'
import { ChatOpenAI } from '@langchain/openai'
import { tool } from '@langchain/core/tools'
import {
	HumanMessage, // 用户输入消息
	SystemMessage, // 系统提示消息
	ToolMessage, // 工具调用返回的消息
	AIMessage, // 模型回复消息
} from '@langchain/core/messages'
import fs from 'node:fs/promises'
import { z } from 'zod'

const model = new ChatOpenAI({
	modelName: process.env.MODEL_NAME,
	apiKey: process.env.MODEL_API_KEY,
	temperature: 0,
	configuration: {
		baseURL: process.env.MODEL_BASE_URL,
	},
})

const readFileTool = tool(
	async ({ filePath }) => {
		const content = await fs.readFile(filePath, 'utf-8')
		console.log(`  [工具调用] read_file("${filePath}") - 成功读取 ${content.length} 字节`)
		return `文件内容:\n${content}`
	},
	{
		name: 'read_file',
		description:
			'用此工具来读取文件内容。当用户要求读取文件、查看代码、分析文件内容时，调用此工具。输入文件路径（可以是相对路径或绝对路径）。',
		schema: z.object({
			filePath: z.string().describe('要读取的文件路径'), // 定义 AIMessage 返回的tool_calls字段的args字段参数结构
		}),
	},
)

const tools = [readFileTool]

const modelWithTools = model.bindTools(tools)

const messages = [
	new SystemMessage(`你是一个代码助手，可以使用工具读取文件并解释代码。

工作流程：
1. 用户要求读取文件时，立即调用 read_file 工具
2. 等待工具返回文件内容
3. 基于文件内容进行分析和解释

可用工具：
- read_file: 读取文件内容（使用此工具来获取文件内容）
`),
	new HumanMessage('请读取 src/tool-file-read.mjs 文件内容并解释代码'),
]

let response = await modelWithTools.invoke(messages)
console.log(`\n[初始响应]`)
console.log(response.content)

messages.push(response)

while (response.tool_calls && response.tool_calls.length > 0) {
	console.log(`\n[检测到 ${response.tool_calls.length} 个工具调用]`)

	try {
		// 执行所以工具调用
		await Promise.all(
			response.tool_calls.map(async toolCall => {
				const tool = tools.find(tool => tool.name === toolCall.name)
				if (!tool) {
					console.error(`[警告] 未找到工具: ${toolCall.name}`)
					return
				}

				// 添加工具调用返回的消息
				const toolMessage = await tool.invoke(toolCall)
				messages.push(toolMessage)

				// const toolResult = await tool.invoke(toolCall.args)
				// messages.push(
				// 	new ToolMessage({
				// 		tool_call_id: toolCall.id,
				// 		content: toolResult,
				// 	}),
				// )
			}),
		)
		console.log(`\n[执行工具调用后，消息队列长度: ${messages.length}]`)
		// 再次调用模型
		response = await modelWithTools.invoke(messages)
	} catch (error) {
		console.error(`[错误] 执行工具调用时发生错误: ${error}`)
		break
	}
}

console.log(`\n[最终响应]`)
console.log(response.content)
