import 'dotenv/config'
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'

const model = new ChatOpenAI({
	temperature: 0,
	model: process.env.MODEL_NAME,
	apiKey: process.env.MODEL_API_KEY,
	configuration: {
		baseURL: process.env.MODEL_BASE_URL,
	},
})

const embeddings = new OpenAIEmbeddings({
	apiKey: process.env.MODEL_API_KEY,
	model: process.env.EMBEDDING_MODEL_NAME,
	batchSize: 10, // 批量处理文档的批次大小
	configuration: {
		baseURL: process.env.MODEL_BASE_URL,
	},
})

const pdfLoader = new PDFLoader('../doc/一个35岁中年失业老男人的自救.pdf')

const documents = await pdfLoader.load()

console.log(`Total characters: ${documents.map(d => d.pageContent).join('').length}`)

const textSplitter = new RecursiveCharacterTextSplitter({
	chunkSize: 400,
	chunkOverlap: 40,
	separators: ['\n\n', '\n', '。', '？', '！', '：', '；', '，'],
})

const splitDocuments = await textSplitter.splitDocuments(documents)

console.log(`文档分割完成，共 ${splitDocuments.length} 个分块\n`)

console.log('正在创建向量存储...')
const vectorStore = await MemoryVectorStore.fromDocuments(splitDocuments, embeddings)
console.log('向量存储创建完成\n')

let documentNumber = 3
const retriever = vectorStore.asRetriever({ k: documentNumber })

const questions = ['这篇文章讲了什么？']

for (const question of questions) {
	console.log('='.repeat(80))
	console.log(`问题: ${question}`)
	console.log('='.repeat(80))

	const retrievedDocs = await retriever.invoke(question)

	const scoredResults = await vectorStore.similaritySearchWithScore(question, documentNumber)

	console.log('\n【检索到的文档及相似度评分】')
	retrievedDocs.forEach((doc, i) => {
		const scoredResult = scoredResults.find(([scoredDoc]) => scoredDoc.pageContent === doc.pageContent)
		const score = scoredResult ? scoredResult[1] : null
		const similarity = score !== null ? (1 - score).toFixed(4) : 'N/A'
		console.log(`\n[文档 ${i + 1}] 相似度: ${similarity}`)
		console.log(`内容: ${doc.pageContent}`)
		if (doc.metadata && Object.keys(doc.metadata).length > 0) {
			console.log(`元数据:`, doc.metadata)
		}
	})

	const context = retrievedDocs.map((doc, i) => `[片段${i + 1}]\n${doc.pageContent}`).join('\n\n━━━━━\n\n')

	const prompt = `你是一个文章辅助阅读助手，根据文章内容来解答：

文章内容：
${context}

问题: ${question}

你的回答:`

	console.log('\n【AI 回答】')
	const response = await model.invoke(prompt)
	console.log(response.content)
	console.log('\n')
}
