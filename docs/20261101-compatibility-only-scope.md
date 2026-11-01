# 当前范围：保持体验的兼容性修复与内部重构

2026-11-01 用户最新要求覆盖此前设计讨论：先不改变使用体验，只分析新版 OpenClaw 适配、现有实现替换与缺陷修复。本文件为当前范围；共享日志/分事件文件等提案不作为实施授权。

## 保持不变

- 现有每日 Markdown 路径、字段结构、工具名称/参数/返回消费契约。
- AGENTS/SOUL/skill 的现有使用约定；不将 prompt hook 迁移列为必做。
- 人格补全、状态转换与主动问候的产品规则。
- 普通插件形态，不修改宿主、不占用 memory/context engine slot。
- 不加入后台真实经历提取、SQLite 时间索引、事件文件拆分、新的时间段展示或来源分类体系。

## 建议工作顺序

1. 数据正确性：修复失败竞争者删除别人锁；统一 resolve/transition 的写入边界；保留普通文字、未知字段和条目内自然文本；追加/截断路径都要覆盖。不要以不改体验为由保留丢数据行为，也不要为修复覆盖问题改变整个日记格式或顺序契约。
2. 时间正确性：统一 timestamp 解释，避免 server timezone 决定已有记录的语义；拒绝未来事件进入当前状态。保留已有 Estimated_Duration 产品语义。旧无 offset 记录的解释策略先核对已有配置，不能静默批量迁移。
3. 宿主兼容：修复 hook 授权诊断、移除无效 registerHook typed fallback 和 createPluginRuntime fallback；移除已退役 skipWhenBusy；setup 保留用户现有 heartbeat 设置并接通 canonicalMemoryRoot。
4. 内部 recall：当前不存在的 createMemorySearchTool factory 返回空列表，必须区分无命中与不可用。替代通道仍需独立验证；不能声称普通 Agent 能调用 memory_search 就等于插件内部也能直接调用。
5. 可替换实现：无工具 JSON 推理可试用 subagent.complete / llm.complete isolated，保留 agent、输入上下文、timeout、schema 校验与现有对外结果。旧 run/wait API 未移除，替换要证明行为等价；不直接切 direct 模式。
6. heartbeat 专用触发替代正文关键字检测；保持现有问候频率和交付语义。修复无关消息被误算为问候送达的关联问题，不扩展多用户产品范围。
7. 工程收拢：官方 SDK 类型约束实际生产入口；消除生产注册与测试 materialize 注册分叉；拆出宿主 adapter、模型 adapter、存储提交层，保持领域输入输出不变。
8. 验收：smoke 适配本机实际 .mjs 布局，发布门禁不可因 runtime 未发现而算成功；用固定 2026.10.9 验证授权、工具、推理与失败路径；UTC 与 Asia/Shanghai 回归。兼容范围仅包含实测版本。

## 证据与限制

本轮重新检查了 index.ts、runtime、lock、parser、collectActiveFacts、transition 和 setup。此前已运行的隔离探针与 UTC 失败详见初次核验报告；本轮未重复运行产品测试、未修改生产代码。

官方固定版本 [subagent.complete](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/plugins/sdk-runtime/background-work.md) 明确其无需持久会话、工具或投递；不适用于依赖工具执行的调用。其他上游结论与精确链接见 [上游核验](./20261101-openclaw-upstream-verification.md)。

来源/confidence 持久化、删除语义、模拟补全边界、预计结束策略以及语义降级策略的变化可能影响结果，不能混进“纯内部重构”。先记录缺口，涉及行为的修改另列说明。
