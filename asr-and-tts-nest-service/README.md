# ASR + AI 流式对话 + TTS 语音合成 Nest 服务

## 一句话概括

用户说一句话,应用把它听懂、让 AI 回答、再用语音读出来——整件事只有三步:

1. **听懂(ASR)**:浏览器录音后,把音频文件 POST 给 `/speech/asr`,Nest 转交腾讯云一句话识别,拿回一段文字。
2. **回答(AI 流)**:前端拿着这段文字请求 `/ai/chat/stream` (SSE),Nest 调 LangChain 让大模型流式出词;**每出一个词干两件事**——通过 SSE 推给前端显示文字,同时通过服务内部事件总线推给 TTS 中继。
3. **朗读(TTS 流)**:前端早已和 `/speech/tts/ws` 建好 WebSocket;中继收到词就转发给腾讯云流式 TTS,腾讯云回给它 MP3 分片,中继再把 MP3 原样透传给浏览器的 `<audio>`,边下边放。

三条通道(HTTP / SSE / WebSocket)并行,用一个 `ttsSessionId` 串起来,结果就是:**文字几乎同步出现,声音紧跟着响起**。

---

## 技术选型一览

本项目基于 NestJS,整合了 **语音识别 (ASR) → 大模型流式回复 → 语音合成 (TTS)** 的完整闭环。

- 语音识别:腾讯云 **一句话识别** (`SentenceRecognition`)
- 大模型:LangChain + OpenAI 兼容接口 (`ChatOpenAI`) 流式输出
- 语音合成:腾讯云 **流式 TTS WebSocket v2** (`TextToStreamAudioWSv2`)
- 事件总线:`@nestjs/event-emitter`,解耦 SSE 与 WebSocket 两条通道

## 目录结构

```
src/
├── ai/                     # 对话模块
│   ├── ai.controller.ts    # /ai/chat/stream (SSE)
│   └── ai.service.ts       # LangChain 流式链路 + 事件广播
├── speech/                 # 语音模块
│   ├── speech.controller.ts# /speech/asr (文件上传)
│   ├── speech.service.ts   # 腾讯云一句话识别封装
│   └── tts-relay.service.ts# SSE 文本 → 腾讯 TTS → 浏览器的中继
├── common/
│   └── stream-events.ts    # AI → TTS 的事件协议
└── main.ts                 # 挂载 /speech/tts/ws WebSocket 服务
public/asr-ai-stream.html   # 前端演示页
```

## 运行

```bash
pnpm install
pnpm run start:dev
# 访问 http://localhost:3000/asr-ai-stream.html
```

`.env` 需要以下变量:

```
SECRET_ID=            # 腾讯云
SECRET_KEY=
APP_ID=               # 腾讯云 TTS AppId
TTS_VOICE_TYPE=101001 # 可选,音色
OPENAI_API_KEY=
OPENAI_BASE_URL=
MODEL_NAME=
```

---

## 一、整体架构

```
┌──────────┐     HTTPS: POST /speech/asr       ┌──────────────┐    腾讯云 ASR
│          │ ─────────────────────────────────▶│              │ ───────────────▶
│          │                                    │              │ (一句话识别)
│          │◀──── 文本 ─────────────────────────│              │
│          │                                    │              │
│          │     HTTPS: GET  /ai/chat/stream    │              │    OpenAI 兼容
│          │ ────────(SSE, query=文本)─────────▶│  Nest 服务   │ ───────────────▶
│ 浏览器   │                                    │              │  (LangChain 流)
│ 前端     │◀─── SSE: data: <token> 分片 ───────│              │
│          │                                    │              │
│          │     WSS:  /speech/tts/ws           │              │     腾讯云 TTS
│          │ ────────(打开 WebSocket)──────────▶│              │ ───────────────▶
│          │◀─── JSON: {type:"session",...} ────│              │    (流式 WSv2)
│          │◀─── Binary: MP3 分片 ──────────────│              │◀── MP3 分片 ──
└──────────┘                                    └──────────────┘
```

三条独立通道,靠一个 `ttsSessionId` 串起来:

1. **ASR**:一次性的 multipart/form-data 上传,同步返回文本。
2. **AI 文本流**:Server-Sent Events,服务端一边推 token 给前端,一边内部广播给 TTS 中继。
3. **TTS 语音流**:浏览器 ↔ Nest 的 WebSocket,Nest ↔ 腾讯云的 WebSocket,Nest 中继文本、透传音频。

---

## 二、从语音输入到语音输出,一次完整流程

以用户说一句话、听到 AI 语音回答为例,拆成 7 个阶段。

### 阶段 1:前端录音并上传

前端页面:`public/asr-ai-stream.html`

1. 用户点击「语音输入」→ `navigator.mediaDevices.getUserMedia({ audio: true })` 取麦克风。
2. 用 `MediaRecorder`(优先 `audio/ogg;codecs=opus`)录音,每 250ms 产出一个分片。
3. 点击「停止录音」→ `mediaRecorder.stop()` → `onstop` 合并所有分片为一个 `Blob`。
4. `FormData.append("audio", blob, "record.ogg")`,`POST /speech/asr`。

### 阶段 2:Nest 调用腾讯云 ASR

入口:`src/speech/speech.controller.ts`

```ts
@Post('asr')
@UseInterceptors(FileInterceptor('audio'))
async recognize(@UploadedFile() file) {
  const text = await this.speechService.recognizeBySentence(file);
  return { text };
}
```

实现:`src/speech/speech.service.ts`

```ts
this.asrClient.SentenceRecognition({
  EngSerViceType: '16k_zh',       // 16k 采样,中文
  SourceType: 1,                  // 1 = Base64 上传
  Data: file.buffer.toString('base64'),
  DataLen: file.buffer.length,
  VoiceFormat: 'ogg-opus',        // 与前端 MediaRecorder 对齐
});
```

返回字段 `Result` 即识别文本,作为 JSON `{ text }` 响应给前端。

> 为什么用「一句话识别」而不是流式 ASR?因为用户体验是「按住说完 → 一次识别」,这种短语音场景下一句话识别延迟更低、接入更简单。

### 阶段 3:前端准备 TTS 通道,发起 AI 流

识别成功后,前端先 `ensureTtsConnection()` 确保 WebSocket 已连:

```js
const ws = new WebSocket(`${protocol}://${host}/speech/tts/ws`);
ws.binaryType = "arraybuffer";
// 服务端会首发 { type:"session", sessionId:"xxx" },前端记下 sessionId
```

拿到 `sessionId` 后,发起 SSE:

```
GET /ai/chat/stream?query=<识别文本>&ttsSessionId=<sessionId>
```

前端用 `EventSource` 接收 token。至此,浏览器一次握了两条连:
- `EventSource` → `/ai/chat/stream`:拿文字。
- `WebSocket` → `/speech/tts/ws`:拿音频。

两条连靠 `ttsSessionId` 关联。

### 阶段 4:Nest 打开大模型流,同步广播事件

入口:`src/ai/ai.controller.ts`

```ts
@Sse('chat/stream')
chatStream(@Query('query') query, @Query('ttsSessionId') ttsSessionId?) {
  if (ttsSessionId) {
    this.eventEmitter.emit(AI_TTS_STREAM_EVENT, { type:'start', sessionId:ttsSessionId, query });
  }
  return from(this.aiService.streamChain(query, ttsSessionId))
    .pipe(map(chunk => ({ data: chunk })));
}
```

服务:`src/ai/ai.service.ts`

```ts
const stream = await this.chain.stream({ query });     // LangChain 流
for await (const chunk of stream) {
  if (ttsSessionId) {
    this.eventEmitter.emit(AI_TTS_STREAM_EVENT, { type:'chunk', sessionId:ttsSessionId, chunk });
  }
  yield chunk;      // SSE 一侧收到 data:chunk
}
// 循环结束后再 emit { type:'end', sessionId }
```

**关键点:每个大模型 token 产出时同时干两件事——**
- `yield chunk` → SSE 推给前端,前端当场显示文字。
- `emit(...chunk)` → 事件总线分发,`TtsRelayService` 监听到后推给腾讯 TTS。

事件协议(`src/common/stream-events.ts`):

```ts
type AiTtsStreamEvent =
  | { type: 'start'; sessionId; query }
  | { type: 'chunk'; sessionId; chunk }
  | { type: 'end';   sessionId }
  | { type: 'error'; sessionId; error };
