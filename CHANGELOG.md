# Changelog

## [2.8.7]

- **连续状态迁移修复 (Consecutive Transition)**：修复了在同一个 30 分钟窗口内连续触发 `timeline_transition` 时，因半小时桶冲突（`CONFLICT_EXISTS`）导致写入失败的问题。现在会扫描目标时间桶内的所有既有记录 ID 并全量豁免，支持任意频次的快速状态切换。
- **写入原子性保障 (Atomicity)**：重构了中断（interrupt）路径的执行顺序。旧事件的时长截断现在**仅在新记忆成功写入之后**才执行，彻底消除了"旧记忆被截短但新记忆写入失败"导致的数据腐败风险。
- **截断精度统一 (Truncation Precision)**：将同日路径的截断计算从分钟级（丢弃秒数）升级为秒级精度，并统一使用 `Math.round` 四舍五入。两条计算路径（同日 / 跨日）现在行为完全一致，消除了高频操作中的"时间黑洞"。
- **Trace 语义修正**：`interrupted_event_id` 字段现在仅在 `interruption_handling === 'interrupt'` 时填充，避免在微任务插入或普通迁移路径下产生误导性的调试信息。

## [2.8.6]

- **可观测性增强 (Observability)**：在 `timeline_resolve` 的降级路径中，将原始报错内容（Raw error）包含在返回结果的 `notes` 中。现在当 Subagent 发生解析错误或 Request ID 不匹配时，开发者可以更直观地从 JSON 日志中查看到具体的错误信息。
- **构建输出优化**：修正了 `build_timeline_output.ts` 中 `buildReasonerNotes` 忽略 `uncertainty` 字段的问题，确保在降级过程中由于模型输出非法导致的推理中断不仅提供保底结果，还能保留现场证据。

## [2.8.5]

- **`timeline_transition` / 路由优先级**：升级状态切换（State Transition）优先级。在 `SKILL.md` 与 `SOUL.fragment.md` 中明确要求：当命中 Path 2 (状态变更) 时，AGENT 应忽略既有的 `active_instant` 上下文，优先执行跳转工具。解决了“活跃上下文阻塞场景迁移”的逻辑冲突。
- **可观测性 (Trace Log)**：为 `timeline_transition` 增加了持久化追踪日志。详细的推理路径（包括冲突检测、打断逻辑、微任务插入决定）现在会被自动记录到 `logs/transition-trace.log`（若存在该目录），极大提升了复杂迁移场景的调试效率。
- **自定义世界律动 (World Rhythm)**：重构了合理性校验引擎以支持 `world_rhythm_constraints`。插件现在能够根据 Persona Profile 中定义的非标准作息时间（如熬夜型）动态调整睡眠与活动窗口，不再强制套用全局 21:00-09:00 的默认睡眠模型。
- **鲁棒性修复**：修复了 `write-episode.ts` 中 `truncateEpisodeDuration` 在处理跨日长耗时事件时的时长计算缺陷；修正了 `Estimated_Duration` 在打断场景下的进位溢出风险。
- **Workspace 同步工具**：更新了 `scripts/workspace-contract.cjs` 的 `CURRENT_SOUL_MARKERS`，支持自动检测并引导旧版工作区升级到最新的状态跳转优先级逻辑。

## [2.8.4]

- **`timeline_transition` / interrupt**：写入新片段时传入 `sameBucketExemptEventIds`，使被中断条目的 `Event_Id` 不再与同半小时桶冲突检测相撞；`insert_micro_task` 对父事件 `Event_Id` 同样豁免，避免宏观事件内插微任务被误拒。
- **`timeline_transition`**：`expected_end_at` 改为通过 `addMinutesToTimestampString` 做墙钟进位（修复长 `estimated_duration_minutes` 导致非法 `minute`）；`canon_write` 透传 `error_code` / `error` / `recovery_hint`；`notes` 在写入失败时报告原因，成功时保留原摘要；interrupt 下补充无 `Event_Id` 或截断失败时的说明。
- **`writeEpisode`**：新增可选入参 `sameBucketExemptEventIds`；冲突检测对豁免列表中的既有 `Event_Id` 跳过同桶冲突。
- **清理**：导出 `halfHourTimelineBucket`，同桶判断不再解析指纹字符串；`addMinutesToTimestampString` 注明固定 offset 语义；`expected_end_at` 无法解析时在 `notes` 说明并回退 `started_at`；工具描述修正 canon 拼写。

