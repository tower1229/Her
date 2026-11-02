# OpenClaw 上游契约核验（2026-11-01）

本次核验服务于 Her 下一步重构准备，不改变运行实现或用户 OpenClaw 配置。仓库核验版本为 `feda99284ff7695d68dc283cb6f5295e8b3ccc91`，包版本 `2.8.10`。评审对话由主报告单独核对。

## 结论

评审选择 `v2026.10.9` 作为当前稳定版基线成立，但不能把在线文档所有新能力都算入该版本。至少发现两处明显漂移：在线 isolated completion 示例增加了 `outputSchema`；在线 heartbeat 已转向 proactive automation，而稳定版仍有独立 heartbeat 流程。

重构应先修复宿主契约：typed hook 授权、运行时注入、已移除配置、记忆读取能力。`runtime.llm.complete` 和 `subagent.complete` 均可作为减少手动会话管理的候选；具体执行模式、agent 身份、输出校验与超时需要明确，不能机械替换。

## 版本与证据边界

- **已确认**：官方 GitHub release 将 `v2026.10.9` 标为 Latest，页面日期为 `29 Oct 15:54`，发布提交显示 `8b18b55`。日期本身与版本号中的 `10.9` 不同。[官方发布页](https://github.com/openclaw/openclaw/releases/tag/v2026.10.9)
- **已确认**：本项目 `package.json:81` 声明 `openclaw.compat.pluginApi >=2026.6.10`，`:84` 的构建元数据仍是 `2026.6.10`。这是项目声明，不能证明整个范围真实兼容。
- **执行建议**：优先固定 `v2026.10.9` 建兼容验收；是否保留六月版本支持，应单独决定并用真实宿主矩阵证明。在线文档用于发现方向，稳定版 tag 的源码/文档用于确认该版本行为。

## 逐项核验

| 项目 | 状态与准确结论 | 本地影响与依据 |
| --- | --- | --- |
| `before_prompt_build` 授权 | **已确认**：第三方插件需要 `plugins.entries.<id>.hooks.allowConversationAccess: true`。`allowPromptInjection` 默认为允许，但不授予会话读取权限；显式 `false` 阻断 prompt 修改。两个开关都在插件条目的 `hooks` 下，不在业务 `config` 下。 | 本地 `index.ts:38` 注册该 hook；`src/runtime/openclaw_timeline_runtime.ts:280` 仅判断 prompt injection，不能替代宿主注册授权。[稳定版 hooks 文档](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/plugins/hooks.md#L114) |
| typed / internal hooks | **已确认**：typed hooks 用 `api.on`，internal hooks 用 `api.registerHook` 与冒号事件名。将下划线 typed 名称注册进 `registerHook`，typed runner 不会调用。 | `index.ts:40` 的 `registerHook('before_prompt_build')` fallback 不是有效兼容路径；`:63`、`:67` 的 `message:preprocessed` / `message:sent` 属另一套事件契约，不能直接改名后沿用 handler。[稳定版说明](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/plugins/hooks.md#L20) |
| SDK `createPluginRuntime` | **已确认**：稳定版 `openclaw/plugin-sdk/runtime` 的导出是日志、环境、进程等辅助能力，没有 `createPluginRuntime`。应使用宿主注入的 `api.runtime`。 | 本地 `src/runtime/openclaw_timeline_runtime.ts:91`、`:199` 假设该导出存在，其可选调用只能形成失效 fallback，不能证明 late binding 可工作。[稳定版 runtime.ts 全部导出](https://github.com/openclaw/openclaw/blob/v2026.10.9/src/plugin-sdk/runtime.ts)；[稳定版注入约定](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/plugins/sdk-runtime.md#L10) |
| `runtime.tools.createMemorySearchTool` | **已确认**：稳定版公开 `PluginRuntimeCore` 与 `PluginRuntime` 没有该 `tools` namespace / factory。 | 本地 `src/runtime/openclaw_timeline_runtime.ts:1351` 未找到 factory 就返回 `[]`，会把能力缺失混成搜索无命中。[稳定版核心 runtime 类型](https://github.com/openclaw/openclaw/blob/v2026.10.9/src/plugins/runtime/types-core.ts)；[稳定版组合类型](https://github.com/openclaw/openclaw/blob/v2026.10.9/src/plugins/runtime/types.ts#L137) |
| 已有 subagent 会话 API | **已确认**：`run`、`waitForRun`、`getSessionMessages`、`deleteSession` 仍存在。不能把它们一概称为移除或私有 API。 | 本地 `src/runtime/openclaw_timeline_runtime.ts:63` 使用的名称与上游相符。是否适合无工具 JSON 推理，是架构选择；有会话/工具需求时仍可用。[稳定版类型](https://github.com/openclaw/openclaw/blob/v2026.10.9/src/plugins/runtime/types.ts#L187) |
| `subagent.complete` | **已确认**：稳定版支持 fresh、无保留会话、不投递结果的完成接口，返回 `{ text }`；必须给配置中存在的 `agentId` 与 `message`，默认超时 30 秒。需要 live Gateway binding / plugin identity，并保留调用者权限与生命周期。 | 可减少本地 reasoner / persona extraction 的 run→wait→读消息→删除流程，但不能忽略现有 90 秒预算、取消、错误传播和 agent 归属；不支持的 runtime 在推理前失败。[稳定版 background work](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/plugins/sdk-runtime/background-work.md#L47) |
| `runtime.llm.complete` | **已确认**：稳定版提供此接口，结果含 text、provider/model/agent、usage、execution。direct 与 isolated 是不同执行契约。在线文档推荐新插件使用该接口。 | 可设一个统一宿主模型 adapter；调用者仍需解析 JSON、校验 schema，并处理取消与失败。不能将其等同于一个不带策略的通用 HTTP 请求。[稳定版类型](https://github.com/openclaw/openclaw/blob/v2026.10.9/src/plugins/runtime/types-core.ts#L239)；[在线 model helpers](https://docs.openclaw.ai/plugins/sdk-runtime/models#prepared-completion-sdk-compatibility) |
| `responseFormat` | **已确认**：稳定版该字段属于 direct completion；isolated 只接收一个新的 user message，并有显式 `execution.mode: "isolated-agent-runtime"`。不能给 isolated 直接叠加 direct 的控制字段。 | 选择 direct 时可尝试 provider-native 约束，仍要本地校验；选择 CLI/harness isolated 时要接受独立能力边界。[稳定版参数联合类型](https://github.com/openclaw/openclaw/blob/v2026.10.9/src/plugins/runtime/types-core.ts#L255) |
| `heartbeat.skipWhenBusy` | **已确认**：稳定版 `HeartbeatSchema` 使用 strict object，字段列表不含 `skipWhenBusy`，因此不是当前有效配置。 | 本地 `scripts/setup-openclaw-workspace.mjs:247` 仍写该键；doctor、README 与测试也把它当有效契约，需要一并修订。不能只更新文案。[稳定版严格 schema](https://github.com/openclaw/openclaw/blob/v2026.10.9/src/config/zod-schema.agent-runtime.ts#L39) |
| `heartbeat_prompt_contribution` | **已确认**：稳定版已有该 typed hook，仅供 heartbeat turn 增加 `prependContext` / `appendContext`；可供后台状态摘要使用，不会自动创建 heartbeat。 | 是后续减少 HEARTBEAT 模板耦合的候选，但要验证使用中的 harness、授权、触发、递归边界；其存在本身不是完成主动问候投递的证明。[稳定版 hook 文档](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/plugins/hooks/prompt-and-session.md#L58)；[稳定版 hook catalog](https://github.com/openclaw/openclaw/blob/v2026.10.9/src/plugins/hook-types.ts#L126) |
| skill `always: true` | **已确认**：这是 eligibility / gating 设置：OS 允许时跳过 binaries/env/config 要求；不代表框架保证每轮读取 skill 正文或执行路由。 | `skills/timeline-skill/SKILL.md:3`、`:11` 写“每轮进入”只能作为模型指令，不能当已执行的 runtime invariant。[稳定版 Skills 定义](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/tools/skills.md#L470) |
| Memory / Context Engine slots | **已确认**：属于独占实现入口，同一 slot 同时只选一个 active 实现。 | Timeline 目前是 additive plugin；若为读取记忆而占用 slot，会扩大重构范围并与现有 memory/context 方案耦合。除非明确要替换整个宿主能力，否则应保持 additive。[稳定版 SDK overview](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/plugins/sdk-overview.md#L57) |
| `memory-host-search` 与 Gateway search | **在线文档已确认；稳定版细节待补契约验证**：在线文档明确 `memory-host-search` 是 bundled consumer 的 private-local facade；任意第三方不能把 `runtime.gateway.request` 当通用绕过接口，后者有 trusted official / bundled 限制。 | 因而不能把本地失效 factory 机械替换为这两者。下一步要选受支持且保留 requester/tool-policy 权限的读取通道，或由当前主 agent 显式提供合法记忆结果。[在线 memory slots](https://docs.openclaw.ai/plugins/sdk-overview/memory-and-context#provider-neutral-memory-runtime)；[在线 Gateway helpers](https://docs.openclaw.ai/plugins/sdk-runtime/gateway-and-nodes#gateway-and-node-namespaces) |

## 两处滚动文档差异必须写入重构约束

1. **模型输出约束**：在线 `sdk-runtime/models` 给 isolated 示例加入 `outputSchema`，且提示仅为 advisory，需要继续校验；稳定版 `LlmIsolatedAgentRuntimeCompleteParams` 没有此字段。目标为 `v2026.10.9` 时不要照抄在线示例，要按 tag 能力实现；目标升级时再探测/验收。[在线模型文档](https://docs.openclaw.ai/plugins/sdk-runtime/models#model-namespaces) / [稳定版参数](https://github.com/openclaw/openclaw/blob/v2026.10.9/src/plugins/runtime/types-core.ts#L263)
2. **Heartbeat 生命周期**：稳定版文档仍描述 scheduled heartbeat 与 `HEARTBEAT.md`；在线英文 hooks 文档已把 `heartbeat_prompt_contribution` 描述成 receipt-owned proactive automation jobs，侧栏将 HEARTBEAT.md 列为 retired。不能据在线新术语宣布稳定版 HEARTBEAT 已移除，也不能将稳定版 hook 的触发语义推到未来 runtime。[稳定版 Heartbeat](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/gateway/heartbeat.md) / [在线 prompt hooks](https://docs.openclaw.ai/plugins/hooks/prompt-and-session#prompt-and-model-hooks)

## 下一步建议与未完成的契约证明

- 先确定最低 OpenClaw 版本。以 `v2026.10.9` 为目标完成 adapter 与真实宿主验收，再决定是否额外支持 `2026.6.10`；不应继续仅靠本地 `PluginApiLike` / mocks 宣称全范围兼容。
- 模型 adapter 明确携带 agentId、执行模式、目的、取消、超时、输出 validator；`llm.complete` 与 `subagent.complete` 二选一或按宿主能力选择，拒绝不存在的 factory fallback。
- 记忆来源必须区分“没有命中”“能力不可用”“访问被拒”“执行失败”；针对所选通道验证实际记忆提供者、当前 session、tool policy 与数据范围。
- 验证第三方插件真实注册情况、hook 禁用/授权路径、选择的 harness、heartbeat/普通用户 turn、fresh completion、记忆真实命中。主报告负责本地功能缺陷与已有测试基线，此文不重复运行可能投递真实消息的集成测试。

核验限制：GitHub MCP 读取 release/tag 返回 `401 Bad credentials`，已改用官方公开 release 页面与 tag raw 源码；未安装/升级 OpenClaw，未修改宿主配置。未能读取的固定 tag memory consumer 实现保留为待验证，不将在线文档结论包装成该版本已完成的运行验证。
