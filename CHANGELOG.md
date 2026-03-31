# Changelog

## [2.6.0] - 2026-03-31

- **`timeline_transition` Tool**: 新增场景迁移工具，支持“去洗澡”、“搬家”、“换工作”等物理状态、位置或任务目标的变更。
- **Unified Transition Planner**: 完全基于 LLM 推理的场景识别引擎。支持根据现实逻辑自动判断 `interrupt`（打断当前动作并截断时间）、`insert_micro_task`（在宏观事件中插入微观任务，如：旅游时尝烤串）或 `reject`（物理冲突拒绝）。
- **Canon 内存变动逻辑**: 在 `write-episode.ts` 中新增 `truncateEpisodeDuration` 实用程序，支持在打断发生时直接改写已有 canon 文件的事件时长，确保时间线逻辑自洽。
- **7 天回溯采集 (7-day Lookback)**：新增 `collectActiveFacts` 逻辑。解决搬家、旅行、睡觉等大耗时事件在跨天后变为“隐形”的问题。Collector 现在会回溯过去 7 天的记录，找到仍在进行的宏观背景并注入推理池。
- **Persona Skill 反向联动**: 建立与 `Zhuang-Yan`（人格 Skill）的解耦联动。并在 `timeline_transition` 识别到重大长期变更（如地址变动）时，主动标记 `requires_persona_update` 并通过 Subagent 调用 `Zhuang-Yan` 执行 JSON 增量更新。
- **运行时增强**: `openclaw_timeline_runtime.ts` 适配了独立的 Planner 子代理（Subagent）实例；`plugin_metadata.ts` 注册了 `timeline_transition` 作为二级工具。
- **文档与测试**: 更新 `architecture.md` (新增场景迁移流图)、`timeline-consumption-protocol.md` (新增迁移消费协议) 及 `QUICK_TEST_CASES.md` (新增 T-Trans 验证用例)。补齐 `timeline_transition.test.ts` 与 `collect_active_facts.test.ts` 核心算法单测。

## [2.5.1] - 2026-03-31

- Event_Id：每条 canon 条目在写入时自动生成确定性唯一标识（格式 `evt-YYYYMMDD-HHmmss`），存储为 `- Event_Id:` 字段，解析为 `ParsedEpisode.eventId`，并透传到 `consumption.scene.event_id` 和 `CollectedTimelineFact.event_id`。
- Parent_Event 精确匹配：`Parent_Event` 字段从自由文本标签改为引用父事件的 `Event_Id`，实现 canon 中父子事件的精确字符串匹配关联，消除 LLM 拼写不一致导致的匹配失败风险。
- Reasoner 提示更新：`Priority C3` 宏观事件细化规则现要求 LLM 从 `candidate_fact.event_id` 复制精确值到 `sceneSemantics.parentEventTag`，不再自行编造标签。
- 全路径透传：`writeEpisode` 自动生成 `Event_Id`（支持传入覆盖）；`parseMemoryFile` 解析 `Event_Id`；`buildConsumptionView`、`buildReadOnlyFastOutput`、`buildReadOnlyHitOutput`、`buildGeneratedOutput` 均正确透传 `event_id` 到下游消费视图。
- 文档与模板：更新 `AGENTS.fragment.md`（示例中包含 `Event_Id`）、`timeline-consumption-protocol.md`（新增 `event_id` 字段说明，`parent_event_tag` 描述更新为引用 `Event_Id`）、`QUICK_TEST_CASES.md`（测试用例反映 `Event_Id` 精确引用）。
- 测试：全部 6 个测试文件（parse-memory、write-episode、build_timeline_output、collect_timeline_request、execute_write、timeline_resolve）新增或更新 `eventId` / `event_id` 相关断言。

## [2.5.0] - 2026-03-31

- 场景多样性：增强 Reasoner 生成规则，在周末/假日/工作日晚间积极考虑户外、社交、购物、运动等非室内场景，避免连续生成同质化室内记忆（基于 persona.rhythm 与 persona.scene 约束）。
- 宏观事件细化：新增 `Parent_Event` / `Parent_Event_Phase` / `Parent_Event_Progress` 结构（canon 格式 + `SceneSemantics` + `ParsedEpisode` + `TimelineConsumptionView.scene`），支持将搬家、旅行等长持续事件（`estimated_duration_minutes > 120`）在后续查询时自动细化为当前时间点合理的瞬时阶段。
- 防递归守卫：已带有 `Parent_Event` 的细化阶段不会被再次细化，防止无限细分。宏观事件过期后不再作为父事件被引用。
- Canon 格式扩展：`memory/YYYY-MM-DD.md` 单条记忆新增可选字段 `Parent_Event`、`Parent_Event_Phase`、`Parent_Event_Progress`，支持写入与解析。
- `read_only_fast` / `read_only_hit` 透传：两种只读路径均正确透传 `parent_event_tag` / `parent_event_phase` / `parent_event_progress` 到 `consumption.scene`。
- Collector 预计算：`candidate_facts` 新增 `estimated_duration_minutes`、`elapsed_minutes`、`is_within_duration_window`、`has_parent_event`、`parent_event_tag`、`parent_event_phase`、`parent_event_progress` 字段，由脚本预计算后注入；Reasoner 不再需要自行做时间算术，仅根据预计算结果做决策。
- 模板与协议：更新 `templates/SOUL.fragment.md`（宏观事件叙事连贯性指引）、`templates/AGENTS.fragment.md`（新增宏观事件细化示例）与 `docs/timeline-consumption-protocol.md`（新增第 8 节宏观事件细化消费约定）。
- 测试与用例：补充 parse-memory、write-episode、build_timeline_output、timeline_resolve 的宏观事件相关单元测试，并在 `docs/QUICK_TEST_CASES.md` 新增 T-Macro / T-Scene-Diversity 手工验证用例。

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
