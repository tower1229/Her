# Proactive Greeting（主动问候）需求文档

> 状态：设计草案（可实现 / 可验收）
> 适用：OpenClaw + `stella-timeline-plugin`（Her）
> 目标：提升 OpenClaw 的人格化沉浸感——在**可配置的静默时间间隔**后（默认 **7h**），根据 persona 设定主动向用户发送一条轻问候。功能必须可开关，并具备可控、可查、可节流、可补偿。

---

## 1. 任务全貌（一句话 + 全链路）

本功能由三部分构成：

1. **消息事件 hook（输入/输出）**：由 `stella-timeline-plugin` 在运行时注册 OpenClaw hook；入站以 `message:preprocessed` 作为“有效直接消息”的权威来源，出站以受控 heartbeat session 的 `message:sent` 回写状态文件（唯一事实源）
2. **Heartbeat 巡检（触发器）**：OpenClaw 定期运行专用 Heartbeat，读取 `HEARTBEAT.md` + 状态文件，决定“发 / 不发”
3. **问候生成（persona 驱动）**：当且仅当规则允许时，生成 1 条符合 persona 气质、低压力的问候并发送

核心原则：

- **可控**：有开关、有节流、有惩罚（未回复则降低频率）、不打扰（近期有其他外发则避免叠加）
- **可查**：状态文件可解释每次 decision；可选审计日志可追溯
- **可补偿**：以状态文件为唯一事实源，heartbeat 异常后可补跑“巡检”（但不绕过规则强行发）

OpenClaw 侧行为约束（平台既有契约）：

- Heartbeat 读取 `HEARTBEAT.md` 并严格遵守
- 无事可做时必须回复 `HEARTBEAT_OK`

---

## 2. 术语与统计口径（必须一致）

### 2.1 “静默时长（idle）”的统计口径（混合统计）

- **入站消息（Inbound）**：来自用户的**有效直接消息**，按**混合统计**口径处理（不区分 channel / account / conversation）。
- 只要任意渠道在阈值间隔内有**有效直接消息**，就视为“未静默到阈值”。
- 本口径默认建立在**单一人类用户 / 单一陪伴对象工作区**前提上；若同一 workspace 面向多个真实用户，必须改为按联系人维度拆分状态文件，本设计不直接适用。

#### 2.1.1 计入口径（必须）

计入 `last_user_message_at` 的事件：

- 用户主动发送的文本消息
- 用户主动发送的语音/图片/附件，并伴随可视为“直接触达”的消息事件
- 用户在任意 channel/account/conversation 中发起的自然语言输入

实现约束（生产版必须）：

- `message:preprocessed` 是“是否算有效直接消息”的**权威事件源**
- `message:received` 只可用于早期审计、粗粒度到达记录或兜底，不得单独承担语音转写、富媒体判定、opt-out/opt-in 识别
- 若富媒体消息在 `message:preprocessed` 后仍无法形成可解释的直接触达文本/转写，则默认不计入 `last_user_message_at`

不计入 `last_user_message_at` 的事件：

- system message / webhook 回执 / delivery receipt
- agent 自发消息
- tool message / 内部任务消息 / 状态同步消息
- reaction、typing、presence、已读回执等轻交互
- 消息编辑事件（默认不算新消息；除非未来版本另行定义）
- 撤回消息
- 多端同步导致的重复投递事件（应通过事件幂等去重）

### 2.2 “问候消息（social outbound）”与“其他外发（non-social outbound）”

- **问候消息**：本需求下的“主动问候”外发。
- **其他外发**：主要指**受控自动化外发**，例如由专用 session / agent 承载的 cron 提醒、任务通知、系统反馈。
- 两者必须分别记录，以实现“反打扰节流”（例如 6h 内刚发过 cron 通知则不再问候）。
- 普通用户会话中的自然回复不依赖本字段做分类；它们本身已经意味着用户并未处于“静默超过阈值”的状态。

### 2.3 补偿机制的单一事实源（必须）

- **`engagement_state.json` 是主动问候判定的运行态事实源**。
- 补偿机制只依赖状态文件字段，不依赖 OpenClaw 内部事件缓冲或日志推断。
- 静态策略源来自 OpenClaw config / plugin config；persona 来源来自 persona contract。

---

## 3. 用户体验目标（问候策略）

当满足触发条件时，系统发送 1 条短、温暖、低压力的问候：