## [2.8.3]

- **timeline-skill / SOUL**：State transition 触发改为**意图优先**（与句式无关），明确与 time-reality、元讨论、纯假设的边界；`SOUL.fragment.md` 补充进入 skill 后的**顺序与引用执行**说明，减少“定义与执行脱节”导致的漏触发或误触发。跟进 OpenClaw 评审：**假设+指令**拆成独立正向规则（去掉嵌套 unless）；**主语模糊**时在 `SKILL.md` 增加逐步消解（含交给 `timeline_transition` 原句裁决）。
- **OpenClaw 跟进**：`SOUL.fragment.md` 将主语消解指向 `SKILL.md` 中真实标题 **Disambiguation rules (who acts when the subject is vague)**，避免“disambiguation rules”空头引用；新增 **Substantive ongoing task** 操作定义（持续占用身体或可叙述时间块 vs 瞬时动作，边界交给 `timeline_transition`），并在 SOUL 中交叉指向该小节。
- **workspace-contract**：`scripts/workspace-contract.cjs` 的 `CURRENT_SOUL_MARKERS` 与新版 `SOUL.fragment.md` 对齐，避免模板被误判为 legacy。

## [2.8.2]

- **Timeline reasoner (OpenClaw subagent)**：`buildTimelineReasonerSystemPrompt` / `buildTimelineReasonerMessage` 现与 query planner 一致，在 **system 输出示例** 与 **user 消息** 中写入**字面量 `request_id`**，并明确要求 **仅输出裸 JSON**（禁止 markdown 围栏与前后说明），降低 `extractJsonObjectFromMessages` 报 `Timeline reasoner did not return a JSON object` 或 `mismatched request_id` 的概率。

## [2.8.1]

- **Persona extractor / OpenClaw subagent**: Legacy persona 抽取提示词现与 Timeline query planner 一致，在输出 JSON 中**要求回显 `request_id`**（与 `legacy_files.request_id` 相同），满足 `runJsonPrompt` → `tryExtractJsonObject` 的关联校验，避免误报 `Timeline persona extractor returned mismatched request_id` 并降级为 `empty_window`。
- **`validateCandidatePersonaContractPayload`**: 顶层白名单新增可选 `request_id`（若存在须为非空字符串）；`normalizeCandidatePersonaContract` 仍不将 `request_id` 写入持久化合约。
- **Cache**: `extractLegacyPersonaContract` 的 `VALIDATOR_VERSION` 升为 `2`，使既有 persona 合约磁盘缓存按 key 失效并可在下次抽取时写入合规载荷（可选、一次性刷新）。

## [2.8.0]

- Prompt timeline context: 新增 `before_prompt_build` prompt context 链路。Timeline 现在会在每轮生成前注入标准化的 `Timeline prompt context`，用于对话语气调制，并允许 `timeline-skill` 在 `active_instant` 场景下直接回答当前态问题。
- Enhanced `read_only_fast`: `read_only_fast` 从“仅看当天最新事实”升级为“先看当天，再回溯最多 N 天仍在持续的 active fact”。跨日宏观事件和已细化 phase 现在都能被 fast path 命中，并继续透传 `event_id` / `parent_event_*`。
- Runtime / config: 为 plugin manifest 与 runtime 新增 `enablePromptTimelineContext`、`promptTimelineLookbackDays`、`promptTimelineMacroThresholdMinutes`、`promptTimelineDirectCurrentStateAnswers` 配置；兼容层 `definePluginEntry/materializePlugin` 也新增 hook 注册模型。
- Contracts / tests: 更新 `timeline-skill`、`time-reality` reference 与 `SOUL.fragment.md` 契约，明确只有 `active_instant` 可绕过完整 `timeline_resolve`。补充 `read_only_fast` lookback、prompt context 分类、`before_prompt_build` 注入与兼容层 hook 注册测试。

## [2.7.0]

- Skill rename: 将 bundled skill 从 `timeline` 更名为 `timeline-skill`，并同步更新 `openclaw.plugin.json`、`src/plugin_metadata.ts`、workspace sync 脚本、README 与兼容性测试中的路径和名称。
- Scene ambience removal: 删除 `skills/timeline-skill/SKILL.md` 中“每轮获取 scene ambience”的默认路由，并同步更新 `templates/SOUL.fragment.md`、workspace contract 检测逻辑、相关集成测试与文档表述。

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
