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

### 3.4 `selfie_ready`

这是给自拍等视觉下游技能的直接输入视图：

只在当前结果里存在已解析 episode 时返回。

- `location`
- `activity`
- `emotion`
- `appearance`
- `time_of_day`
- `summary`

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

### 4.2 自拍类技能

自拍类技能优先使用：

- `consumption.selfie_ready`（若存在）

作为 prompt 的核心现实锚点。

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