- **只发一条**，不连发、不追问
- **不提内部规则**（不提“静默阈值”“系统检测到”“自动化”）
- 语气轻：像路过打招呼
- **persona 一致**：用词、语气、称呼应与 persona contract 对齐（见第 9 节）

示例（仅参考）：

- 想起你了，来问候一下，今天还顺利吗？
- 轻轻冒个泡，愿你今天一切都好。
- 路过来打个招呼，最近还好吗？

禁止示例：

- 你怎么这么久没回我？
- 我检测到你超过 7 小时没有说话。

---

## 4. 可配置项（默认值必须满足本需求）

### 4.1 功能开关

- 默认：**关闭**（生产默认关闭；首次启用必须由 config 显式开启，迁移不得自动开启）
- 开关来源：优先从 OpenClaw config / plugin config 读取（实现细节见第 10 节）

### 4.2 静默阈值（默认 7h）

- `idleThresholdHours`：默认 **7 小时**
- 最小值建议：≥ 1h（避免过于频繁）

### 4.2.1 Heartbeat 与“静默阈值”的关系（重要）

Heartbeat 的 `every` 是**巡检频率**，不是“问候频率”。本功能的实际触发频率由下列组合决定：

- `idleThresholdHours`（默认 7h）
- `minHoursBetweenCheckins`（默认 24h，硬节流）
- 未回复惩罚（达到阈值后提高到 72h）

因此：

- 即使 `every: 30m`，也不会导致 30 分钟发一次问候；它只是在 30 分钟粒度上“有机会检查一次是否该发”。

### 4.3 白天时段（默认 09:00 - 21:30）

- 以 `user_timezone` 判定
- 默认：09:00 - 21:30

### 4.4 节流与反打扰（默认值）

- `minHoursBetweenCheckins`：默认 **24h**
- `minHoursSinceNonSocialOutbound`：默认 **6h**，但在 v1 中仅作为保留配置项；要安全生效，必须先为其他自动化外发建立显式 session 分类表

### 4.5 未回复惩罚（默认值）

- `unansweredPenaltyThreshold`：默认 2 次
- `unansweredPenaltyIdleHours`：默认 **72h**（当连续未回复次数达到阈值时，提高静默门槛）

---

## 5. 文件与目录约定

建议新增（或确认存在）以下结构（路径以 workspace 根目录为准）：

```
HEARTBEAT.md
memory/
  engagement_state.json
src/
  engagement/
    should_send_proactive_greeting.ts
    engagement_state.ts
    engagement_hooks.ts
  runtime/
    openclaw_timeline_runtime.ts
```

说明：

- `HEARTBEAT.md`：OpenClaw Heartbeat 的任务说明入口（平台约定文件名）。
- `memory/engagement_state.json`：主动问候状态文件（唯一事实源）。
- `src/engagement/engagement_hooks.ts`：主动问候相关的 hook 处理器，供插件注册。
- `src/runtime/openclaw_timeline_runtime.ts`：在插件运行时通过 `api.on(...)` / `api.registerHook(...)` 注册 typed hooks 与 internal hooks。
- `src/engagement/*`：纯逻辑与状态读写封装，便于单测。
- 对于本仓库，**默认实现路径是原生插件运行时注册 hooks，而不是 workspace `hooks/` 目录**。
- 仅当实现侧明确选择“纯 workspace hook 包”方案时，才需要单独维护 `hooks/` 目录；该方案不是本需求的推荐实现。

---

## 6. 状态文件（唯一事实源）

### 6.1 文件路径

`memory/engagement_state.json`

### 6.2 Schema（v1.0）

```json
{
  "schema_version": "1.0",
  "state_revision": 0,
  "user_timezone": "America/Los_Angeles",
  "last_user_message_at": null,
  "last_proactive_checkin_at": null,
  "last_non_social_outbound_at": null,
  "last_outbound_reason": null,
  "last_successful_proactive_message_id": null,
  "last_inbound_dedupe_key": null,
  "last_outbound_dedupe_key": null,
  "recent_inbound_dedupe_keys": [],
  "recent_outbound_dedupe_keys": [],
  "last_proactive_decision_token": null,
  "pending_proactive_send": false,
  "proactive_greeting_enabled": false,
  "idle_threshold_hours": 7,
  "proactive_opt_out": false,
  "unanswered_proactive_count": 0,
  "last_heartbeat_checked_at": null,
  "last_decision": null,
  "last_error": null
}
```

