# cron-job-tool

定时任务 Agent 实现，支持自然语言创建定时/周期任务，到时间由 AI Agent 自动执行。

---

## 整体架构

```
用户请求
    ↓
AiService (对话Agent)
    ↓ 调用 cron_job 工具
CronJobToolService → JobService (保存任务到数据库，启动调度器)
                                ↓ 到时间触发
                        JobAgentService (执行Agent)
                            ↓ 调用各种工具
                        发邮件 / 搜索 / 操作数据库...
```

---

## 核心概念

**两个 Agent 职责分离：**

- `AiService`：理解用户意图，把"什么时候做什么"拆分，安排定时任务
- `JobAgentService`：在正确时间执行任务，负责真正干活

**定时任务的本质：**
不是直接执行代码，而是把一段自然语言指令存到数据库，到时间再让另一个 Agent 去理解并执行。

**调度器与数据库的关系：**
- 数据库 = 纸质备忘录（永久保存）
- 调度器 = 脑子里的闹钟（程序重启就忘）
- `onApplicationBootstrap` = 每次开机先看一眼备忘录，把闹钟重新设好

---

## 三种定时类型

| 类型 | 原理 | 场景 |
|------|------|------|
| `at` | `setTimeout` | 某个时间点执行一次，执行后自动停用 |
| `every` | `setInterval` | 每隔 X 毫秒重复执行 |
| `cron` | `CronJob` | 按 Cron 表达式执行 |

---

## 完整执行流程示例

以用户说 **"1分钟后给我发一封笑话邮件"** 为例：

### 第一阶段：对话 Agent 处理用户请求

**`AiService.runChain("1分钟后给我发一封笑话邮件")`**

**第1轮循环：**
```
messages = [SystemMessage, HumanMessage("1分钟后给我发一封笑话邮件")]
           ↓ 发给模型
模型回复：我需要知道当前时间，调用 time_now
           ↓ 代码执行 timeNowTool
返回：{ time: "2026-04-13T11:49:00Z" }
           ↓ 追加 ToolMessage 到 messages
```

**第2轮循环：**
```
messages = [...上面的, ToolMessage(time_now结果)]
           ↓ 发给模型
模型回复：知道当前时间了，调用 cron_job，参数：
  action: "add"
  type: "at"
  at: "2026-04-13T11:50:00Z"   ← 当前时间+1分钟
  instruction: "给我发一封笑话邮件"  ← 只保留"做什么"
           ↓ 代码执行 cronJobTool.invoke(上面参数)
```

**此时进入 `JobService.addJob()`：**
```
1. 在数据库创建一条 Job 记录：
   { id: "abc123", type: "at", at: 2026-04-13T11:50:00Z,
     instruction: "给我发一封笑话邮件", isEnabled: true }

2. 调用 startRuntime(job)：
   delay = 11:50:00 - 11:49:00 = 60000ms
   setTimeout(() => { jobAgentService.runJob(...) }, 60000)
   ← 一个60秒的倒计时在内存里开始跑
```

> startRuntime里面就是对三种不同的类型，采用不同的原理来 jobAgentService.runJob 执行。jobAgentService.runJob 就是第二个 Agent 来执行任务。

**第3轮循环：**
```
messages = [..., ToolMessage(cron_job结果: "已新增任务id=abc123")]
           ↓ 发给模型
模型回复：（没有 tool_calls 了）
  "好的，已为您设置定时任务，将在1分钟后发送笑话邮件。"
           ↓ toolCalls.length === 0，退出循环
返回给用户这句话
```

---

### 第二阶段：60秒后，调度器触发

**`setTimeout` 到期，执行回调：**

```
1. 更新数据库：lastRun = now, isEnabled = false  ← at 类型只跑一次

2. 调用 jobAgentService.runJob("给我发一封笑话邮件")
```

---

### 第三阶段：执行 Agent 干活

**`JobAgentService.runJob("给我发一封笑话邮件")`**

**第1轮循环：**
```
messages = [SystemMessage, HumanMessage("给我发一封笑话邮件")]
           ↓ 发给模型
模型回复：需要先搜一个笑话，调用 web_search
  args: { query: "funny joke" }
           ↓ 执行 webSearchTool
返回："为什么程序员不喜欢户外？因为有太多 bugs..."
```

**第2轮循环：**
```
messages = [..., ToolMessage(web_search结果)]
           ↓ 发给模型
模型回复：有笑话了，调用 send_mail
  args: { to: "xxx@example.com", subject: "笑话", body: "为什么程序员..." }
           ↓ 执行 sendMailTool
返回："邮件发送成功"
```

**第3轮循环：**
```
messages = [..., ToolMessage(send_mail结果)]
           ↓ 发给模型
模型回复：（没有 tool_calls）"任务完成，笑话邮件已发送。"
           ↓ 退出循环，打印日志
```

---

## 一张图总结

```
用户 → AiService(循环) → cron_job工具 → JobService → 存DB + setTimeout
                                                              ↓ 60秒后
                                              JobAgentService(循环) → web_search → send_mail → 完成
```

两个 Agent 都是同一个模式：**while循环 + 工具调用**，区别只是触发时机不同——一个是用户触发，一个是定时器触发。
