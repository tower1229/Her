# timeline-skill 通用协议 (v1)

本文档定义了 `timeline-skill` 的最终输入/输出契约。
它是从 `timeline-skill-design.md` 中提取出的面向实现的协议规范。

## Skill 职责

`timeline-skill` 充当事实层（Factual Timeline Layer）：

- 从聊天/会话历史以及记忆文件中读取确凿的事实
- 生成或复用当前/过去的情节（Episode）事实
- 持久化每日的规范记忆条目（Append-only 仅追加模式）
- 为下游消费端 Skill 返回结构化的时间线状态

## 输入 (Input)

### 显式输入 (Explicit Input)

- `target_time_range` (必填)
  - 自然语言或标准化的时间窗口描述符
  - 示例：`now_today`、`recent_3d`、明确的开始/结束时间

### 自动收集的内部输入 (Internal Auto-Collected Inputs)

- `sessions_history` (最高优先级的硬性事实锚点)
- 通过 `memory_get` 读取的 `memory/YYYY-MM-DD.md` (确定性的日常状态)
- `memory_search` (语义补充召回)
- `SOUL.md`
- `MEMORY.md`
- OpenClaw 系统当前时间及此时区上下文

## 输出 (Output)

### 核心输出: `TimelineWindow`

```json
{
  "schema_version": "1.0",
  "document_type": "timeline.window",
  "anchor": {
    "now": "2026-03-20T14:30:00+08:00",
    "timezone": "Asia/Shanghai"
  },
  "window": {
    "calendar_date": "2026-03-20",
    "preset": "now_today | recent_3d | explicit",
    "start": "2026-03-20T00:00:00+08:00",
    "end": "2026-03-20T14:30:00+08:00",
    "idempotency_key": "仅用于运行时的软指纹哈希"
  },
  "resolution": {
    "mode": "read_only_hit | generated_new",
    "notes": "选填，用于调试"
  },
  "episodes": []
}
```

- 跨日查询会返回按日期升序排列的 `days: TimelineWindow[]` 数组。

### Episode 结构（面向消费者的视图）

`episodes[]` 中的条目是由脚本从 Markdown 格式的记忆段落映射而来的。

供下游消费所需的必填字段：

- `temporal.start`
- `state_snapshot.scene.location_label`
- `state_snapshot.scene.activity`
- `state_snapshot.scene.time_of_day`
- `state_snapshot.emotion.primary`
- `state_snapshot.appearance.outfit_style`
- `provenance.confidence`

## 持久化输出 (磁盘写入)

当 `resolution.mode = generated_new` 时，向以下文件追加记忆段落：

- `memory/YYYY-MM-DD.md`

格式 (扁平化的可读文本)：

```markdown
### [HH:MM:SS] {简短事件标题}

- Timestamp: YYYY-MM-DD HH:MM:SS
- Location: {简短的地点词组}
- Action: {一句话描述当下在做什么}
- Emotion_Tags: [标签1, 标签2]
- Appearance: {穿搭或可见的外观状态}
- Internal_Monologue: {一旬简短的内心独白}
```

磁盘内容中不需要任何仅供机器读取的特殊标记。

## 幂等性规则

- 使用软指纹（仅运行时）：
  - `normalize(日期) + normalize(地点) + normalize(动作) + 时间槽(time_bucket)`
- 若在同一天内匹配命中 -> `read_only_hit` 且不执行写入。
- 若未命中 -> `generated_new` 并执行追加写入。

## 硬锚点优先级 (Hard-Anchor Priority)

必须严格遵循以下读取顺序：

1. `sessions_history`
2. `memory_get`
3. `memory_search`

会话中的硬性事实（Session hard facts）绝不能被语义召回的回忆所覆盖。

## 自然推理规则 (Natural Inference Rule)

当缺乏直接的硬性事实时，`timeline-skill` 可以参考以下内容推断合理的细节：

- `MEMORY.md` (人物小传)
- `IDENTITY` 基础属性 (如性别、年龄)
- `SOUL` 人格特质

约束条件：

- 绝不可与 `sessions_history` 或已经落盘的每日记忆事实相冲突。
- 遇低置信度推断时保持保守，并通过 `provenance.confidence` 明确暴露置信度。

## 写盘责任与心跳边界 (Write Responsibility & Heartbeat Boundary)

- `timeline-skill` 是记忆持久化的**唯一写入责任方**。
- 为避免记忆丢失，生成的新条目必须在当前上下文轮次内**同步（Synchronously）追加落地**。
- 在后台 `Heartbeat`（心跳）执行记忆维护期间，`timeline-skill` 会进行最终的追加检查/写入。
- 其它 Skill 不得直接写入规范的时间线记忆条目，所有的事实写入必须交由 `timeline-skill` 处理。

## （可选）家族技能生态配合 (Family Skill Integration)

虽然 `timeline-skill` 作为独立的事实层，其自身可完全支撑纯文本的查询与事实落地。但当需要更加生动丰富的情境展示时，它可以与 `persona-skill`（表达层）及诸如 `stella-selfie` 的消费端配合：
`timeline-skill` 输出其纯粹、客观的事实 JSON。紧接着，`persona-skill` 读取该客观事实，利用其核心算法赋予符合特写人格背景的行为逻辑或表现参数，最后交由渲染层渲染。此链路非强制，内部无写死锁死，仅在组合调用下生效。