字段含义：

- `schema_version`：固定 `"1.0"`。
- `state_revision`：状态版本号；每次成功写入后递增 1，用于并发控制 / 乐观锁。
- `user_timezone`：仅用于白天时段判定与展示；若无效或缺失，使用实现侧默认时区并记录 warning。
- `last_user_message_at`：最近一次**有效直接入站消息**时间（混合统计口径）。
- `last_proactive_checkin_at`：最近一次主动问候发送成功时间。
- `last_non_social_outbound_at`：为后续“其他受控自动化外发”预留的时间戳字段。主动问候 v1 不会主动写入它，也不依赖它做判定。
- `last_outbound_reason`：最近一次外发原因。建议枚举：
  - `proactive_greeting`
  - `reminder`
  - `task_update`
  - `cron`
- `last_successful_proactive_message_id`：最近一次主动问候成功发送后的消息 id，用于审计与去重。
- `last_inbound_dedupe_key`：最近一次成功处理的入站去重键，用于审计与快速定位。
- `last_outbound_dedupe_key`：最近一次成功处理的外发去重键，用于审计与快速定位。
- `recent_inbound_dedupe_keys`：最近一小段时间内已处理的入站去重键集合（建议 ring buffer / 有界数组），用于幂等去重，避免仅靠 `last_inbound_dedupe_key` 无法覆盖乱序重试。
- `recent_outbound_dedupe_keys`：最近一小段时间内已处理的外发去重键集合（建议 ring buffer / 有界数组），用于幂等去重，避免仅靠 `last_outbound_dedupe_key` 无法覆盖乱序重试。
- `last_proactive_decision_token`：最近一次允许发送主动问候时生成的决策 token，用于防重复发送。
- `pending_proactive_send`：是否存在“已决策允许发送、但尚未完成成功回写”的主动问候发送流程。
- `proactive_greeting_enabled`：功能开关（状态文件层面，可被 config 覆盖；实现时需定义优先级）。
- `idle_threshold_hours`：静默阈值（默认 7h；同样可被 config 覆盖）。
- `proactive_opt_out`：用户是否明确关闭主动问候。
- `unanswered_proactive_count`：连续多少次主动问候未获用户有效直接回复。
- `last_heartbeat_checked_at`：最近一次 heartbeat 巡检时间（用于补偿/监控）。
- `last_decision`：最近一次 decision 的结构化摘要（建议至少包含 `{ ts, ok, reason_code, idle_hours, local_time, rule_snapshot }`）。
- `last_error`：最近一次状态读写或发送链路错误摘要（非必需字段，但生产版强烈建议实现）。

时间格式要求（生产版必须）：

- 所有 `*_at` 字段必须使用 **UTC ISO-8601** 字符串存储。
- 所有时间比较逻辑默认基于 UTC。
- 仅在“白天时段”判定时，将 UTC 转换到 `user_timezone`。
- 若 `user_timezone` 非法、缺失、或解析失败：
  - 使用实现侧默认时区继续判定
  - 记录 warning / `last_error`
  - 不得因 timezone 异常直接触发主动问候

### 6.3 状态文件读写约束（生产版必须）

#### 6.3.1 原子写入与并发控制

由于 `message:preprocessed`、`message:sent`、heartbeat、补偿巡检都可能更新同一状态文件，生产版必须满足：

- **原子写入**：建议先写临时文件，再通过 rename 替换正式文件。
- **乐观锁 / revision 校验**：写入时校验 `state_revision`；若 revision 已变化，则重读后重试。
- **禁止并发覆盖**：不得直接以“读 → 改 → 覆盖写”的无保护模式更新状态。

#### 6.3.2 幂等要求（必须）

- 每个入站 / 外发 hook 事件都必须生成唯一 `dedupe_key`。
- `dedupe_key` 优先使用平台文档化的 `messageId`；若 `messageId` 缺失，则必须回退为实现侧稳定组合键（建议由 `channelId + conversationId + from/to + timestamp + normalized content` 组成，并做 hash）。
- 不得仅依赖 `last_inbound_dedupe_key` / `last_outbound_dedupe_key` 做幂等；生产版必须使用 `recent_*_dedupe_keys`（或等价外部幂等存储）覆盖乱序重试与重复回放。
- 若 `dedupe_key` 已处理过，则不得重复推进状态。
- 幂等命中时，允许直接返回 success/no-op。

