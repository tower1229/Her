# Her 重构前核验与实施准备

核验日期：2026-11-01。状态：研究结论与建议方案，尚未实施重构。

> 后续设计更新：本文为初次评审核验记录。独占存储目录、额外记忆投影、多联系人与修订历史等建议已不代表当前方向。当前按单用户 Agent、共享默认日记、Markdown 权威源和可重建时间索引推进；具体能力与待验收边界见 [共享默认日记可行性](./20261101-shared-memory-feasibility.md)。下文保留作为原始核验依据，不应直接作为实施规格。

## 1. 结论

评审提出的中等规模重构方向成立：保留 Timeline、PersonaContract 和互动策略，把存储、时间契约、宿主适配与事件作用域收拢到明确边界。应先解决数据正确性，再迁移 OpenClaw 接口。

共享记忆覆盖、时间戳丢失 offset、heartbeat 误识别、联系人保护复位、发送关联不足，均已在隔离目录用当前实现复现。另发现一个评审没有提到的优先问题：竞争者获取文件锁失败后，会删除持有者的锁文件。单纯搬目录不足以解决这一问题。

当前稳定版基线可定为 OpenClaw `v2026.10.9`，但在线文档已有超前变化：isolated completion 的 `outputSchema`、heartbeat 向 proactive automation 的迁移，不能直接当作该稳定版能力。上游逐项证据见 [OpenClaw 上游契约核验](./20261101-openclaw-upstream-verification.md)。

建议第一里程碑定义为：**固定 OpenClaw 2026.10.9，建立自有 Timeline 数据与可靠时间契约，并收敛宿主能力接入**。维持普通 additive plugin 形态，暂不接管 memory 或 context engine slot。

## 2. 核验基线与证据范围

