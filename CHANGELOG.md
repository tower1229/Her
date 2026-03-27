# Changelog

## [Unreleased]

- Timeline：成功路径在入口处生成 `trace_id`，并写入 `TimelineResolveSuccessOutput` 与 `trace`，避免事后修补；`buildTrace` 支持复用同一 id。
- Timeline：`reasonWithPolicy` 在 guard 恢复重试仍失败时抛出错误；`timeline_resolve` 对除 `INVALID_INPUT` 外的内部错误统一降级为 `ok: true` 的 `empty_window`（遗忘语义），并在 `trace.decision.error_code` 与 `trace.notes` 保留真实错误原因。
- Timeline：`classifyWriteFailure` 对无法归类的写入失败使用 `write_dependency` 作为 guard，避免误标为 `canonical_path`。
- World rhythm：`inferHemisphere` 基于常见南半球时区偏移（澳新、南美等）推断半球，并驱动季节翻转以约束着装合理性。

- Timeline：错误降级路径中 `output.notes` 仅保留用户侧遗忘文案，原始技术错误仅写入 `trace.notes`，避免下游提示词污染。