#### 6.3.3 损坏恢复与 schema 迁移

生产版必须定义以下恢复策略：

- 文件缺失：使用默认值初始化，并写回新文件。
- 字段缺失：按默认值补齐，并写回。
- JSON 损坏 / 半写入 / 空文件：
  - 优先尝试读取 `.bak` 或最近一次有效快照
  - 若恢复失败，则生成默认状态并记录错误
- `schema_version` 不兼容：必须执行显式迁移；迁移失败时不得直接触发主动问候。

恢复后的默认状态必须满足：

- 若 `last_user_message_at` 不存在，则不允许主动问候。
- 恢复行为必须可记录、可审计。

---

## 7. Heartbeat 触发与配置（OpenClaw 原生）

### 7.1 Heartbeat 频率

推荐：

- `every: 30m`（对 7h 阈值足够；误差上限可控）
- `target: "last"`（必须显式配置；OpenClaw 默认不是自动回到最近联系人）
- `session: "proactive-greeting"`（建议显式独立 session 名，避免与其他 heartbeat / cron 共用分类面）
- `isolatedSession: true`（建议开启，避免消费完整主会话历史，同时给主动问候一个可识别的专用 session）
- `lightContext: true`（建议开启，降低 token 成本）

### 7.2 Heartbeat 目标与作用

Heartbeat 每次运行只做：

- 读取 `memory/engagement_state.json`
- 尝试记录 `last_heartbeat_checked_at = now`（原子写入；若因 revision 冲突失败，可放弃本次 heartbeat 时间戳写入，但不得影响主判定流程）
- 计算静默时长并判断规则
- 若允许发送，先生成 `decision_token` 并写入：
  - `last_proactive_decision_token = <token>`
  - `pending_proactive_send = true`
- 满足条件则发送问候，否则返回 `HEARTBEAT_OK`

生产版实现约束：

- 必须显式设置 `target: "last"` 或明确的 `target + to + accountId`；仅配置 `every` 不足以形成对外投递
- 若使用本需求推荐路径，Heartbeat 应运行在**专用 session** 中，以便 `message:sent` 回调能够按 `event.sessionKey` 将其稳定分类为 `proactive_greeting`
- 若工作区还存在其他 heartbeat 任务，不得与主动问候复用同一 heartbeat session

### 7.3 `HEARTBEAT.md` 行为契约（建议模板）

`HEARTBEAT.md` 的内容应确保：

- 先读 `memory/engagement_state.json`
- 判断规则全部显式列出
- 不满足条件时 **必须回复** `HEARTBEAT_OK`
- 满足时只发 1 条简短问候

---

## 8. 触发规则（硬约束 / 可验收）

### 8.1 必须满足（ALL true 才能发）

1. `proactive_greeting_enabled == true`（开关开启）
2. `last_user_message_at` 存在（没有任何入站消息则不主动启动）
3. `idle_hours >= idle_threshold_hours`（默认 7h）
4. 当前本地时间在 `09:00 - 21:30`（以 `user_timezone` 判定）
5. `last_proactive_checkin_at` 为空或距离现在 `>= 24h`
6. `proactive_opt_out == false`
7. 若 `unanswered_proactive_count >= 2`，则要求 `idle_hours >= 72`（可配置则在实现时补齐配置项）

### 8.2 未回复惩罚（最小版）

- 第一次触发：`idle >= idle_threshold_hours`（默认 7h）
- 连续 2 次主动问候未回复后：提高门槛到 `idle >= 72h`
- 一旦用户出现**有效直接入站消息**：`unanswered_proactive_count = 0`，恢复基线（`idle_threshold_hours`）

说明：

- “恢复基线”这里指恢复为 `idle_threshold_hours`（默认 7h）。

---

## 9. Persona 驱动的问候生成（沉浸感核心）

### 9.1 Persona 数据来源（Her 侧约束）

问候文案必须与 OpenClaw persona 设定一致，数据来源优先级建议：

1. `persona/PERSONA_PROFILE.md`（已被 Timeline 解析为 PersonaContractV1）
2. legacy `SOUL.md` / `MEMORY.md` / `IDENTITY.md`（若存在兼容抽取）

实现侧不要求“每次 heartbeat 都做重推理式 persona 抽取”；优先复用 Timeline 现有的 persona contract 读取/缓存机制。

