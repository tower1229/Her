# Timeline 下游消费协议

> 状态：当前正式协议
> 目的：定义聊天层、selfie skill 与其他下游技能应如何稳定消费 Timeline 结果
> 关联：`docs/timeline-north-star.md`、`docs/timeline-query-semantics.md`、`docs/timeline-collector-reasoner-interface.md`

## 1. 为什么需要单独协议

`timeline_resolve` 的原始输出里已经有：

- `window`
- `resolution`
- `episodes`
- `trace`

但这些字段更偏 runtime 与调试视角，不适合直接作为下游技能的长期依赖面。

因此从现在开始，Timeline 给下游的稳定输入应优先使用：

- `result.consumption`

而不是让每个下游技能自己解析 `episodes[0].state_snapshot`。

## 2. 协议目标

下游消费协议要解决两个问题：

1. 让聊天层和 selfie skill 看到的是同一条时间现实
2. 让下游不用依赖 Timeline 内部 episode 细节就能拿到稳定字段

## 3. 稳定字段

`result.consumption` 当前包含四层：

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
- `timestamp`
- `summary`
- `confidence`
- `continuity`

### 3.3 `scene`

表示对当前命中事实的稳定场景抽取：

- `location`
- `activity`
- `emotion_primary`
- `emotion_secondary`
- `appearance`
- `time_of_day`
- `summary`

### 3.4 `selfie_ready`

这是给自拍等视觉下游技能的直接输入视图：

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
- `consumption.scene`

来组织自然回答。

### 4.2 自拍类技能

自拍类技能优先使用：

- `consumption.selfie_ready`

作为 prompt 的核心现实锚点。

### 4.3 不该直接依赖的内容

下游不应直接长期依赖：

- `trace`
- `notes` 的自然语言拼接细节
- `episodes[0]` 的内部字段路径

这些字段仍可读，但不应作为长期契约。

## 5. 协议稳定性声明

从现在开始：

- `result.consumption` 是 Timeline 面向下游技能的稳定消费面
- 新增字段可以加
- 已有字段含义不能随意改
- 如果将来需要改字段语义，应先更新这份文档，再改实现

## 6. 当前最直接的应用目标

第一条正式消费链路应是：

- `timeline_resolve`
- `result.consumption.selfie_ready`
- selfie skill prompt

这样可以保证：

- 聊天里说“在家里书房整理工作”
- 自拍里也会看到相同的地点、事件、外观与状态
