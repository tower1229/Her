# Timeline 下游消费协议

> 状态：当前正式协议
> 目的：定义聊天层、selfie skill 与其他下游技能应如何稳定消费 Timeline 结果
> 关联：`docs/timeline-north-star.md`、`docs/timeline-query-semantics.md`、`docs/timeline-collector-reasoner-interface.md`

## 1. 为什么需要单独协议

`timeline_resolve` 的原始输出里已经有：

- `window`
- `resolution`
- `episodes`
- `trace`（仅在调用时显式请求时返回）

但这些字段更偏 runtime 与调试视角，不适合直接作为下游技能的长期依赖面。

因此从现在开始，Timeline 在成功返回且存在 `result` 时，给下游的稳定输入应优先使用：

- `result.consumption`

而不是让每个下游技能自己解析 `episodes[0].state_snapshot`。

## 2. 协议目标

下游消费协议要解决两个问题：

1. 让聊天层和 selfie skill 看到的是同一条时间现实
2. 让下游不用依赖 Timeline 内部 episode 细节就能拿到稳定字段

## 3. 稳定字段

`result.consumption` 当前是一个稳定消费视图：

- `query`
- `fact`
- `scene`（可选）
- `selfie_ready`（可选）

其中：

- `query` 与 `fact` 在当前成功分支里都会返回
- `scene` 与 `selfie_ready` 只在这次结果里存在已解析 episode 时返回
- `empty_window` 场景下，下游应预期只有 `query` 与 `fact`，而没有 `scene` / `selfie_ready`
- `allow_generate` 下会优先尝试补全空白窄窗口；只有在睡眠窗口或强约束冲突等无法安全生成时，才保留 `empty_window`
- 当保留 `empty_window` 时，下游应将其解释为“记不清/遗忘”语义，而不是“未知事实”
- 内部恢复策略已改为结构化 `recovery_hint`（仅 collector 内部使用），不再依赖 query 文本中的隐式 tag
- 若内部在 guard 恢复重试后仍无法得到合法 reasoner 输出（例如重试返回 `null` 或仍选中非法 `fact_id`），`timeline_resolve` 会降级为 `ok: true` 的 `empty_window` 遗忘输出，而不是暴露 `ok: false` 的技术错误包；真实错误原因记录在 `trace.decision.error_code` 与 `notes[1]`，供维护者通过 trace log 调试

### 3.1 `query`

表示这次 Timeline 是如何理解这次请求的：

- `preset`
- `semantic_target`
- `collection_scope`
- `resolution_mode`
- `time_interpretation`

### 3.2 `fact`

表示这次最终拿到的事实状态：

- `status`
- `source_type`
- `timestamp`（可选）
- `summary`（可选）
- `confidence`（可选）
- `continuity`（当前实现会返回，但类型上应视为可选）

### 3.3 `scene`

表示对当前命中事实的稳定场景抽取：

只在当前结果里存在已解析 episode 时返回。

- `location`
- `activity`
- `emotion_primary`
- `emotion_secondary`
- `appearance`
- `time_of_day`
- `summary`

并允许新增以下可选稳定字段：

- `city`
- `calendar_date`
- `local_timestamp`
- `timezone`
- `activity_mode`
- `continuity_relation`
- `environment_mood`
- `social_context`
- `appearance_change_expected`
- `appearance_change_reason`
- `location_props`
- `lighting_hint`
- `framing_hint`

其中：

- `city`：当前场景所属城市；若无法安全恢复则省略
- `calendar_date`：本地日期，格式 `YYYY-MM-DD`
- `local_timestamp`：本地时间戳
- `timezone`：IANA 时区名
- `activity_mode`：活动语义类别；优先来自生成场景语义
- `continuity_relation`：当前场景与前序状态的连续性关系
- `environment_mood`：当前环境氛围的简洁描述
- `social_context`：如 `alone` / `with_friends` / `in_conversation`
- `appearance_change_expected`：当前场景是否自然要求换装
- `appearance_change_reason`：换装原因；仅在需要时返回
- `location_props`：可供视觉下游复用的显著场景物件
- `lighting_hint`：稳定的光线提示
- `framing_hint`：稳定的构图提示

### 3.4 `selfie_ready`

这是给自拍等视觉下游技能的直接输入视图：

只在当前结果里存在已解析 episode 时返回。

- `location`
- `activity`
- `emotion`
- `appearance`
- `time_of_day`
- `summary`

字段集合保持不变，但内容质量应更高：

- `location`：尽量包含城市或更具体的空间锚点
- `activity`：尽量包含动作与少量现实上下文
- `emotion`：可以由主情绪与次情绪组合成更适合视觉 prompt 的短语
- `appearance`：可在不编造新事实的前提下吸收稳定外观细节
- `time_of_day`：可增强为更贴近日常现实的时段表达
- `summary`：应作为视觉下游可直接复用的一句高密度现实摘要

## 4. 使用原则

### 4.1 聊天层

聊天层优先使用：

- `consumption.fact`
- `consumption.scene`（若存在）

来组织自然回答。

如果 `consumption.fact.status = empty`，应按“当前没有命中可复用事实，且这段记忆记不清”的语义处理，而不是假定一定会有场景字段或直接回答“不知道”。

另外需要保持边界：

- `allow_generate`：优先补全非睡眠空窗，失败时用“记不清”表达
- `read_only`：允许直接 `empty_window`，不触发补全写入
- 任何内部非输入类错误（reasoner 不可用、guard 拦截等）均以遗忘语义降级，`timeline_resolve` 对外始终返回 `ok: true`；仅 `INVALID_INPUT`（query 为空）仍返回 `ok: false`

### 4.2 自拍类技能

自拍类技能优先使用：

- `consumption.selfie_ready`（若存在）

作为 prompt 的核心现实锚点。

若需要额外利用现实世界感知能力，也可以选择性读取：

- `scene.city`
- `scene.calendar_date`
- `scene.local_timestamp`
- `scene.timezone`
- `scene.location_props`
- `scene.lighting_hint`
- `scene.framing_hint`

如果该字段不存在，应视为当前结果没有可直接复用的视觉现实锚点，而不是回退去依赖 `episodes[0].state_snapshot` 的内部路径。

### 4.3 不该直接依赖的内容

下游不应直接长期依赖：

- `trace`
- `notes` 的自然语言拼接细节
- `episodes[0]` 的内部字段路径

这些字段仍可读，但不应作为长期契约。

## 5. 协议稳定性声明

从现在开始：

- 在 `timeline_resolve` 成功返回且包含 `result` 时，`result.consumption` 是 Timeline 面向下游技能的稳定消费面
- 新增字段可以加
- 已有字段含义不能随意改
- 如果将来需要改字段语义，应先更新这份文档，再改实现

## 6. 当前最直接的应用目标

当前已经准备好的目标消费链路是：

- `timeline_resolve`
- `result.consumption.selfie_ready`（当该字段存在时）
- selfie skill prompt

这样可以保证：

- 聊天里说“在家里书房整理工作”
- 当下游自拍 skill 真正接入后，也会看到相同的地点、事件、外观与状态