### 9.2 文案生成规则（必须）

- 生成 1 条短句
- 不提时间阈值与自动化
- 不连发、不多问
- 文风/称呼与 persona 一致（例如昵称、敬语/不敬语、克制程度、情绪强度）

### 9.3 建议实现策略（可指导实施）

- Heartbeat 先用纯函数判定“是否允许发”
- 允许后再执行“文案生成”
- 文案生成可以是：
  - 模板 + 少量 persona slot（最低成本、最稳）
  - 轻量 LLM 生成（更拟人，但要控制输出长度与风险）

本需求最小版建议：**模板优先**，后续再升级为 LLM 生成。

### 9.4 Persona 缺失时的退化策略（生产版必须）

- persona contract 不可用、读取失败、或字段不完整时：
  - 默认回退到**通用中性模板**
  - 不得因 persona 缺失导致状态文件损坏或 heartbeat 异常退出
- 若实施侧选择“persona 缺失时禁止主动问候”，则必须在配置中显式声明，并在 `last_decision.reason_code` 中记录原因。

最小版默认建议：**回退到通用中性模板，而不是直接禁发。**

---

## 10. Hooks：状态写入职责

### 10.1 Hook：用户入站消息（on_user_message）

权威触发来源：OpenClaw internal hook `message:preprocessed`。

可选辅助来源：OpenClaw typed hook `message_received`，仅用于早期审计或粗粒度到达记录，不作为“有效直接消息”事实源。

职责：

- 先做事件幂等校验；若 `dedupe_key` 已处理过，则 no-op
- `last_user_message_at = now`（UTC）
- `last_inbound_dedupe_key = dedupe_key`
- `unanswered_proactive_count = 0`
- 若用户表达“不想被主动联系/少联系/别太频繁”等，设置 `proactive_opt_out = true`
- 若用户明确恢复接受主动联系（opt-in），设置 `proactive_opt_out = false`
- 若存在 `pending_proactive_send = true`，`on_user_message` **不得作为正常路径的主清理方**。
- 仅当实现侧明确判定该标记属于历史脏状态 / 超时残留时，才允许执行兜底清理，并必须记录原因到审计信息或 `last_error`。

注意：

- 由于口径为“混合统计”，该 hook 不需要按 channel/account 分桶；任何**有效直接入站**都更新同一份状态。
- reaction / typing / system message 等不计入本 hook 的有效入站。
- 语音 / 图片 / 附件是否计入，以 `message:preprocessed` 暴露的 `bodyForAgent` / `transcript` / 富媒体理解结果为准，而不是 `message_received` 的早期原始载荷。

### 10.2 Hook：外发消息发送结果（on_outbound_sent）

权威触发来源：OpenClaw internal hook `message:sent`。

选择 `message:sent` 而非 typed `message_sent` 的原因：

- `message:sent` 事件对象带 `sessionKey`，可以把外发稳定归类到某个受控 session
- typed `message_sent` 文档化字段不包含 `reason` / `sessionKey`，不足以承担本需求的分类职责

分类规则（生产版必须显式实现）：

- 若 `event.sessionKey` 命中专用 proactive heartbeat session，且当前存在 `pending_proactive_send = true`，则该次外发归类为 `proactive_greeting`
- v1 **不实现** reminder / task_update / cron 的通用 session 分类表；其他 session 默认只允许写调试审计，不得推进节流时间戳

说明：`on_outbound_sent` 是 `pending_proactive_send` 的**主清理责任方**。

职责（按受控分类结果处理）：

- 先做事件幂等校验；若 `dedupe_key` 已处理过，则 no-op
- 若本次外发被归类为 `proactive_greeting` 且发送成功：
  - `last_proactive_checkin_at = now`（UTC）
  - `last_outbound_reason = "proactive_greeting"`
  - `last_successful_proactive_message_id = <message_id>`
  - `last_outbound_dedupe_key = dedupe_key`
  - `unanswered_proactive_count += 1`
  - `pending_proactive_send = false`
  - `last_proactive_decision_token` 保留到下一次决策覆盖，用于审计与重复发送阻断
- 否则：
  - 允许记审计日志 / debug 信息
  - 但不得推进 `last_non_social_outbound_at`

失败处理：

- 若发送失败，不应推进 `last_*_outbound_at`（避免“发送失败但被节流”的假阳性）。
- 若本次失败对应 `pending_proactive_send = true` 的主动问候发送：
  - 必须清除 `pending_proactive_send`
  - 保留或更新 `last_proactive_decision_token` 供审计
  - 记录 `last_error`