```

### 阶段 5:TTS 中继按需建连、缓冲、转发

`src/speech/tts-relay.service.ts` 通过 `@OnEvent(AI_TTS_STREAM_EVENT)` 订阅上述事件。

**收到 `start`**:
- 如果这个 `sessionId` 的腾讯 TTS WebSocket 还没建,立刻建立。
- URL 是 `wss://tts.cloud.tencent.com/stream_wsv2?...`,参数 `AppId/SecretId/Timestamp/Expired/Codec=mp3/SampleRate=16000/VoiceType/...`,再用 `HMAC-SHA1(SecretKey, "GET" + host + path + "?" + 排序后的参数串)` 算签名附在 URL 尾部。
- 向浏览器推送 `{ type:"tts_started" }`,前端收到后 `prepareStreamingAudio()` 初始化 `MediaSource`。

**收到 `chunk`**:
- 拿到一段 AI token 文本,目标是推送给腾讯 TTS。
- 但腾讯连接未必已经 `ready`(腾讯侧会先推一条 `{"ready":1}`),此时把 chunk 塞进 `pendingChunks` 队列。
- 一旦 `ready`,立即 `flushPendingChunks` 按序补发。

推给腾讯的 JSON 格式:

```json
{
  "session_id": "<sessionId>",
  "message_id": "msg_<ts>_<rand>",
  "action":     "ACTION_SYNTHESIS",
  "data":       "<AI 产出的这一片段文本>"
}
```

**收到 `end`**(AI 流结束):
- 先 `flushPendingChunks` 保证尾部文本发完。
- 再发 `{"session_id":..., "action":"ACTION_COMPLETE"}`,告诉腾讯「文本到此为止,请把剩余音频合成完」。

### 阶段 6:腾讯 TTS 流回音频,中继透传给浏览器

腾讯 TTS WebSocket 回给 Nest 的消息分两类:

- **二进制帧**:MP3 音频分片。
  ```ts
  tencentWs.on('message', (data, isBinary) => {
    if (isBinary) {
      // 直接透传给浏览器,一个字节都不改
      session.clientWs.send(data, { binary: true });
    }
  });
  ```
- **JSON 文本帧**:状态/结束/错误。
  - `{"ready":1}` → 标记 `session.ready=true`,触发 pending 队列冲刷。
  - `{"final":1}` → 合成完成,向浏览器发 `{ type:"tts_final" }`,前端据此关闭 `MediaSource`。
  - `{"code":非零,"message":...}` → 向浏览器发 `{ type:"tts_error" }` 并关闭 session。

### 阶段 7:前端流式播放 MP3

浏览器 WebSocket `onmessage` 分两支:

- **ArrayBuffer** → 追加到播放队列:
  ```js
  ttsPendingBuffers.push(event.data);
  flushTtsBufferQueue();          // 追加到 MediaSource 的 SourceBuffer
  ```
- **JSON** 控制消息:
  - `session` → 记录 `sessionId`。
  - `tts_started` → `prepareStreamingAudio()` 新建 `MediaSource('audio/mpeg')`,把 `<audio>.src` 指向它。
  - `tts_final` / `tts_closed` → `ttsStreamFinal = true`,队列冲干净后调 `mediaSource.endOfStream()`。

播放链:

```
二进制 MP3 → pendingBuffers 队列 → SourceBuffer.appendBuffer()
  → MediaSource → <audio>.play()    // 边下边放,首包到达即开播
```

第一段 MP3 到达的瞬间 `<audio>` 就能发声,用户感受是「AI 说的话比文字只慢一点点」。

---

## 三、时序图(顺序流)

