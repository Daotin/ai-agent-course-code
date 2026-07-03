import 'dotenv/config'
import { MilvusClient, DataType, MetricType, IndexType } from '@zilliz/milvus2-sdk-node'
import { OpenAIEmbeddings } from '@langchain/openai'

const COLLECTION_NAME = 'ai_diary' // 集合名称
const VECTOR_DIM = 1024 // 向量维度

// 创建嵌入向量模型
const embeddings = new OpenAIEmbeddings({
	apiKey: process.env.MODEL_API_KEY,
	model: process.env.EMBEDDING_MODEL_NAME,
	configuration: {
		baseURL: process.env.MODEL_BASE_URL,
	},
	dimensions: VECTOR_DIM,
})

// 创建 Milvus 客户端
const client = new MilvusClient({
	address: 'localhost:19530', // 连接地址
})

// 生成嵌入向量
async function getEmbedding(text) {
	const result = await embeddings.embedQuery(text)
	return result
}

async function main() {
	try {
		console.log('连接到 Milvus...')
		await client.connectPromise
		console.log('连接成功\n')

		// 创建集合，定义 schema
		console.log('创建集合...')
		await client.createCollection({
			collection_name: COLLECTION_NAME,
			fields: [
				{ name: 'id', data_type: DataType.VarChar, max_length: 50, is_primary_key: true },
				{ name: 'vector', data_type: DataType.FloatVector, dim: VECTOR_DIM }, // 向量维度,1024 表示向量维度为 1024
				{ name: 'content', data_type: DataType.VarChar, max_length: 5000 },
				{ name: 'date', data_type: DataType.VarChar, max_length: 50 },
				{ name: 'mood', data_type: DataType.VarChar, max_length: 50 },
				{ name: 'tags', data_type: DataType.Array, element_type: DataType.VarChar, max_capacity: 10, max_length: 50 },
			],
		})
		console.log('集合创建成功')

		// 创建索引，定义索引类型和参数
		console.log('\n创建索引...')
		await client.createIndex({
			collection_name: COLLECTION_NAME,
			field_name: 'vector',
			index_type: IndexType.IVF_FLAT, // 索引类型,IVF_FLAT 表示倒排索引
			metric_type: MetricType.COSINE, // 余弦相识度,COSINE 表示余弦相识度
			params: { nlist: 1024 }, // 参数 nlist 表示列表大小,1024 表示列表大小为 1024
		})
		console.log('索引创建成功')

		// 加载集合,将集合加载到内存中
		console.log('\n加载集合...')
		await client.loadCollection({ collection_name: COLLECTION_NAME })
		console.log('集合加载成功')

		// 插入日记数据,定义日记数据
		const diaryContents = [
			{
				id: 'diary_001',
				content: '今天天气很好，去公园散步了，心情愉快。看到了很多花开了，春天真美好。',
				date: '2026-01-10',
				mood: 'happy',
				tags: ['生活', '散步'],
			},
			{
				id: 'diary_002',
				content: '今天工作很忙，完成了一个重要的项目里程碑。团队合作很愉快，感觉很有成就感。',
				date: '2026-01-11',
				mood: 'excited',
				tags: ['工作', '成就'],
			},
			{
				id: 'diary_003',
				content: '周末和朋友去爬山，天气很好，心情也很放松。享受大自然的感觉真好。',
				date: '2026-01-12',
				mood: 'relaxed',
				tags: ['户外', '朋友'],
			},
			{
				id: 'diary_004',
				content: '今天学习了 Milvus 向量数据库，感觉很有意思。向量搜索技术真的很强大。',
				date: '2026-01-12',
				mood: 'curious',
				tags: ['学习', '技术'],
			},
			{
				id: 'diary_005',
				content: '晚上做了一顿丰盛的晚餐，尝试了新菜谱。家人都说很好吃，很有成就感。',
				date: '2026-01-13',
				mood: 'proud',
				tags: ['美食', '家庭'],
			},
		]

		console.log('\n生成嵌入向量...')
		const diaryData = await Promise.all(
			diaryContents.map(async diary => ({
				...diary,
				vector: await getEmbedding(diary.content),
			})),
		)

		// console.log('diaryData==>', diaryData)

		console.log('\n插入日记数据...')
		const insertResult = await client.insert({
			collection_name: COLLECTION_NAME,
			data: diaryData,
		})
		console.log(`\n插入成功 ${insertResult.insert_cnt} 条记录\n`)
	} catch (error) {
		console.error('错误:', error.message)
	}
}

main()
