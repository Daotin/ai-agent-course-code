import 'dotenv/config'
import 'cheerio'
import { Document } from '@langchain/core/documents'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { codeDemo } from '../doc/code.js'

const textSplitter = RecursiveCharacterTextSplitter.fromLanguage('js', {
	chunkSize: 400,
	chunkOverlap: 50,
})
const splitDocuments = await textSplitter.splitDocuments([new Document({ pageContent: codeDemo })])

splitDocuments.forEach(document => {
	console.log(document)
	console.log('charater length:', document.pageContent.length)
})