```
浏览器                Nest: /speech/asr   Nest: /ai/chat/stream   Nest: TtsRelay      腾讯 ASR    大模型     腾讯 TTS
  │ 录音(ogg-opus)         │                    │                    │                 │         │           │
  │──POST /speech/asr─────▶│                    │                    │                 │         │           │
  │                        │─SentenceRecognition─────────────────────────────────────▶│         │           │
  │                        │◀──── 文本 ──────────────────────────────────────────────│         │           │
  │◀──{ text }─────────────│                    │                    │                 │         │           │
  │                                                                                                            │
  │──WS 连 /speech/tts/ws ────────────────────────────────────────▶ registerClient                             │
  │◀──{type:"session",sessionId}────────────────────────────────── sendClientJson                              │
  │                                                                                                            │
  │──GET /ai/chat/stream?query&ttsSessionId──▶│                    │                 │         │           │
  │                                            │─emit start──────▶│                                            │
  │                                            │                    │─开 tencent WS─────────────────────────▶│
  │                                            │                    │                                         ◀─{"ready":1}
  │                                            │─chain.stream()──────────────────────▶│         │           │
  │                                            │                    │                 │◀──token─│           │
  │◀──SSE: data:token1─────────────────────────│─emit chunk──────▶│─ACTION_SYNTHESIS─────────────────────▶│
  │                                                                  │                                         ◀─MP3 binary
  │◀──WS binary(mp3 分片)──────────────────────────────────────────│ (透传)                                  │
  │  <audio> 边下边放                                                                                         │
  │           …… token / mp3 持续交替流转 ……                                                                │
  │                                            │─emit end─────────▶│─ACTION_COMPLETE──────────────────────▶│
  │                                                                  │                                         ◀─{"final":1}
  │◀──{type:"tts_final"}───────────────────────────────────────────│                                         │
  │  MediaSource.endOfStream(),播放完结                                                                       │
```

---

## 四、关键设计点

1. **SSE + WebSocket 两通道并行,sessionId 串联。**  
   文字走 SSE 是为了天然与 `EventSource` 匹配、落地简单;音频走 WebSocket 是因为需要双向、二进制透传。两条连解耦后,任一侧断开都不会拖垮另一侧。

2. **`EventEmitter2` 解耦 AI 与 TTS。**  
   `AiService` 不知道 TTS 的存在,只负责在每个 chunk 上广播事件。`TtsRelayService` 独立订阅,即使未来加上日志、指标、再加一路合成通道,都不用改 AI 逻辑。

3. **pendingChunks 缓冲,兼容腾讯 TTS 的异步握手。**  
   大模型出词很快,腾讯 TTS WebSocket 的 `ready` 可能晚到。中继层必须在 `ready` 之前缓存文本、之后按序补发,否则会丢首句。

4. **二进制透传,零拷贝。**  
   Nest 收到腾讯的 MP3 帧后不解析、不缓存,直接 `clientWs.send(data, { binary: true })`。前端靠 `MediaSource` 实现边收边播,首包延迟最小化。

5. **腾讯 TTS 鉴权在服务端完成。**  
   签名用到 `SecretKey`,必须放服务端。前端只感知 Nest 自己的 WebSocket,腾讯凭据不会泄漏到浏览器。

---

## 五、对外接口速览

| 方法 | 路径                 | 协议      | 作用                                                     |
| ---- | -------------------- | --------- | -------------------------------------------------------- |
| POST | `/speech/asr`        | HTTP      | 上传音频 `audio` 字段,返回 `{ text }` 识别结果           |
| GET  | `/ai/chat/stream`    | SSE       | `query` 必填;传 `ttsSessionId` 则同步触发 TTS 合成       |
| —    | `/speech/tts/ws`     | WebSocket | 客户端收 JSON 控制消息 + 二进制 MP3 分片;可带 `?sessionId` 指定复用 |

控制消息类型(客户端侧收到):

- `session` — 连接建立,携带 `sessionId`
- `tts_started` — 该 session 开始合成
- `tts_final` — 腾讯侧合成完毕
- `tts_error` — 错误
- `tts_closed` — 会话关闭

---

## 六、常见问题排查

- **听不到声音,但有文字流:** 检查 `.env` 中 `SECRET_ID/SECRET_KEY/APP_ID`;中继日志会打印 `Tencent TTS ws opened`,没有就是鉴权失败。
- **TTS 断断续续:** 一般是 `MediaSource` 接纳 MP3 速度慢,查看浏览器是否支持 `audio/mpeg`。
- **首段音频缺失:** 多半是 pendingChunks 未命中 `ready`,看 `TtsRelayService` 日志是否按顺序 flush。
- **ASR 返回空:** 确认录音格式是 `audio/ogg;codecs=opus`,和服务端 `VoiceFormat: 'ogg-opus'` 匹配。
