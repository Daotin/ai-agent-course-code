import 'dotenv/config'
import { MilvusClient, MetricType } from '@zilliz/milvus2-sdk-node'
import { OpenAIEmbeddings } from '@langchain/openai'

const COLLECTION_NAME = 'ai_diary'
const VECTOR_DIM = 1024

const embeddings = new OpenAIEmbeddings({
	apiKey: process.env.MODEL_API_KEY,
	model: process.env.EMBEDDING_MODEL_NAME,
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

async function main() {
	try {
		console.log('连接到 Milvus...')
		await client.connectPromise
		console.log('连接成功\n')

		console.log('向量搜索...')
		const query = '我想看看关于学习的日记'
		console.log(`查询: "${query}"\n`)

		const queryVector = await getEmbedding(query)
		const searchResult = await client.search({
			collection_name: COLLECTION_NAME,
			vector: queryVector, // 是把 query 向量化，做余弦相似度的检索
			limit: 3, // 限制返回结果数量,2 表示返回 2 条结果
			metric_type: MetricType.COSINE,
			output_fields: ['id', 'content', 'date', 'mood', 'tags'],
		})

		console.log(`找到 ${searchResult.results.length} 条结果:\n`)
		searchResult.results.forEach((item, index) => {
			console.log(`${index + 1}. [Score: ${item.score.toFixed(4)}]`)
			console.log(` ID: ${item.id}`)
			console.log(` Date: ${item.date}`)
			console.log(` mood: ${item.mood}`)
			console.log(` Tags: ${item.tags?.join(', ')}`)
			console.log(` Content: ${item.content}\n`)
		})
	} catch (error) {
		console.error('Error:', error.message)
	}
}

main()
