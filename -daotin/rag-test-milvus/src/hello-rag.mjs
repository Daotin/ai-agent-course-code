import 'dotenv/config'
import { ChatOpenAI } from '@langchain/openai'
import { log } from '../utils/index.mjs'
import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory'
import { OpenAIEmbeddings } from '@langchain/openai'
import { documents } from '../doc/doc.mjs'

log.blueBright('开始运行 RAG 检索...')

// 创建一个大模型实例
const model = new ChatOpenAI({
	modelName: process.env.MODEL_NAME,
	apiKey: process.env.MODEL_API_KEY,
	temperature: 0,
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
})

// 创建一个向量存储实例。用嵌入模型把文档转换为向量，然后存储到向量存储中
// MemoryVectorStore：内存向量存储，不存储到文件，适合小数据集
// fromDocuments：从文档列表创建向量存储
// documents：文档列表
// embeddings：嵌入模型
const vectorStore = await MemoryVectorStore.fromDocuments(documents, embeddings)

// 创建一个检索器实例。asRetriever 指定查询相似度最大的几个文档。
// k=3：返回余弦相似度最高的3个文档
const retriever = vectorStore.asRetriever({ k: 3 })

// 创建一个问题列表
const questions = ['东东和光光的友谊如何变得更加深厚？']

// 遍历问题列表，进行 RAG 检索
for (const question of questions) {
	console.log('='.repeat(80))
	console.log(`问题: ${question}`)
	console.log('='.repeat(80))

	// 使用 retriever 获取文档。返回余弦相似度最高的3个文档
	const retrievedDocs = await retriever.invoke(question)

	// 使用 similaritySearchWithScore 获取相似度评分
	// 参数question：查询的文本
	// 参数3：返回相似度最高的3个文档
	const scoredResults = await vectorStore.similaritySearchWithScore(question, 3)

	// 打印用到的文档和相似度评分
	log.blueBright('\n【检索到的文档及相似度评分】')
	retrievedDocs.forEach((doc, i) => {
		// 找到对应的评分
		const scoredResult = scoredResults.find(([scoredDoc]) => scoredDoc.pageContent === doc.pageContent)
		const score = scoredResult ? scoredResult[1] : null
		const similarity = score !== null ? (1 - score).toFixed(4) : 'N/A'
		log.greenBright(`\n[文档 ${i + 1}] 相似度: ${similarity}`)
		console.log(`内容: ${doc.pageContent}`)
		console.log(
			`元数据: 章节=${doc.metadata.chapter}, 角色=${doc.metadata.character}, 类型=${doc.metadata.type}, 心情=${doc.metadata.mood}`,
		)
	})

	// 构建 prompt
	const context = retrievedDocs.map((doc, i) => `[片段${i + 1}]\n${doc.pageContent}`).join('\n\n━━━━━\n\n')

	// 增强后的 prompt
	const prompt = `你是一个讲友情故事的老师。基于以下故事片段回答问题，用温暖生动的语言。如果故事中没有提到，就说"这个故事里还没有提到这个细节"。
  
  故事片段:
  ${context}
  
  问题: ${question}
  
  老师的回答:`

	log.bgGreenBright('\n【AI 回答】')
	const response = await model.invoke(prompt)
	console.log(response.content)
	console.log('\n')
}