- 可记录额外诊断字段（如 `last_outbound_error`），但不是最小版硬要求。

发送超时 / 无回调处理：

- 若 `pending_proactive_send = true` 持续超过实现侧设定的超时时间（建议 10-30 分钟），可判定为“发送链路未完成”。
- 超时清理不得直接视为发送成功；只能：
  - 清除 `pending_proactive_send`
  - 保留 `last_proactive_decision_token`
  - 记录 `last_error`
- 超时清理可由补偿层、独立 watchdog、或实现侧 supervisor 执行，但不得绕过正常发送结果回写逻辑。

---

## 11. 判定函数：shouldSendProactiveGreeting(state, now)

该函数必须是：

- **纯函数**（输入 state + now，输出 boolean 或带原因的结构化结果）
- 不读写文件、不访问外部系统
- 单测覆盖关键边界（7h、24h、6h、72h、时段边界）

建议输出结构：

```ts
type IdleCheckinDecision =
  | {
      ok: true;
      reason_code: "allowed";
      idle_hours: number;
      local_time: string;
      rule_snapshot: Record<string, unknown>;
    }
  | {
      ok: false;
      reason_code: string;
      idle_hours: number;
      local_time: string;
      rule_snapshot: Record<string, unknown>;
    };
```

在 Heartbeat 中：

- `ok: false` → 回复 `HEARTBEAT_OK`
- `ok: true` → 生成问候文本并发送

生产版额外要求：

- 判定函数只返回“是否允许发送 + 原因码 + 快照摘要”，不得直接推进任何状态。
- 重复发送保护必须在 heartbeat 执行层完成，而不是依赖纯函数副作用。
- 建议将 `last_decision` 的最小结构固定为 `{ ts, ok, reason_code, idle_hours, local_time, rule_snapshot }`，避免不同实现者写入格式不一致。

---

## 12. 补偿与监控（最小可用）

### 12.1 监控点（生产版最小要求）

至少监控以下信号：

- `last_heartbeat_checked_at` 与当前时间差过大（例如 > 2h）视为 heartbeat 异常
- 状态文件读写失败次数
- 主动问候发送成功率
- 重复发送次数 / 幂等命中次数
- `HEARTBEAT_OK` 比例

### 12.2 补偿原则

- 补偿层只负责“补跑一次巡检”（即尽快触发一次 heartbeat 检查），不直接绕过规则强行发问候。
- 补偿巡检同样必须遵守状态文件、幂等、节流、反打扰、白天时段等全部规则。
- 补偿层不得跳过 `decision_token` / `pending_proactive_send` 防重流程。

### 12.3 补偿触发规则（建议）

- 若 `last_heartbeat_checked_at` 距当前时间超过 2h：允许触发一次补偿巡检。
- 同一观察窗口内应限制补偿频率，避免补偿风暴。
- 补偿失败应记录错误并可告警。

### 12.4 补偿执行边界（必须明确）

- 补偿层可由外部 watchdog、独立巡检任务、或实现侧 supervisor 承担。
- 补偿层不得与 heartbeat 共享“无保护写路径”。
- 补偿层只能触发“再做一次巡检”，不得直接伪造 `message:sent(success)` 或跳过正常发送链路。

---

## 13. 观测与审计（可查）

最小版可查性要求：

- 状态文件字段能解释“为什么这次发/没发”
- 外发成功后能追溯 `last_outbound_reason` 与时间戳

推荐（可选增强）：

- 维护一份 append-only 的审计日志（例如 `memory/engagement_audit.jsonl`），记录每次 heartbeat 的 decision 与摘要（但不是最小版硬要求）。

### 13.1 推荐指标与告警（生产版建议）

建议至少上报以下指标：

- `heartbeat_runs_total`
- `heartbeat_ok_total`
- `proactive_greeting_sent_total`
- `proactive_greeting_send_failed_total`
- `state_read_failed_total`
- `state_write_failed_total`
- `idempotent_hit_total`
- `duplicate_send_blocked_total`

建议最小告警：

- heartbeat 长时间未运行
- 状态文件连续读写失败
- 主动问候发送失败率异常升高

---

## 14. 实施指南（清晰可落地）

### 14.1 接入点选择（建议）

