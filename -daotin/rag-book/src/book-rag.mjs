import 'dotenv/config'
import { MilvusClient, MetricType } from '@zilliz/milvus2-sdk-node'
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai'
import { log } from '../utils/index.mjs'

const COLLECTION_NAME = 'ebook_collection'
const VECTOR_DIM = 1024

// 初始化 OpenAI Chat 模型
const model = new ChatOpenAI({
	temperature: 0.7,
	model: process.env.MODEL_NAME,
	apiKey: process.env.MODEL_API_KEY,
	configuration: {
		baseURL: process.env.MODEL_BASE_URL,
	},
})

// 初始化 Embeddings 模型
const embeddings = new OpenAIEmbeddings({
	apiKey: process.env.MODEL_API_KEY,
	model: process.env.EMBEDDING_MODEL_NAME,
	configuration: {
		baseURL: process.env.MODEL_BASE_URL,
	},
	dimensions: VECTOR_DIM,
})

// 初始化 Milvus 客户端
const client = new MilvusClient({
	address: 'localhost:19530',
})

/**
 * 获取文本的向量嵌入
 */
async function getEmbedding(text) {
	const result = await embeddings.embedQuery(text)
	return result
}

/**
 * 从 Milvus 中检索相关的电子书内容
 */
async function retrieveRelevantContent(question, k = 3) {
	try {
		// 生成问题的向量
		const queryVector = await getEmbedding(question)

		// 在 Milvus 中搜索相似的内容
		const searchResult = await client.search({
			collection_name: COLLECTION_NAME,
			vector: queryVector,
			limit: k,
			metric_type: MetricType.COSINE,
			output_fields: ['id', 'book_id', 'chapter_num', 'index', 'content'],
		})

		return searchResult.results
	} catch (error) {
		console.error('检索内容时出错:', error.message)
		return []
	}
}

/**
 * 使用 RAG 回答关于《认知觉醒》的问题
 */
async function answerEbookQuestion(question, k = 3) {
	try {
		console.log('='.repeat(80))
		log.info(`问题: ${question}`)
		console.log('='.repeat(80))

		// 1. 检索相关内容
		console.log('\n【检索相关内容】')
		const retrievedContent = await retrieveRelevantContent(question, k)

		if (retrievedContent.length === 0) {
			console.log('未找到相关内容')
			return '抱歉，我没有找到相关的《认知觉醒》内容。'
		}

		// 2. 打印检索到的内容及相似度
		retrievedContent.forEach((item, i) => {
			console.log(`\n[片段 ${i + 1}] 相似度: ${item.score.toFixed(4)}`)
			console.log(`书籍: ${item.book_id}`)
			console.log(`章节: 第 ${item.chapter_num} 章`)
			console.log(`片段索引: ${item.index}`)
			console.log(`内容: ${item.content.substring(0, 200)}${item.content.length > 200 ? '...' : ''}`)
		})

		// 3. 构建上下文
		const context = retrievedContent
			.map((item, i) => {
				return `[片段 ${i + 1}]
章节: 第 ${item.chapter_num} 章
内容: ${item.content}`
			})
			.join('\n\n━━━━━\n\n')

		// 4. 构建 prompt
		const prompt = `你是一个专业的《认知觉醒》书籍助手。基于书籍内容回答问题，用准确、详细的语言。

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

		// 5. 调用 LLM 生成回答
		log.blueBright('\n【AI 回答】')
		const response = await model.invoke(prompt)
		console.log(response.content)
		console.log('\n')

		return response.content
	} catch (error) {
		console.error('回答问题时出错:', error.message)
		return '抱歉，处理您的问题时出现了错误。'
	}
}

async function main() {
	try {
		console.log('连接到 Milvus...')
		await client.connectPromise
		console.log('✓ 已连接\n')

		// 确保集合已加载
		try {
			await client.loadCollection({ collection_name: COLLECTION_NAME })
			console.log('✓ 集合已加载\n')
		} catch (error) {
			// 如果已经加载，会报错，忽略即可
			if (!error.message.includes('already loaded')) {
				throw error
			}
			console.log('✓ 集合已处于加载状态\n')
		}

		// 问一个关于《认知觉醒》的问题
		await answerEbookQuestion('作者讲了潜意识相关的哪些内容？？', 5)
	} catch (error) {
		console.error('错误:', error.message)
	}
}

main()
