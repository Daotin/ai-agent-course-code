# streaming-tts-test.mjs 执行逻辑

## 整体流程

```
streamTTS()
  │
  ├─ buildWsUrl()        生成带签名的 wss:// URL
  ├─ new WebSocket(url)  建立连接
  ├─ createWriteStream() 创建 MP3 写入流
  │
  └─ 事件驱动
       ├─ open    → 打印连接成功日志
       ├─ message → 核心处理（见下）
       ├─ error   → closeAll()
       └─ close   → closeAll()
```

## 鉴权：buildWsUrl()

对请求参数按 key 字母排序，拼成 `key=value&...` 字符串，前缀加上 `GETtts.cloud.tencent.com/stream_wsv2?`，用 `SECRET_KEY` 做 HMAC-SHA1 签名，附加到 URL 的 `Signature` 参数中，生成腾讯云 TTS WebSocket 鉴权 URL。

## 消息处理：ws.on('message')

```
收到消息
  │
  ├─ isBinary == true
  │     └─ 直接写入 MP3 文件，累计字节数，return
  │
  └─ JSON 文本消息
        ├─ ready == 1 且未发送过
        │     └─ sent = true → 调用 sendTexts()
        │
        ├─ code != 0
        │     └─ 打印错误 → closeAll()
        │
        └─ final == 1
              └─ 打印完成 → closeAll()
```

`sent` flag 防止 `sendTexts` 被重复触发（服务端可能多次推送 `ready=1`）。

## 文本发送：sendTexts()

```
for i in TEXTS:
    ws.send({ action: ACTION_SYNTHESIS, data: TEXTS[i] })
    if 不是最后一条: await sleep(3000ms)

ws.send({ action: ACTION_COMPLETE })
```

- `ACTION_SYNTHESIS`：通知服务端合成该段文本
- `ACTION_COMPLETE`：通知服务端文本全部发完，触发服务端收尾并推送 `final=1`
- `sleep(3000ms)` 模拟真实场景下文本分批到达的节奏

## 并发关系：发送与接收

`sendTexts` 中每次 `await sleep()` 会释放事件循环，服务端在此期间推送的二进制音频帧会立即触发 `on message` 并写入文件。因此**文本还未发完时，音频就已经在持续写入**，两者是并发进行的。

```
时间轴：

发送 TEXTS[0] ──────────────────────────────────────►
              服务端推音频帧 → on message (binary) → 写 MP3
await sleep(3000ms)  ← 事件循环空闲，可接收消息
发送 TEXTS[1] ──────────────────────────────────────►
              服务端推音频帧 → on message (binary) → 写 MP3
...
发送 ACTION_COMPLETE
              服务端推 final=1 → on message (JSON) → closeAll()
```

## 收尾：closeAll()

幂等函数，用 `closed` flag 防止重复执行：

1. `writeStream.end()` — 确保 MP3 文件完整落盘
2. `ws.close()` — 关闭 WebSocket 连接
