import 'dotenv/config'
import 'cheerio'
import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'

// https://juejin.cn/post/7027343476870086664
const cheerioLoader = new CheerioWebBaseLoader('https://juejin.cn/post/7027343476870086664', {
	selector: '.main-area p',
})

const documents = await cheerioLoader.load()
const textSplitter = new RecursiveCharacterTextSplitter({
	chunkSize: 400, // 每个块的大小
	chunkOverlap: 30, // 分块之间重叠的字数
	separators: ['\n\n', '\n', '。', '？', '！', '：', '；', '，'], // 分块的分割符
})
const splitDocuments = await textSplitter.splitDocuments(documents)

console.log(splitDocuments)
