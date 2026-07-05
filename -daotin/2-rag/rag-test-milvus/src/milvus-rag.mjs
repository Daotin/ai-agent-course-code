import 'dotenv/config'
import { ChatOpenAI } from '@langchain/openai'
import { log } from '../utils/index.mjs'
import { OpenAIEmbeddings } from '@langchain/openai'
import { MilvusClient, MetricType } from '@zilliz/milvus2-sdk-node'

const COLLECTION_NAME = 'ai_diary'
const VECTOR_DIM = 1024

// 创建一个大模型实例
const model = new ChatOpenAI({
	modelName: process.env.MODEL_NAME,
	apiKey: process.env.MODEL_API_KEY,
	temperature: 0.7,
	configuration: {
		baseURL: process.env.MODEL_BASE_URL,
	},
})

// 创建一个向量模型实例
const embeddings = new OpenAIEmbeddings({
	model: process.env.EMBEDDING_MODEL_NAME,
	apiKey: process.env.MODEL_API_KEY,
	configuration: {
		baseURL: process.env.MODEL_BASE_URL,
	},
	dimensions: VECTOR_DIM,
})

const client = new MilvusClient({
	address: 'localhost:19530',
})

async function getEmbedding(text) {
	const result = await embeddings.embedQuery(text)
	return result
}

/**
 * 从 Milvus 中检索相关的日记条目
 */
async function searchMilvus(query, limit = 3) {
	try {
		console.log('连接到 Milvus...')
		await client.connectPromise
		console.log('连接成功\n')

		console.log('向量搜索...')

		const queryVector = await getEmbedding(query)
		const searchResult = await client.search({
			collection_name: COLLECTION_NAME,
			vector: queryVector, // 是把 query 向量化，做余弦相似度的检索
			limit: limit, // 限制返回结果数量,2 表示返回 2 条结果
			metric_type: MetricType.COSINE,
			output_fields: ['id', 'content', 'date', 'mode', 'tags'],
		})

		console.log(`找到 ${searchResult.results.length} 条结果:\n`)
		return searchResult.results
	} catch (error) {
		console.error('错误:', error.message)
		return []
	}
}

/**
 * 使用 RAG 回答关于日记的问题
 */
async function answerQuestion(question, limit = 2) {
	try {
		log.blueBright(`[查询] "${question}"`)

		// 从 Milvus 中检索相关的日记条目
		const results = await searchMilvus(question, limit)
		if (results.length === 0) {
			return '没有找到相关的日记条目'
		}
		log.greenBright(`[检索到 ${results.length} 条相关日记]`)
		results.forEach((item, index) => {
			log.info(
				`[日记${index + 1}] [相似度: ${item.score.toFixed(4)}] 日期: ${item.date} 心情: ${item.mode} 标签: ${item.tags?.join(', ')} 内容: ${item.content}`,
			)
		})

		// 构建 prompt
		const context = results
			.map(
				(item, index) =>
					`[日记${index + 1}]\n日期: ${item.date}\n心情: ${item.mode}\n标签: ${item.tags?.join(', ')}\n内容: ${item.content}`,
			)
			.join('\n\n━━━━━\n\n')

		const prompt = `你是一个讲日记的老师。基于以下日记片段回答问题，用温暖生动的语言。如果日记中没有提到，就说"这个日记里还没有提到这个细节"。

    日记片段:
    ${context}
    
    问题: ${question}
    
    老师的回答:`

		// 使用模型回答问题
		const response = await model.invoke(prompt)
		return response.content
	} catch (error) {
		console.error('错误:', error.message)
		return []
	}
}

async function main() {
	try {
		const question = '我想看看关于美食的日记'
		const answer = await answerQuestion(question, 2)
		log.bgGreenBright(`\n✨ AI 最终回复:\n`)
		console.log(answer)
	} catch (error) {
		console.error('错误:', error.message)
	}
}

main()
