import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";

const model = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.MODEL_API_KEY,
  configuration: {
    baseURL: process.env.MODEL_BASE_URL,
  },
});

const response = await model.invoke("介绍下自己以及具体的型号参数");
console.log(response.content);