- Heartbeat：使用 OpenClaw 原生 `HEARTBEAT.md` + heartbeat 配置，且显式设置 `target: "last"`、`session: "proactive-greeting"`、`isolatedSession: true`、`lightContext: true`
- 入站：使用 internal hook `message:preprocessed` 作为事实源；typed `message_received` 只做可选辅助
- 外发：使用 internal hook `message:sent` 按 `sessionKey` 做受控分类，不再依赖不存在的 `reason` 字段
- Persona：复用 Timeline 已有 persona contract 加载逻辑（避免重复造轮子）

### 14.2 具体实现步骤（建议按顺序）

1. **定义配置项与默认值**（第 4 节）
   - 最少需要：`enabled`（开关）、`idleThresholdHours`（默认 7）、activeHours（默认 09:00-21:30, timezone 来自 state）
2. **实现状态文件读写**（第 6 节）
   - 支持缺失文件/缺失字段 → 用默认值补齐并写回
3. **实现纯函数判定**：`shouldSendProactiveGreeting(state, now, config)`（第 11 节）
   - 输出 `{ok:false, reason}` 以便写入 `last_decision`
4. **接入入站 hook**：`message:preprocessed` → 更新 `last_user_message_at`、清零未回复计数、处理 opt-out/opt-in（第 10.1 节）
5. **接入外发 hook**：`message:sent` → 按 `sessionKey` 做受控分类，并在成功时更新 `last_proactive_checkin_at`（第 10.2 节）
6. **编写 `HEARTBEAT.md`**
   - 明确“读 state → 判定 → 不发则 `HEARTBEAT_OK` → 发则生成 1 条问候”
7. **补齐最小单测与手工用例**（第 15 节）

### 14.3 发送防重与状态提交顺序（生产版必须）

建议顺序：

1. Heartbeat 读取 state 并完成纯函数判定
2. 若允许发送：生成 `decision_token`
3. 以原子写入方式提交：
   - `last_proactive_decision_token = <token>`
   - `pending_proactive_send = true`
4. 在专用 proactive heartbeat session 中执行消息发送（需显式 `target: "last"` 或明确的 `target + to + accountId`）
5. 在 `message:sent(success)` 中按 `event.sessionKey` 回写成功状态
6. 若发送失败：清除 `pending_proactive_send`，记录 `last_error`

要求：

- 同一 `decision_token` 不得成功发送两次。
- 若 heartbeat 重跑且发现 `pending_proactive_send = true`，默认不得再次发起新的主动问候发送。

### 14.4 配置优先级（必须在实现时明确）

建议优先级（从高到低）：

1. OpenClaw config / plugin config（全局策略）
2. `memory/engagement_state.json`（运行态事实 + 可持久化开关）

举例：

- 配置中关闭功能时，即使状态文件 `proactive_greeting_enabled=true` 也应视为关闭
- 配置中设置 `idleThresholdHours` 时覆盖状态文件 `idle_threshold_hours`

---

## 15. 验收标准（Definition of Done）

功能验收：

- 功能开关开启后：静默 ≥ `idle_threshold_hours`（默认 7h）+ 白天时段满足条件时，会发送 1 条问候
- 未满足任一条件时，heartbeat 输出严格为 `HEARTBEAT_OK`
- 24h 节流生效（不会 24h 内重复问候）
- 6h 反打扰生效（刚发过**受控** cron/提醒外发时不问候）
- 连续 2 次问候未回复后，门槛提高到 72h
- 有效直接入站消息会清零 `unanswered_proactive_count`
- 用户 opt-out 后不再主动问候；opt-in 后恢复

工程验收：

- `shouldSendProactiveGreeting` 有单测覆盖边界（7h、24h、6h、72h、时段边界）
- 状态文件读写具备容错（文件缺失/字段缺失/JSON 损坏时使用默认值、备份或迁移策略恢复）
- 状态更新具备原子写入与 revision 校验，避免并发覆盖
- 入站 / 外发 hook 具备事件幂等处理
- 幂等实现能够覆盖乱序重试与重复回放，不仅限于“最后一个 dedupe_key”
- 存在重复发送保护：同一 `decision_token` 不会成功发送两次
- persona 缺失时具备明确退化策略
- heartbeat 异常时可通过补偿巡检恢复检查能力
- Heartbeat 配置显式声明投递目标；不会出现“heartbeat 运行了但默认不外发”的假上线
