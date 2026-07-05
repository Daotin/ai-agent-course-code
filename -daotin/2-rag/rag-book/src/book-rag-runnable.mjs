import 'dotenv/config'
import { MilvusClient, MetricType } from '@zilliz/milvus2-sdk-node'
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai'
import { RunnableSequence, RunnableLambda, RunnablePassthrough } from '@langchain/core/runnables'
import { log } from '../utils/index.mjs'
import { StringOutputParser } from '@langchain/core/output_parsers'

const COLLECTION_NAME = 'ebook_collection'
const VECTOR_DIM = 1024

const model = new ChatOpenAI({
	temperature: 0.7,
	model: process.env.MODEL_NAME,
	apiKey: process.env.MODEL_API_KEY,
	configuration: {
		baseURL: process.env.MODEL_BASE_URL,
	},
})

const embeddings = new OpenAIEmbeddings({
	apiKey: process.env.MODEL_API_KEY,
	model: process.env.EMBEDDING_MODEL_NAME,
	configuration: {
		baseURL: process.env.MODEL_BASE_URL,
	},
	dimensions: VECTOR_DIM,
})

const client = new MilvusClient({ address: 'localhost:19530' })

// Step1: 生成问题向量
const embedQuestion = new RunnableLambda({
	func: async ({ question }) => embeddings.embedQuery(question),
})

// Step2: 检索相关内容
const retrieveContent = new RunnableLambda({
	func: async ({ question, vector, k }) => {
		const searchResult = await client.search({
			collection_name: COLLECTION_NAME,
			vector,
			limit: k,
			metric_type: MetricType.COSINE,
			output_fields: ['id', 'book_id', 'chapter_num', 'index', 'content'],
		})
		log.info(`问题: ${question}`)
		searchResult.results.forEach((item, i) => {
			console.log(`\n[片段 ${i + 1}] 相似度: ${item.score.toFixed(4)}`)
			console.log(`书籍: ${item.book_id}`)
			console.log(`章节: 第 ${item.chapter_num} 章`)
			console.log(`内容: ${item.content.substring(0, 200)}${item.content.length > 200 ? '...' : ''}`)
		})
		return searchResult.results
	},
})

// Step3: 构建 prompt 字符串
const buildPrompt = new RunnableLambda({
	func: ({ question, retrieved }) => {
		const context = retrieved
			.map((item, i) => `[片段 ${i + 1}]\n章节: 第 ${item.chapter_num} 章\n内容: ${item.content}`)
			.join('\n\n━━━━━\n\n')

		return `你是一个专业的《认知觉醒》书籍助手。基于书籍内容回答问题，用准确、详细的语言。

请根据以下《认知觉醒》书籍片段内容回答问题：
${context}

用户问题: ${question}

回答要求：
1. 如果片段中有相关信息，请结合书籍内容给出详细、准确的回答
2. 可以综合多个片段的内容，提供完整的答案
3. 如果片段中没有相关信息，请如实告知用户
4. 回答要准确，符合书籍的情节和人物设定
5. 可以引用原文内容来支持你的回答

AI 助手的回答:`
	},
})

const ragChain = RunnableSequence.from([
	RunnablePassthrough.assign({ vector: embedQuestion }),
	RunnablePassthrough.assign({ retrieved: retrieveContent }),
	RunnablePassthrough.assign({ prompt: buildPrompt }),
	new RunnableLambda({ func: ({ prompt }) => prompt }),
	model,
	new StringOutputParser(),
])

async function main() {
	await client.connectPromise
	console.log('✓ 已连接\n')

	try {
		await client.loadCollection({ collection_name: COLLECTION_NAME })
		console.log('✓ 集合已加载\n')
	} catch (error) {
		if (!error.message.includes('already loaded')) throw error
		console.log('✓ 集合已处于加载状态\n')
	}

	const stream = await ragChain.stream({ question: '作者讲了舒适区边缘的哪些内容？', k: 5 })

	log.blueBright('\n【AI 回答】')

	for await (const chunk of stream) {
		process.stdout.write(chunk)
	}
}

main()
