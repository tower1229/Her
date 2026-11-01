# 真实模型、WebChat 与主动问候验收

日期：2026-11-01。固定宿主 OpenClaw `2026.10.9`，Node `24.22.1`，真实模型 `deepseek/deepseek-v4-flash`。

后续已按原版中英文 README 使用默认 Gemini 完成场景验收并修复跨日读取缺口，详见 [Gemini README 验收](20261101-readme-gemini-validation.md)。下文保留首轮 DeepSeek 运行记录。

结论：日记查询、人格补全、状态切换和 WebChat 回复链路已通过真实运行验证；heartbeat 已验证到预检、真实问候生成、无路由不计成功及 pending 抑制重复。**尚未验证实际消息渠道的投递与成功回执，不能据此宣称完整出站链路或所有使用体验均已验收。**

## 本次发现并修复

1. **状态切换被错误拒绝。** 统一执行器要求响应携带匹配的 `request_id`，但 transition prompt 没有传入这个参数。真实模型返回了有效计划，执行器仍报 `mismatched request_id`。已在内部输入及输出要求中补齐 ID；工具参数、返回协议和切换规则保持不变。复测成功写入客厅休息事件，并将原书房事件的预计时长从 90 分钟截为 4 分钟，原普通笔记完整保留。
2. **内部 heartbeat 被当成用户活动。** 固定宿主也为 heartbeat 发出 `message:preprocessed`，原处理器因此刷新 `last_user_message_at`，使空闲门槛永远不能通过，还可能把内部 sender 当作另一联系人。已用同宿主的 `message:received` 建立真实入站关联，再消费有相同 session/channel/message ID 的预处理内容；没有 ID 时只处理已确认的 received 内容。关联支持两种通知顺序，缓存有时限和容量上限；不通过正文关键词或会话名称猜来源。保留有 ID 语音消息的转写内容处理。

## 真实结果

| 场景 | 观测结果 |
| --- | --- |
| `read_only_fast` 当前状态 | 命中已有书房事件；日记逐字不变 |
| 查询规划＋经历判断 | 真实模型返回匹配 ID 的 JSON；只读命中已有事件；没有写入 |
| `timeline_transition` | 真实计划执行成功；新事件和旧事件截断写进同一个每日文件 |
| 旧版 SOUL/IDENTITY 人格提取 | 移除测试 profile 后真实调用提取器，生成有效人格缓存 |
| 人格经历空白补全 | 查询“昨晚21点你在做什么？”得到 `generated_new`，写入 1 次；再次只读查询为 `read_only_hit`，写入 0 次，文件不变 |
| WebChat 当前状态回答 | `chat.send → agent.wait → chat.history` 成功；回复“刚从书房出来，正靠在沙发上歇一下眼睛，顺手喝口水。周末晚上嘛，慢一点也挺好。”；未显示内部协议字段 |
| WebChat 入站活动 | 更新最后用户消息时间；联系人状态为 single |
| 停止／恢复主动联系 | 两次真实聊天分别把 `proactive_opt_out` 设为 true／false |
| 手动运行系统 heartbeat，`target:last` 且无外部路由 | 预检 allowed，生成自然问候；宿主结果 `skipped / no-route`；pending 保留，成功计数仍为 0 |
| 手动运行系统 heartbeat，显式 `target:none` | 预检 allowed，真实生成问候；宿主 `skipped / target-none`；pending 保留，成功计数为 0 |
| pending 期间再次 heartbeat | 预检 `pending_send_inflight`；宿主 `ok-empty / silent:true`，没有第二条问候；计数仍为 0 |

四类结构化模型响应均在真实 Gateway 日志中找到匹配请求 ID；总计捕获 10 条结构化响应。内部搜索仍明确报告 unavailable，查询使用日记及公开会话读取降级，没有伪装为执行了搜索。

测试准备了八小时前的用户活动以触发既有空闲规则；没有等待八小时。定时器验证使用公开 `cron.run` 手动运行宿主管理的 heartbeat job，并非等待真实 30 分钟周期。人格补全探针运行在同一隔离 Gateway 的另一个测试 session；它和一次 heartbeat 短暂重叠，宿主等待后完成该 heartbeat。复现脚本已把两项串行排列。

## WebChat 能证明的范围

本次调用的是 WebChat 使用的公开 Gateway RPC，经 CLI 建立 WebSocket 连接；没有自动化浏览器，也不把它算作网页渲染、通知或断线重连验收。官方 [WebChat 契约](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/web/webchat.md) 列出了同一组聊天 RPC。

WebChat 的普通回复成功，不代表它成为定时 heartbeat 的外部投递渠道。本次实际得到 `no-route`，并保留了生成的问候预览。宿主支持的某些内部完成事件向网页会话投影，属于不同路径；不能用它替代主动问候送达验收。参见固定版 [heartbeat 文档](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/gateway/heartbeat.md)。

入站修复依据固定版 [消息 hooks](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/plugins/hooks/messages.md)、[internal hooks](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/automation/hooks.md) 及已安装宿主的实际派发行为。生产代码只注册公开 hooks，没有引入宿主私有模块依赖。

## 验证与复现

- TypeScript 类型检查和 CommonJS 构建通过。
- 针对运行期、请求校验、engagement 和生产入口的 4 套回归测试共 38 项通过；入口新增断言后再次通过对应 5 项。
- `git diff --check` 通过。
- 原始测试结果：[`20261101-live-results.json`](20261101-live-results.json)（保留相关 Gateway 证据，移除无关调试日志）、[`20261101-live-gap-results.json`](20261101-live-gap-results.json)。所有测试文本和日记均为合成数据。
- 临时 Gateway、配置、state、工作区均已清理；现有 Gateway、用户 workspace 和日记没有被改写。未发送外部消息。

复现前先构建，然后在 PowerShell 运行：

```powershell
$env:OPENCLAW_NODE_BIN = 'C:/Users/shixiong/AppData/Local/nvm/v24.22.1/node.exe'
$env:OPENCLAW_PACKAGE_ROOT = 'C:/Users/shixiong/AppData/Local/nvm/v24.22.1/node_modules/openclaw'
& $env:OPENCLAW_NODE_BIN scripts/verify-openclaw-live.mjs
```

此 opt-in 脚本会真实调用模型。默认读取本机配置中的 DeepSeek provider，使用独立临时配置和随机 Gateway token；不输出凭证。可用 `OPENCLAW_LIVE_CONFIG_PATH`、`OPENCLAW_LIVE_MODEL`、`HER_LIVE_REPORT` 指定配置来源、模型和报告位置。后续脚本支持内联凭证或用户明确授权的官方 store 快照，由宿主正常解析 SecretRef，不查询密钥库；WebChat RPC 已改用持续连接。

## 仍未完成

- 默认 Gemini 的 SecretRef、模型路由及 README 场景已由上述后续验收覆盖。
- 真实外部渠道投递、`message_sent` 的 session/run/目标关联及成功计数；需要已配置渠道和测试收件目标。
- 浏览器界面、真实语音媒体转写、真实超时／模型权限错误后的宿主生命周期；相应单测不能替代这些真实运行条件。
- 向量／混合检索质量、其他宿主版本；先前固定宿主 smoke 证明的共享日记关键词召回结论不变。
