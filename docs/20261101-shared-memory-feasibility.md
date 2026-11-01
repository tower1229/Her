# 共享默认日记方案：可行性与约束

核验日期：2026-11-01。范围：单用户、同一 Agent 跨会话的人格时间线。状态：架构可行性核验，未实施、未完成真实宿主验收。

> 后续提案：共享单文件竞争实验失败后，新增 [按事件分文件方案](./20261101-partitioned-memory-proposal.md)。该方案仍使用默认 memory 语料与召回，已通过默认文件发现和隔离写入实验；尚待用户定案。本文保留共享单文件方案及其失败证据。

本文更新此前报告的存储建议：不采用独占 canon 目录及第二份记忆投影；优先复用 `memory/YYYY-MM-DD.md`。早期报告的源码缺陷证据仍有效，但其独占目录、多联系人及修订历史建议不是当前产品决定。

## 已确认的接点

| 接点 | 官方契约与判断 | 实施要求 |
| --- | --- | --- |
| 共享日记 | v2026.10.9 将按日 Markdown 定义为通用记忆工作层，可由默认工具检索。[记忆说明](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/concepts/memory.md) | 保留普通 Markdown；Timeline 只管理明确边界的事件块，不能整文件解析后重建。 |
| 默认索引 | 内置引擎自动监测记忆文件变化，分块建立索引；同步存在延迟。[内置引擎](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/concepts/memory-builtin.md) | 不需要第二份 Markdown 或另建语义搜索；Timeline 的 SQLite 只派生时间、关系和状态索引。不直接修改宿主 SQLite。 |
| 无 AGENTS 文件依赖 | `before_prompt_build` 支持附加系统上下文。[固定版 Hook 文档](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/plugins/hooks/prompt-and-session.md) | 通过 `api.on` 注册；规则随插件维护，显式工具由代码校验写入。注入规则不能保证模型必然遵守。 |
| 权限 | 第三方的 prompt 和 agent_end hooks 需要 `allowConversationAccess`，prompt injection 不能被禁用。[权限说明](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/plugins/hooks.md) | setup/doctor 验证实际配置与注册；不能仅检测 skill 已加载。 |
| 回复后提取 | `agent_end` 是回合结束观察钩子，不是持久任务队列，也不证明渠道已送达。[生命周期](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/plugins/hooks/prompt-and-session.md) | 短处理入队，持久 checkpoint、重试与幂等由 Timeline 负责；恢复遗漏回合所需的历史读取通道仍需真实宿主验证。 |
| 新版 flush 接口 | 在线文档的 flush resolver 面向压缩前保存；tools arm 属于所选 memory slot owner。[在线接口](https://docs.openclaw.ai/plugins/sdk-overview/memory-and-context#pre-compaction-memory-flush) | 不能把它当每轮通用记忆写入拦截器；不为此替换默认 memory slot。此项按在线文档记录，不宣称已完成固定版契约验证。 |
| Agent Guidance | 在线文档说明其封装已有 prompt hook，没有新增 SDK Hook。[官方说明](https://docs.openclaw.ai/plugins/agent-guidance) | 本项目已有插件，直接使用 prompt hook，无须增加此依赖。 |

## 必须明确的能力边界

1. **校验只控制 Timeline 索引。** 用户直接改共享 Markdown 后，宿主会独立收录；Timeline 校验失败不能阻止默认索引。无效事件应被 Timeline 排除并报告，不能声称两套索引都已通过相同校验。
2. **默认召回不是 Timeline 事务的一部分。** Timeline 提交和自身索引更新完成，并不表示宿主搜索已同步。查询尚未提取的最新经历须走 Timeline 等待路径；失败或超时整次 Timeline 查询失败，不能把它当空白生成模拟经历。这不改变宿主 memory_search 自身可能返回旧索引或部分结果的行为。
3. **来源字段不是宿主原生 provenance。** 宿主另有 SQLite 管理的可信来源元数据；Markdown 中的 `source_type` / `event_id` 只是 Timeline 领域字段，不能声称它们自动成为宿主过滤字段。[内置引擎来源说明](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/concepts/memory-builtin.md)
4. **检索片段可能丢失标签。** 宿主分块并裁剪结果，不保证每个命中都带事件头。事件格式应使用简短、自包含的来源说明；只有片段含足够来源、ID 和正文时才直接回答，缺失则读取原文或查询 Timeline。这与“足够完整的默认召回可直接回答”的决定一致。
5. **文件锁不能约束所有写入者。** Her 锁只能协调 Her；宿主普通 write/edit、后台整理和人工编辑不一定参与。读前版本检查与原子替换不能单独消除检查后的竞争窗口。共享文件需要验证追加策略、冲突检测及失败恢复，不能承诺任意非协作全文覆盖下零丢失。
6. **后台整理会影响来源保留。** 默认记忆会把日记提炼至长期记忆。模拟来源不能在提炼时变成真实事实；必须在真实宿主中验证来源保留，不能仅因日记有标签就宣布整个下游链路可靠。[记忆整理说明](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/concepts/memory.md)
7. **并非所有状态都能从日记重建。** 时间索引可重建；待处理任务、提取进度与真实记录删除 tombstone 是持久控制状态，必须单独保存并备份，不能跟缓存一起删。内容无需保留修订历史。

## 当前仓库需要改变的实现

- `scripts/setup-openclaw-workspace.mjs` 已能自动合并 AGENTS/SOUL，但仍依赖文件契约；迁移后停止新增契约，仅精确清理已识别的旧插件片段，保留用户内容。
- `templates/AGENTS.fragment.md` 要求日记不能混用自由文本，需撤销这一全文件约束。
- `index.ts` 已有 before_prompt_build；移除把 typed hook 注册到 registerHook 的无效 fallback。
- `src/storage/write-episode.ts` 的追加与截断均重写全文，不能直接用于新共享协议；统一提交入口并保留未管理文本。
- `src/storage/lock.ts` 的失败竞争者删锁缺陷必须修复；修复后也不等于拥有跨宿主写入锁。
- 显式记录、模拟补全、后台提取使用同一校验与提交服务；按证据身份去重，不以正文相似代替事件身份。

## 实施验收门槛

固定目标宿主 v2026.10.9 和实际使用的 harness；在线文档用于追踪新能力，不直接扩张兼容声明。

1. 不修改 AGENTS/SOUL 的新安装能注册工具与 prompt hook；授权缺失时有可诊断结果。
2. 在普通日记内追加、补充、人工修改事件后，普通文本保留，Timeline 校验与默认检索行为符合上述边界。
3. 默认 memory_search 能检索真实和模拟事件；长事件与跨块片段缺少来源时能回读，不误报真实经历。
4. 在后台提取、宿主 flush、人工编辑并发时验证无损性与明确冲突行为；不能用仅有 Her writer 的单测替代。
5. 进程中断、重复 hook、提取失败与重启后任务恢复；查询等待、整体失败及删除后不重提取生效。
6. 默认整理与长期记忆提炼不能丢失模拟来源；历史格式不明时不自动升级为真实证据。

结论：共享日记、复用默认召回、插件接管 Timeline 结构化操作这条路线有正式接口支持。强一致索引、全局写入拦截、后台任务恰好执行一次并非现成能力。上述验收完成前，仅能称为架构可行，不能称为运行验证通过。

## 隔离实现验证结果（同日追加）

发现本机实际安装的 OpenClaw 2026.10.9，可读取其发布产物。此前 smoke 未发现 runtime 不代表未安装；当前 `.mjs` 发布布局与旧探测脚本不同。此次没有启动 Gateway、读取用户记忆或调用模型。

历史探针见 [固定提交中的脚本](https://github.com/tower1229/Her/blob/a91f41bf1e11bf0d0a4fbf90bb0d27bcbf113b79/scripts/probe-shared-memory.mjs)。该脚本包含“旧写入器丢失普通文字”的断言，修复后不再适用于当前版本，已移出可执行脚本集合。当前共享检索验收使用 `npm run test:smoke`。原探针导入上游真实分块/管理块纯函数，在临时目录运行，输出版本与上游文件 SHA256；本页保留当时的调研结论。

| 实验 | 结果 | 可得结论 |
| --- | --- | --- |
| 当前 Her writer 写入含普通笔记的日记 | 返回成功，普通笔记丢失 | 现有 writer 不满足共享写入要求 |
| 直接追加事件，再调用宿主管理块函数 | 普通笔记、事件均保留 | 顺序操作可以共存；追加保留原始前缀字节 |
| 宿主读取旧快照 → Her 追加 → 按旧快照替换 | 新事件丢失 | 确定性竞争反例；这是隔离调度复现，不是运行 Gateway 的压力测试 |
| 来源、ID、Action 为同级字段 | Action 候选仅有 `09:00: Action: ...`，没有来源与 ID | 默认日记提取不会自动把兄弟字段关联为一个事件 |
| 每条短陈述携带“模拟经历＋ID” | 两条提取候选都保留来源与 ID；短文本检索分块也保留 | 可作为候选格式，但未证明任意长度和搜索结果裁剪均保留 |
| 长文本仅标题注明模拟来源 | 9 个实际检索分块中 8 个缺少来源标签 | 仅在事件头标注来源不能满足默认召回直接回答的前提 |

发布代码证据：`dreaming-markdown-C9OiMRQw.mjs` 的 `writeDreamingReport` 读取日记、构建更新内容后调用替换；本地工作区路径没有与第三方统一的文件锁。官方也明确直接 Agent 编辑与外部 writer 不共享 memory mutation lock。[删除与锁边界](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/concepts/memory-provenance.md)

来源保留的证据止于分块与日记候选提取。未运行搜索工具排序/裁剪、deep promotion、模型回复；宿主保留的 source-session lineage 与 Timeline 的 simulated/observed 不是同一概念。不能把候选测试通过写成完整整理链路通过。[Dreaming 契约](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/concepts/dreaming.md)

**门槛结论：尚未通过。** 不受协调的多 writer 共享同一文件已经有丢失反例；来源采用自包含短陈述可以改善，但完整链路尚待验收。继续实施前需要决定是否接受受控写入：程序写入需统一协调，人工编辑在暂停相关写入时进行。此为待确认约束，不代表已有正式插件接口可以透明协调所有宿主写入；不能仅靠提示词或 Her 私有锁宣称完成。
