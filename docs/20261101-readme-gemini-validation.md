# 原版 README：Gemini 真实使用场景验收

日期：2026-11-01。基线为提交 `feda99284ff7695d68dc283cb6f5295e8b3ccc91` 的英文及中文 README，取两者场景并集。固定 OpenClaw `2026.10.9`、Node `24.22.1`、本机默认模型 `google/gemini-3.8-flash`，模型 fallback 列表为空。

结论：16 组场景的本机可测部分经完整运行及修复后定向复测通过。发现并修复一个旧有的跨日父事件读取缺口；现有每日 Markdown、自然聊天入口、工具参数及消费协议保持不变。**外部主动问候送达尚未验证，不能据此宣称整个出站链路完成。**

## 验收方法与证据

- 使用用户明确授权的一次官方全局状态快照，在私有临时目录中恢复到隔离 state，由宿主正常解析原 `store` SecretRef；没有查询密钥库、输出密钥或备份用户日记及 Agent 会话数据库。
- 每轮使用独立 workspace、config、state、端口和合成日记。关闭自动调度，主动问候通过公开 `cron.run` 手动触发。正常部署的配置、Gateway 和日记没有修改。
- WebChat 路径使用持续连接的公开 `GatewayClient`，执行 `chat.send → agent.wait → chat.history`。检查实际响应的 model、用户可见文本、Timeline trace 和每日文件；没有用 mocks 代替模型。
- 查询规划、经历判断、转场规划、旧版人格提取四条路径均捕获到真实模型响应及匹配请求 ID。只读空结果属于正常结果；真正的 reasoner fallback 不算通过。
- 安装/setup/doctor 使用独立文件验收：初始化、重复运行幂等、保留既有 heartbeat 周期和 session 均通过，见 [bootstrap 结果](20261101-readme-bootstrap-results.json)。安装包发现、共享默认记忆检索的先前固定宿主证据见 [实施验收](20261101-implementation-validation.md)。

完整一轮原始结果见 [修复前完整场景结果](20261101-readme-gemini-before-crossday-fix-results.json)，后续只重测受影响场景，见 [修复后定向复测](20261101-readme-gemini-results.json)。早期一次性连接的结果单独保留为 [传输诊断](20261101-readme-gemini-disconnected-results.json)，不能用其中的降级回复作为通过证据；持续连接验证见 [传输复测](20261101-readme-gemini-transport-results.json)。

## 场景结果

| 编号 | 原版场景 | 结果与具体证据 |
| --- | --- | --- |
| R01 | 你现在在做什么 | 通过：回答书房整理蓝色笔记本，已有日记逐字不变 |
| R02 | 空白补全、刚刚及再次追问 | 通过并复测：首次真实生成并落盘，同一聊天追问复用，未重复写入 |
| R03 | 昨晚八点 | 通过：归一化为 `past_point`，命中昨晚 20:00 沙发看《河流》纪录片 |
| R04 | 昨晚在干嘛 | 通过：归一化为 `past_range`，回复与晚饭后看纪录片的记录一致，无写入 |
| R05 | 这几天、最近趣事 | 通过：概括串起三天的校对《雨巷》、篮球、烧烤；趣事定位已有三分球事件 |
| R06 | 最近一次知道自己错了 | 通过：命中咖啡馆记错读书会时间、向林沫道歉的记录 |
| R07 | 周末节奏 | 通过：真实测试日期是周日，补全慢起、喝茶、阅读，事件时间不在未来 |
| R08 | 家居服→健身→回家 | 通过：全部由自然聊天触发；两次 `timeline_transition` 实际写入，追问与地点、衣着一致 |
| R09 | 书房／咖啡馆氛围 | 通过场景一致性检查：上下文正确注入，分别回复安静校对和音乐、朋友碰头；语气均自然，无协议字段。语气差异属本次样本观察，不是对任意生成的保证 |
| R10 | 搬家长事件细化 | 通过并复测：生成拆箱、归类书籍阶段并关联原事件；原 720 分钟长事件仍保留 |
| R11 | 跨日旅行 | 修复后通过：候选中包含昨天的旅行；今天的新阶段写入 `Parent_Event: travel-macro`，昨天日记逐字不变；回答仍在大理、尚未返回上海 |
| R12 | 结构化 Persona 优先 | 通过：冲突的东京／开车／蹦极 legacy 输入未覆盖 profile；未调用 legacy 提取 |
| R13 | legacy 提取与缓存 | 通过：移除测试 profile 后由 Gemini 提取，输入未变时复用相同缓存 |
| R14 | 闲聊、只读与长期记忆分工 | 复测通过：普通计算不写入；只读无记录返回 `empty_window`，写入 0 次；MEMORY/profile 不变 |
| R15 | 不同聊天的连续性 | 通过：两个不同 session 复用同一事件与家居服，日记不变 |
| R16 | 主动问候 | 本机可测部分通过：停止／恢复开关、allowed 预检、Gemini 生成、`no-route` 不计成功、pending 抑制重复。外部投递仍未验证 |

