# Changelog

## [Unreleased]

## [2.4.0] - 2026-03-31

- Timeline：新增 `estimated_duration_minutes`（Reasoner 顶层输出），并贯通到 `result.consumption.scene.estimated_duration_minutes`；为旧 canon 未携带该字段的场景提供基于 `activity_mode` 的保守默认值回退。
- Canon daily log：`memory/YYYY-MM-DD.md` 单条记忆新增可选字段 `Estimated_Duration`（分钟），支持写入与解析，便于跨会话/跨 channel 判断场景是否仍在延续。
- Timeline：新增 `read_only_fast` 模式（零 LLM），仅读取当日 canon 最新事实并按预计时长做过期判断；命中返回 `read_only_fast_hit`，未命中返回 `empty_window` 并给出 30 分钟“无状态”防抖窗口。
- Timeline 写入链路：生成写入时将预计时长从 Reasoner（顶层或 `sceneSemantics`）穿透到 `writeEpisode`，确保 canon 中持久化可复用的场景持续时间信息。
- 模板与协议：更新 `templates/SOUL.fragment.md`（Scene Ambience 指引）、`templates/AGENTS.fragment.md`（新增 `Estimated_Duration` 示例）与 `docs/timeline-consumption-protocol.md`（补充 `read_only_fast` 与 `estimated_duration_minutes` 的稳定消费约定）。
- 测试与用例：补充/更新 parse-memory、write-episode、build_timeline_output、timeline_resolve（含 `read_only_fast`）等单元测试，并在 `docs/QUICK_TEST_CASES.md` 新增 T-Fast / T-Duration 手工验证用例。

## [2.3.0] - 2026-03-28

- Timeline：成功路径在入口处生成 `trace_id`，并写入 `TimelineResolveSuccessOutput` 与 `trace`，避免事后修补；`buildTrace` 支持复用同一 id。
- Timeline：`reasonWithPolicy` 在 guard 恢复重试仍失败时抛出错误；`timeline_resolve` 对除 `INVALID_INPUT` 外的内部错误统一降级为 `ok: true` 的 `empty_window`（遗忘语义），并在 `trace.decision.error_code` 与 `trace.notes` 保留真实错误原因。
- Timeline：`classifyWriteFailure` 对无法归类的写入失败使用 `write_dependency` 作为 guard，避免误标为 `canonical_path`。
- World rhythm：`inferHemisphere` 基于常见南半球时区偏移（澳新、南美等）推断半球，并驱动季节翻转以约束着装合理性。

- Timeline：错误降级路径中 `output.notes` 仅保留用户侧遗忘文案，原始技术错误仅写入 `trace.notes`，避免下游提示词污染。