| 对象 | 本次基线 |
| --- | --- |
| 评审输入 | [分享对话：评估架构适配](https://chatgpt.com/share/6ae6db15-5798-83e8-8292-6efbac979d51)，已读取完整正文 |
| 评审中的 Her 提交 | `62f5a3c9f891184514df5bfb32b07d4a9d6cf892` |
| 本地验证提交 | `dev` / `feda99284ff7695d68dc283cb6f5295e8b3ccc91`，包版本 `2.8.10` |
| 与评审提交的差异 | `git diff --name-status 62f5a3c9 HEAD` 仅显示 `package-lock.json`；本文讨论的业务源码一致 |
| 宿主目标 | 官方 release 当前标为 Latest 的 [v2026.10.9](https://github.com/openclaw/openclaw/releases/tag/v2026.10.9) |
| 本地验证环境 | Windows，Node `v24.18.0`，npm `11.16.0`，默认时区 `Asia/Shanghai` |
| 本次执行 | 类型检查、构建、两种时区单测、隔离功能探针；smoke 脚本因找不到有效 OpenClaw runtime 而跳过 |

本次不把评审描述的 CI 状态当成最新 CI 状态：其 `205 passed / 3 failed / 5 skipped` 已用当前源码在 UTC 环境独立复现。真实 Gateway、模型提供者、插件授权与渠道投递仍需要后续固定宿主验收。

## 3. 对评审关键结论的复核

| 评审判断 | 本次结论 | 对下一步的影响 |
| --- | --- | --- |
| 默认共享 daily memory，写入可能丢普通笔记 | **已复现**。writer 解析旧文件后重建全文，普通笔记消失，仍返回 `appended`。 | P0：Timeline 独占存储；历史迁移保持宿主原文完整。 |
| 落盘没有完整保存来源与置信度 | **确认**。传入 confidence `0.75`，重新读取为 `1`；来源类型没有对应持久化字段。 | 持久化 schema 要记录来源、状态和原始依据，不能由字段齐全度恢复可信程度。 |
| `before_prompt_build` 缺少会话授权 | **上游契约确认**。第三方需 `hooks.allowConversationAccess: true`，setup 没有生成该授权。 | 安装和 doctor 检查业务开关之外的宿主授权；授权键属于插件条目 `hooks`。 |
| `skipWhenBusy` 已退役 | **固定版本 schema 确认**，同时隔离 setup 仍输出该字段。 | 删除生成逻辑，处理已安装配置，更新 doctor、README 与现有断言。 |
| runtime fallback 和 memory factory 失效 | **固定版本公开导出/类型确认**。 | 删除自建 runtime 兜底；明确 memory 能力状态。不能由此断言所有工具均不能运行。 |
| 注入的 subagent 主路径仍可能工作 | **确认**：`run/waitForRun/getSessionMessages/deleteSession` 仍是可用 API；对无工具结构化推理而言，completion 更省适配代码。 | 按实际推理需求迁移，不将仍有效接口误报为已移除。 |
| 四类 JSON 推理可以统一 completion | **方向成立**，`llm.complete` 与 `subagent.complete` 都已存在。 | 先确定执行模式、agent、取消和输出校验；isolated 不支持照搬 direct 的 `responseFormat`。 |
| heartbeat 应用专用 hook | **稳定版已有该 hook**，文本猜测误触发也已复现。 | 固定版使用 `heartbeat_prompt_contribution`；另行跟踪在线文档的新自动化机制。 |
| engagement 需要作用域与回执改造 | **源码与探针确认**。 | Timeline 按人格共享，互动状态按联系人隔离；sessionKey 不足以标识一次问候。 |
| 普通插件比 memory/context engine 更合适 | **架构建议成立**，前提是维持现有产品职责。 | 保留用户已经选择的宿主记忆和上下文引擎。 |
| 当前 smoke 不能证明完整兼容 | **确认**；现有主要验证加载与工具发现，并且缺 runtime 时跳过。 | 发布验收需包含真实 hook、配置、completion 和作用域行为。 |

上游接口与权限判断的精确官方链接集中在 [上游契约表](./20261101-openclaw-upstream-verification.md#逐项核验)，其中明确区分固定 tag、在线文档与尚未运行验证的部分。

## 4. 本地证据与补充发现

### 4.1 数据覆盖、来源丢失与迁移范围

依据：[write-episode.ts](../src/storage/write-episode.ts) 第 169–223 行、[parse-memory.ts](../src/lib/parse-memory.ts) 第 21–24、69–79 行。

隔离输入：普通 Markdown 笔记加一次 `writeEpisode`；事件时间为 `2026-03-31T13:00:00+08:00`，confidence 为 `0.75`。

```json
{
  "success": true,
  "outcome": "appended",
  "originalNotePreserved": false,
  "timestamp": "2026-03-31 13:00:00",
  "confidenceAfterReload": 1
}
```

`truncateEpisodeDuration` 也会整文件重建，因此需要同时覆盖追加与截断两条路径。已有迁移脚本是原地结构规范化，不能直接当作新数据目录的无损迁移方案，见 [migrate-existing-memory.mjs](../scripts/migrate-existing-memory.mjs) 第 102–123 行。

OpenClaw 将 `memory/YYYY-MM-DD.md` 用作通用 daily notes；Timeline 的 parser 不能定义该文件中其他内容的有效性。[官方记忆约定](https://docs.openclaw.ai/concepts/memory#what-goes-where)

迁移必须保留原文件字节、来源路径、旧时间解释规则和导入记录。无法证明来源或时区的旧记录应标为 legacy/不确定，不能自动升级成 observed/高置信度。宿主记忆投影应独立生成，显式标记 persona-generated 内容。

### 4.2 文件锁归属错误：新增 P0

依据：[lock.ts](../src/storage/lock.ts) 第 21–35 行。`fs.openSync(lockPath, 'wx')` 失败时 `fd` 仍为 `null`，但 `finally` 仍删除存在的 `lockPath`。

隔离复现：预置 writer A 的 `.lock`，让 writer B 调用 `withFileLock`。

```json
{ "contenderError": "LOCK_EXISTS", "ownerLockPreserved": false }
```

这证明“竞争者被拒绝”没有保住持有者的锁。后续必须只释放自己成功取得的锁，并验证失败竞争者不影响持有者；是否需要进程退出后的 stale lock 恢复，作为独立生命周期策略处理。

### 4.3 场景迁移绕过通用写入边界

依据：[execute_write.ts](../src/core/execute_write.ts) 第 119–145 行，对比 [timeline_transition.ts](../src/tools/timeline_transition.ts) 第 118–167 行。

查询生成走 canonical path 检查与 `withFileLock`；transition 直接调用 `deps.writeEpisode`，随后再单独执行 `truncateEpisodeDuration`。后者不是同一事务，失败时新旧事件可能仍重叠。这是源码确认的设计缺口，本次未做多进程竞争复现。

重构应让 resolve 与 transition 共用 `TimelineStore` 提交入口，集中处理路径归属、锁、幂等、同桶冲突和中断提交。先写新事件再截断旧事件的执行顺序本身不能提供原子性，跨日中断也必须可恢复。

### 4.4 时间问题同时影响过期、未来事件与部署迁移

依据：[collect_active_facts.ts](../src/core/collect_active_facts.ts) 第 18–32 行、[timeline_resolve.ts](../src/tools/timeline_resolve.ts) 第 205–212 行、[write-episode.ts](../src/storage/write-episode.ts) 第 176–178、260–281 行。

相同事件 `13:00 +08:00`，查询 `14:00 +08:00`：

| 进程时区 | 得到的 elapsed minutes | 正确值 |
| --- | --- | --- |
| UTC | 0 | 60 |
| Asia/Shanghai | 60 | 60 |

查询 `12:00 +08:00` 时，尚未开始的 `13:00` 事件在两个环境中都被 `collectActiveFacts` 接纳，elapsed 被截成 `0`。这说明修复不仅是给字符串补 offset，还要拒绝负时间差，并统一 fast path、lookback、transition 截断的时间运算。

建议持久化绝对 instant 与日历 IANA timezone，按事件日历时区归档；分开表示人格生活时区、用户问候时区与服务器时区。当前 `currentTime` 使用服务器 `Intl` 时区，不能默认等于 `PersonaContractV1.identity.home_timezone`，见 [runtime](../src/runtime/openclaw_timeline_runtime.ts) 第 1285–1289 行与 [persona contract](../src/persona/persona_contract.ts) 第 5–9 行。旧无 offset 时间需要一次明确的解释策略。

### 4.5 setup 的配置覆盖与自定义目录未接通

依据：[setup-openclaw-workspace.mjs](../scripts/setup-openclaw-workspace.mjs) 第 235–260、279–319 行。

隔离配置原有 `every: '5m'`、`target: 'none'`、`session: 'existing-session'`；运行 setup 后变为 `30m`、`last`，session 被删，同时新增 `skipWhenBusy: true`。未生成 `hooks.allowConversationAccess`。

新增复现：传 `--canonical-root-name timeline-store` 会创建对应目录及 engagement state，但不写 `plugins.entries.<id>.config.canonicalMemoryRoot`；运行时仍按默认 `memory` 解析。后续自有 store 的默认路径切换必须贯穿 setup、runtime、doctor、模板和迁移，不能只修改目录创建逻辑。

基础安装与主动问候启用需要各自明确的配置增量。升级工具应输出具体 patch，保留现有 heartbeat 调度与目标；宿主权限需作为明确选项呈现。

### 4.6 heartbeat、联系人保护与发送回执

依据：[engagement_hooks.ts](../src/engagement/engagement_hooks.ts) 第 162–185、293–329、354–409 行；[runtime](../src/runtime/openclaw_timeline_runtime.ts) 第 1405–1479 行。

隔离探针结果：

| 输入/条件 | 当前结果 |
| --- | --- |
| `trigger: 'user'`，正文“请解释 HEARTBEAT.md 应该如何编写” | 进入问候预检，注入“Reply exactly HEARTBEAT_OK” |
| 联系人依次 A → B → A | `single → conflict → single`，多联系人冲突被自动解除 |
| 已有 pending，同一 session 给另一联系人发送无关消息，`success: true` | pending 被清除，消息被计为问候成功 |

此外，inbound/outbound 用注册期 `workspaceDir || process.cwd()`，prompt hook 用调用期 workspace；在非默认 agent/workspace 下存在读写归属不一致，须用真实多 agent 事件验收。问候决策在进入状态更新锁前已计算，pending 应在锁内重新判定并原子领取。

保留发送成功后才更新问候时间的原则；增加 operation 与目标身份关联时，需先确认宿主事件实际提供哪些字段。仅把 hook 改成 typed `message_sent`，或仅生成一个未贯穿投递链路的 token，都不能形成可靠送达证明。

当前 [HEARTBEAT 模板](../templates/HEARTBEAT.fragment.md) 还明确禁止同轮其他任务。改用专用贡献 hook 时应一起解除这种全局接管；Her 没有问候内容时只退出自身贡献。

### 4.7 skill 与推理降级的职责需要校正

`metadata.openclaw.always: true` 表示 eligibility/gating，不能保证每轮读取并执行 skill。当前每轮路由依靠 skill 描述及 [SOUL 模板](../templates/SOUL.fragment.md) 的模型指令；发布验证要观察实际路由，不能只检查 skill 已加载。[官方技能语义](https://docs.openclaw.ai/tools/skills#gating)

另有评审未展开的文档偏差：[runtime](../src/runtime/openclaw_timeline_runtime.ts) 第 748–989 行用关键词判时间、给候选事实打分并判断连续性；失败后由 planner/reasoner catch 启用。这与 [LLM/脚本职责边界](./timeline-llm-runtime-boundary.md) 第 4 节禁止的语义 heuristics 不一致。重构时应明确保留哪些确定性只读快照，以及推理失败如何表达；不要在缺失模型能力时悄悄用关键词推理形成事实判断。

## 5. 建议的目标边界

| 模块 | 应拥有的职责 | 优先复用的现有实现 |
| --- | --- | --- |
| 领域层 | 时间请求、生活连续性、persona 约束、问候政策、下游消费含义 | `core/`、`persona/`、`engagement/should_send_proactive_greeting.ts` |
| `StructuredReasoner` | 统一四类 JSON 推理；agent 身份、模式、超时/取消、validator、有限格式修复、usage 与错误分类 | 既有各类 system/message builders 与契约校验 |
| `TimelineStore` | 独占文件、schema 版本、绝对时间、来源、修订、中断提交、幂等与恢复 | parser/writer 作为旧格式 adapter，现有写盘测试作为行为依据 |
| `HistoryReader` / `MemoryRecall` | 有界历史读取；可选语义检索及明确 capability 状态 | collector 的依赖注入接口 |
| `ScopeResolver` / `EngagementStore` | 调用期 agent/workspace/联系人归属；原子 pending 与去重 | 现有问候状态与 throttle 规则 |
| OpenClaw adapter | 官方类型、单一生产注册、工具 factories、typed/internal 事件转换、版本能力诊断 | 默认导出的实际 runtime 路径 |
| 安装与诊断 | 版本匹配、配置 patch、权限、目录迁移与可执行验收 | setup / doctor CLI 外壳 |

普通对象 default export 本身有效；问题在于当前手写 `definePluginEntry/materializePlugin` 与真实 default 注册存在两条路径。重构应让官方类型约束生产入口，收集器放入测试辅助，测试直接覆盖生产注册。

独占 Markdown 足够作为第一版 store；无需为本次适配直接引入数据库。可采用 workspace 下 `.timeline/canon` 一类独立根，但最终路径、数据 schema 与迁移开关需先定案。运行态 state、trace、cache 应与 canon 分开，避免混为可召回的事实。

## 6. 实施前需要定案的事项

以下是建议默认值，尚未作为产品决策写入实现。

| 决策 | 建议默认值 | 需要确认的实际取舍 |
| --- | --- | --- |
| 最低宿主版本 | 先只对 `2026.10.9` 给出已验证支持 | 继续支持 `2026.6.10` 就必须保留并测试独立 adapter，不能仅保留无上界 semver 声明 |
| store 与旧时间解释 | 独占目录；历史默认解释时区由迁移输入明确指定，逐条保留来源 | 当前部署是否有多个旧时区，是否存在无法确定时区的文件 |
| 内部推理模式 | 提供统一接口，先选已部署模型/harness 可运行的模式 | direct 的结构化约束与 isolated 的 CLI/harness 路由不能视为等价 |
| 通用记忆检索 | 可选，首版以自有 canon 为可靠源 | 无宿主 recall 时，是允许限定范围继续，还是阻止新的 canon 生成，需要显式政策 |
| 联系人支持范围 | 首里程碑可先严格绑定单一目标；保留完整 scope 字段 | 若要求多联系人，按 agent + channel/account + conversation/contact 分区，并避免每个联系人独立驱动同一人格而失控 |
| 发送可靠性 | 固定版 heartbeat + 正确作用域；不把观察事件声明为持久回执 | 若要求精确重试/送达证明，应单独设计有 job/run/delivery 身份的发送任务 |

## 7. 建议拆成可独立验收的提交

1. **数据与锁基线**：修复锁归属；建立统一 store 写入边界；resolve/transition 共用路径、锁、幂等与可恢复中断提交。验收失败竞争者不删锁、新写失败不修改旧事件、共享记忆原文不变。
2. **时间与持久化版本**：保存绝对时间/日历时区及来源；实现旧格式读取、无损导入、preview/apply 和恢复记录。UTC 与上海下结果一致，未来事件不能生效。
3. **安装与权限**：停止输出 `skipWhenBusy`；对目标 schema 校验配置；连接自定义 dataRoot；拆分 Timeline 安装与问候配置；同步 doctor/模板/README。
4. **宿主适配**：接入官方 SDK 类型与单一注册入口；统一 completion；删除无效 runtime factory；把搜索零命中、不可用、拒绝和失败分开。保留 schema 校验和领域 guard。
5. **互动事件**：专用 heartbeat hook、调用期作用域、原子领取 pending、目标关联、稳定联系人保护；移除文本识别 heartbeat 和独占全部 heartbeat 任务的模板。
6. **真实宿主门禁**：固定宿主安装实际 npm 包，验证 hook 授权、配置、工具执行、completion 和状态归属。契约覆盖后再调整兼容声明与 build metadata。

前两项优先级最高；后续拆包可按接口依赖合并。首里程碑继续保持 `result.consumption` 的外部含义，数据迁移与 adapter 改造优先藏在边界内部；需要升级消费协议时另行定义版本与兼容策略。

## 8. 已执行的验证与发布验收缺口

| 验证 | 结果 |
| --- | --- |
| `npm run verify`，默认 Asia/Shanghai | typecheck/build 通过；38 suites 通过、2 suites 跳过；208 tests 通过、5 tests 跳过 |
| `$env:TZ = 'UTC'; npm run test:unit`，独立 PowerShell 进程 | 205 tests 通过、3 tests 失败、5 tests 跳过 |
| UTC 失败 1、2 | `collect_active_facts.test.ts`：elapsed `60 → 0`、`1560 → 1080` |
| UTC 失败 3 | `timeline_resolve.test.ts`：应过期的事件返回 `read_only_fast_hit` |
| 隔离运行探针 | 覆盖普通笔记保存、confidence 往返、锁归属、未来事件、heartbeat 误触发、联系人状态、发送归属、setup 输出 |
| `npm run test:smoke` | 明确输出 runtime not found 并跳过；不能计为兼容通过 |
| live experience / 真实模型 / 渠道投递 | 未执行，属于后续宿主验收 |

上述探针只使用临时目录与 fake 事件，没有真实消息投递；临时脚本和 fixture 已清理。依赖安装使用锁文件及 `--ignore-scripts`，未改依赖声明。

发布前还要证明：真实第三方插件授权门控；无权限/无模型/取消超时不会继续写 canon；不同 agent 与联系人互不污染；输出消费面兼容；旧存储迁移后可回滚且重复导入幂等；必要宿主条件缺失时兼容验收应失败而非跳过。