R05 的三日概括与 R03/R04 的范围分类在捕获结果后又做了更严格的逐项复核；脚本也补充了相应断言。

## 本轮发现与修复

### 跨日日记读取衔接

README 承诺跨日长事件可细化当前阶段。实际测试中，prompt hook 读取了昨天开始的大理旅行，但正式 `timeline_resolve` 的 `now` 收集窗口只有今天，`candidate_facts` 为零。模型只能从聊天上下文生成新事件，无法复制父事件 ID。

此结构在原版基线中已存在，并非本次适配新引入。修复复用现有 `collectActiveFacts` 和 `promptTimelineLookbackDays`，把当前窗口之外仍在既有持续窗口内的事件作为当前查询背景传给 reasoner；同日读取缓存并避免重复候选。历史查询范围、预计时长判断规则、日志展示、工具 schema 和消费协议保持原样。新增回归覆盖跨日父事件、同日去重、过期记录排除及历史范围隔离。

### 两个验收脚本问题

1. 一次性 CLI RPC 在 `chat.send` 获得接收回执后断开连接，嵌套 `agent.wait` 继承的观察范围被取消。改为持续的公开 SDK 连接后，空白补全和周末补全成功；没有绕过宿主取消机制或改用 completion API。
2. 原协议将 reasoner 的 `rationale.uncertainty` 放在 `Raw error:` 说明中。Gemini 合法返回“只读且无记录”的不确定性时，脚本过宽的正则将它误算为降级。已区分正常空结果与真实 fallback；保留原协议字段和文本约定。

模型响应关联检查同时兼容纯 JSON 和代码围栏内的 JSON，与生产解析规则一致。

## 可复现入口与限制

入口是 `scripts/verify-openclaw-live.mjs`，场景在 `scripts/readme-live-scenarios.mjs`，持续连接助手为 `scripts/live-gateway-client.mjs`。除原有 host/node/model 环境变量外：

```powershell
$env:OPENCLAW_LIVE_MODEL = 'google/gemini-3.8-flash'
$env:HER_LIVE_STORE_SNAPSHOT = '<用户授权的官方 snapshot 目录>'
$env:HER_LIVE_SCENARIOS = '<repo>/scripts/readme-live-scenarios.mjs'
$env:HER_LIVE_REPORT = '<repo>/docs/gemini-results.json'
# 可选：只复测指定场景；不设置则运行全部
$env:HER_LIVE_CASES = 'R02,R10,R11,R14'
```

实际使用私有 TEMP/TMP 目录，具有当前用户、SYSTEM 和管理员 ACL；官方 snapshot/restore 会校验存储位置。不能把普通共享临时目录默认为凭证快照安全目录。

未验证范围：外部消息投递及成功回执、浏览器渲染／通知／断线重连、真实语音转写、外部 Persona Skill 自动同步、WSL 同步、向量检索质量。测试只验证 Her 对 profile 的消费，不将合成 profile 当作已运行外部 Persona Skill。主动问候使用合成八小时前的活动时间和手动调度，并未等待八小时或自然周期。

官方 [WebChat 文档](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/web/webchat.md) 明确 WebChat 不是可复用的出站渠道；固定版 [heartbeat 文档](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/gateway/heartbeat.md) 说明缺少外部 route 的行为。因此本次不能宣称主动问候已完整送达，也不能把本机样本推及所有模型输出。

## 收尾状态

- 完整运行覆盖 R01–R16；修复后定向重跑 R02、R10、R11、R14，全部通过，没有用跳过或降级结果抵充成功。
- 5 套专项回归共 50 项通过，TypeScript 类型检查和构建通过。补充同日模式（lookback 0/1）边界后，来源收集的 9 项测试及构建再次通过；实际 Gemini 使用既有默认 7 天 lookback。脚本语法检查、按仓库换行配置执行的 `git diff --check` 通过。
- 复核捕获数据：三日摘要同时覆盖三个日期的经历；历史点／范围分类正确；修复前后同一旅行父日记逐字一致。
- 所有临时 Gateway 已退出，隔离 workspace/config/state 已删除。授权的官方全局快照及私有临时根目录已删除，两次失败尝试的临时目录也已清理。未发送外部消息，未修改正常部署配置和用户日记。
- 原始报告保留合成测试文本、响应和诊断证据；其中的临时文件路径是历史记录，不代表文件仍存在。
