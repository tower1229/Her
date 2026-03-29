# Timeline 中 LLM 与脚本的职责边界

> 状态：当前有效
> 目的：明确 persona contract 架构下，哪些工作必须由 LLM 完成，哪些工作必须由脚本完成
> 关联：`docs/architecture.md`、`docs/PERSONA_PROFILE.md`

## 1. 总原则

Timeline 的边界遵守一句话：

> LLM 负责理解、判断与组织；脚本负责约束、验证与执行。

如果一段逻辑的正确性依赖自然语言理解、常识推理、persona 语义理解或多事实之间的语义判断，就不应该由脚本主导。

## 2. 必须由 LLM 实现的职责

### 2.1 时间意图理解

LLM 必须判断用户是在问：

- 当前状态
- 明确过去时间点
- 一段过去时间
- 连续性追问

### 2.2 查询语义到事实选择

当已有多个 canon facts 时，LLM 必须判断：

- 哪一条最相关
- 是否应组合多条
- 是否虽有历史事实，但对当前问题仍不构成命中

### 2.3 连续性与状态转移推理

LLM 必须判断：

- 先前活动是否仍在持续
- 当前时间是否已超过合理持续窗口
- 是否应从一个场景自然过渡到另一个场景

### 2.4 Legacy Persona 结构化提取

当 `persona/PERSONA_PROFILE.md` 不存在，而 legacy `SOUL.md` / `MEMORY.md` / `IDENTITY.md` 存在时，LLM 可以承担一次独立的 persona 提取工作：

- 输入仅限 legacy persona 文件
- 输出必须是满足 `PersonaContractV1` 的结构化结果
- 不得读取当前 query、候选 fact、时间窗口或 reasoner prompt

这一步是独立的 persona ingestion 过程，不等同于时间推理。

### 2.5 空白窗口的人格化生成

LLM 必须基于：

- `persona_context.contract`
- 既有 timeline canon
- 当前真实时间
- 周末 / 节日 / 日内时段

生成符合 persona 且符合现实的状态或回忆。

### 2.6 近期回忆的组织与摘要

像“最近有什么有趣的事吗”这类问题，LLM 必须负责：

- 取舍重点
- 组织叙事
- 保持像回忆而不是日志枚举

## 3. 必须由脚本实现的职责

### 3.1 Persona Ingestion 与缓存

脚本必须负责：

- 发现 `PERSONA_PROFILE.md` 或 legacy persona 文件
- 调用 parser 或 legacy extraction LLM
- 校验 `PersonaContractV1`
- 管理 persona cache 命中 / 失效

### 3.2 数据收集

脚本必须负责：

- 读取 `sessions_history`
- 读取 `memory_get`
- 读取 `memory_search`
- 读取 canonical persona contract
- 整理候选 facts 与时间锚点

### 3.3 硬边界与基础归一化

脚本必须负责：

- `explicit` 输入是否合法
- 时区与时间格式归一化
- 当前 anchor 时间注入
- canonical 路径校验

### 3.4 硬事实优先级约束

脚本必须强制：

- 会话硬事实优先
- 已落盘 canon 不可被随意改写
- memory_search 不能否定硬事实
- persona contract 不能覆盖已成立的时间事实

### 3.5 输出结构校验

脚本必须验证 LLM 输出是否满足 Timeline 结构要求，以及这些字段是否可安全写盘。

### 3.6 写盘与幂等

脚本必须负责：

- append-only 写盘
- 锁
- 并发冲突
- 指纹 / 幂等
- trace

## 4. 不允许脚本主导的职责

以下做法应视为错误方向：

- 用关键词表判断用户问题属于哪种时间问题
- 用脚本 token 匹配在多个 episode 中选最相关事实
- 用活动时长表推理状态还能持续多久
- 用 heuristics 直接生成 persona 状态
- 让下游重新从 persona 文本里提 `home_city` 等字段
- 继续让 reasoner 消费旧式三段 persona 文本接口

## 5. 推荐分层

### Layer 1：Persona Ingestion

脚本 + 可选 extraction LLM，负责：

- 选择 persona 来源
- 生成 `PersonaContractV1`
- 校验 contract
- 管理 persona cache

### Layer 2：Collector

脚本层，负责：

- 收集事实源
- 读取 canonical persona contract
- 生成候选 episode 集
- 构建时间锚点

### Layer 3：Temporal Reasoner

LLM 层，负责：

- 识别请求类型
- 判断是否命中既有事实
- 决定是否生成
- 给出结构化决策

### Layer 4：Runtime Guard

脚本层，负责：

- 验证 LLM 决策是否违反硬事实
- 验证结构是否完整
- 判断是否允许写盘

### Layer 5：Canon Writer

脚本层，负责：

- append-only 写盘
- 冲突处理
- 运行状态持久化
- trace 与 repair

## 6. 一句话总纲

> Timeline 不是“脚本替 LLM 做语义推理，再让 LLM 润色”的系统，而是“LLM 做语义推理，脚本做约束与执行”的系统；在 persona 升级后，这个原则同样适用于 legacy persona 提取与 canonical contract 消费。
