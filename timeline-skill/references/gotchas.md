# Timeline Skill — Gotchas

## 🚨 G1：sessions_history 是绝对硬锚，不可被 memory 内容覆盖

真实聊天记录反映的事实（如「用户说你昨天在健身房」）优先级最高。
即使 memory/YYYY-MM-DD.md 中有不一致的记录，也必须以 sessions_history 为准。
禁止用 memory_search 的语义结果来否定 sessions_history 里的硬事实。

## 🚨 G2：timeline-skill 是唯一写盘责任方（single writer）

persona-skill、stella-selfie 等消费端绝对不可直接写 memory/YYYY-MM-DD.md。
即使消费端在 Heartbeat 中被触发，也必须调用 timeline-skill 来完成写盘，
而不是自行追加记忆条目。

## 🚨 G3：禁止覆盖已有 canon（immutable 约束）

软指纹命中（read_only_hit）后，必须直接返回已有段落，绝对不允许以「更新」
「补充细节」为名修改已落盘内容。磁盘段落一经写入即视为不可变。

## ⚠️ G4：memory_search 不参与只读判定

memory_search 的语义检索仅用于查找目标时段附近的上下文作为生成参考，
不得将其结果用于判断「该时段是否已有 canon」。只读判定必须走 memory_get +
脚本软指纹匹配路径（scripts/fingerprint.ts）。

## ⚠️ G5：Appearance 继承必须发生在脚本层，不能靠模型推断

日内稳态继承要求脚本读取当日首条 Episode 的 Appearance 值并传递给
新 Episode，这是确定性操作。如果让模型自由推断，会导致一天内穿着不一致（幻觉漂移）。
触发 scripts/inherit-appearance.ts，而不是在提示词里描述继承规则。

## ⚠️ G6：输出非空原则不等于可以虚构事实

「必须给出非空结果」是指允许描述「独处、休息、睡眠」等低信息密度状态，
而不是允许随意生成未发生的活动事件。低置信度内容必须通过 provenance.confidence
降级并保持保守描述，绝不能因为「要输出非空」就提高置信度。
