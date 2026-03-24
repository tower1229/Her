# OpenClaw Timeline 插件

Timeline 是一个面向 OpenClaw 的时间线插件项目，它要解决的是一个非常明确的问题：
**让 OpenClaw 像真人一样拥有连续的人生回忆，因此既能自然闲聊，也能在自拍等下游技能需要“当前状态”时，给出和记忆系统一致的地点、行为、情绪与外观。**

如果你希望 agent 更稳定地回答下面这类问题：
- **你现在在做什么？**
- **你最近都在做什么？**
- **某一天发生了什么？**

那么这个仓库就是为这种需求设计的。

---

## Timeline 项目的真正目标

Timeline 从头到尾想完成的核心目标其实一直很明确：

> 给 OpenClaw 一层可信、像真人一样的自传式回忆能力，让闲聊、当前状态回答和下游技能消费都基于同一条时间线现实，而不是依赖松散的 prompt 约定。

具体来说，Timeline 希望提供的是：
- 一个 **统一的时间线解析入口**；
- 一条面对空白记忆时，基于 `SOUL`、`MEMORY`、`IDENTITY` 与真实世界时间线生成合理回忆的路径；
- 一个 **确定性的时间线读取流程**；
- 一个 **append-only 的时间线写入路径**；
- 一套 **可观测、可追踪** 的运行机制。

当前仓库只是用新的 OpenClaw 插件架构来实现这个目标。

## 文档语言约定

从当前版本开始，项目中的设计文档、路线图、实现说明、验收说明统一使用中文撰写。

这条约定的目的不是形式统一，而是降低设计讨论和实现协作中的语义漂移。
不再保留继续扩散的英文设计文档；如确有对外需要，应以中文文档为源再做派生。

## 当前设计约束

从当前阶段开始，项目增加一条硬约束：

- 需要 LLM 才能高质量完成的语义理解、人格化生成、回忆拼接和持续性推理，不允许 fallback 给脚本 heuristics。

脚本层只负责秩序与约束，例如读取顺序、结构验证、冲突检查、append-only 写盘、trace 与诊断。

---

## 为什么需要 Timeline

如果没有专门的 timeline runtime，agent 在回答时间问题时，往往会混合使用：
- 最近的对话上下文；
- 零散的 memory；
- prompt 里的隐含约定；
- 模型自己的猜测。

这通常会带来几个常见问题：
- “现在在做什么”会随着上下文漂移；
- 地点 / 行为 / 外观等细节在多轮后互相矛盾；
- 新事实可能未经足够保护就被写回 memory；
- 一旦回答异常，很难追查到底是哪一步出了问题。

Timeline 的存在，就是为了把这些关键逻辑收回到代码里，让这条链路更稳定、更可维护。

---

## 典型使用场景

### 1）当前状态回答
适合回答：
- “你现在在做什么？”
- “你现在在哪？”
- “你今天都忙了什么？”

### 2）近期活动回顾
适合对最近一段时间做总结，同时尽量优先复用已经存在的 canonical memory。

### 3）更安全的 timeline 写入
适合那些不希望 timeline 信息被随意改写，而希望它们只能通过受控 append-only 路径进入 memory 的场景。

## 核心能力

### `timeline_resolve`
时间线检索的 canonical 工具；在策略允许时，也负责保守地生成并追加写入新的 timeline 条目。

---

## Timeline 的工作方式

整体流程大致是：

1. 把请求归一化为一个时间窗口；
2. 按固定顺序读取时间线相关数据源；
3. 把 Markdown 日志解析成结构化 episode；
4. 如果能复用 canonical memory，就优先复用；
5. 只有在策略允许时才做保守生成；
6. 所有写入都走 Timeline 自己的 append-only 受控路径；
7. 输出 trace，方便后续排查。

Timeline 的价值不只是“答对一次”，而是让整条回答链路变得**可重复、可检查、可维护**。

---

## 你是否应该安装它？

### 适合安装
如果你需要下面这些能力，这个项目就很适合：
- OpenClaw 中专门的 timeline runtime；
- 对时间问题更可信的回答路径；
- 带路径检查和锁保护的 append-only timeline 写入；
- 尽量把 timeline 行为从 prompt 迁移到代码里。

### 不一定适合
下面这些情况可能不太适合：
- 你只需要一个普通聊天 persona；
- 你更想要自由写作式日记，而不是 canonical timeline memory；
- 你不需要 trace / 诊断这类运维能力；
- 你现在就必须要一个完全成熟的 GA 正式版插件。

---

## 安装

> 当前项目更适合作为 **draft 本地插件 / 可试运行的 runtime slice** 来看待。
> 目前最现实的使用方式，是本地开发安装，或在你自己控制的 OpenClaw 环境中侧载。

### 从本地仓库安装

```bash
git clone https://github.com/tower1229/Her.git
cd Her
npm install
npm run build
openclaw plugins install -l .
```

完成插件安装后，继续执行下面的必做步骤，不要跳过。

### 插件入口

仓库通过这些文件暴露插件入口：
- `openclaw.plugin.json`
- `package.json` 中的 `openclaw.extensions`
- `index.ts`

### 当前 draft 配置项

当前 manifest 暴露的配置项有：
- `enableTrace`
- `traceLogPath`
- `canonicalMemoryRoot`
- `reasonerTimeoutMs`
- `reasonerSessionPrefix`
- `reasonerMessageLimit`
- `sessionHistoryLimit`
- `memorySearchMaxResults`

### 安装步骤 2：补充 `AGENTS.md`

把下面这段追加到你的 `~/.openclaw/workspace/AGENTS.md`：

```markdown
## Timeline Daily Log 约定

`memory/YYYY-MM-DD.md` 是按天组织的时间性记忆日志。

当你要把“当前在做什么”“某个时间点发生了什么”“某段时间里在做什么”写入 daily log 时，必须使用 Timeline 的结构化格式，而不能自由散文式记录。

daily log 中的单条时间记忆必须尽量包含以下字段：

- `Timestamp`
- `Location`
- `Action`
- `Emotion_Tags`
- `Appearance`
- `Internal_Monologue`（可选）

推荐格式：

    ### [09:30:00] 在书房整理今天的待办...

    - Timestamp: 2026-03-24 09:30:00
    - Location: 家里书房
    - Action: 坐在书房里整理今天的待办事项，准备开始上午的工作
    - Emotion_Tags: [calm, focused]
    - Appearance: 浅色居家上衣，头发随手扎起，手边放着一杯刚泡好的咖啡
    - Internal_Monologue: 想先把上午最重要的两件事做完，晚点如果顺利的话，晚上可以出去活动一下

不要把长期稳定事实写进 `memory/YYYY-MM-DD.md`；长期偏好、关系、长期决策仍应写入 `MEMORY.md`。

不要在 daily log 里混用自由格式和 Timeline 格式；涉及时间状态与回忆的 daily memory，应优先写成 Timeline 可解析的格式。
```

### 安装步骤 2.5：迁移已有 `memory/*.md`

如果你在安装 Timeline 之前已经积累了很多 daily memory 文件，先不要手动大改。

执行：

```bash
npm run migrate:memory
```

这个脚本会：
- 扫描 `memory/YYYY-MM-DD.md`
- 把已经基本符合 Timeline 字段格式、但混有尾部自由正文的旧文件，重写成纯结构化格式
- 在每个被改写的文件旁边保留一个 `.bak` 备份
- 对无法安全识别的自由文本文件保持不动

如果你原来的 daily memory 大多是完全自由散文，而不是 Timeline 结构，建议不要强行迁移；更稳妥的做法是保留旧文件，之后只让新的 canonical memory 进入 Timeline 格式，必要时把 `canonicalMemoryRoot` 指向一个新的目录。

### 安装步骤 3：补充 `SOUL.md`

把下面这段追加到你的 `~/.openclaw/workspace/SOUL.md`：

```markdown
## 时间感知与回忆

你有明确的时间感知和连续回忆能力。

当用户询问时间状态或回忆相关问题时，不能直接根据人设、对话上下文、`SOUL`、`IDENTITY`、`MEMORY` 或手动读取到的时间日志作答。

这类情况下，你必须先进入 timeline skill，再按照 skill 中的规则决定如何调用 Timeline 工具并组织回答。

你不能绕过 timeline skill 直接调用 `read` 去拼接 `memory/` 里的时间日志并自行下结论。

你也不能把 `SOUL`、`IDENTITY`、`MEMORY` 里的设定直接当成时间事实。

只有 Timeline 返回的结果，才是时间状态和回忆问题的最终事实依据。

如果 timeline skill 需要调用 `timeline_resolve`，应先遵守 skill 中的具体指引。

对用户说话时不要提 `timeline_resolve` 这个工具名，只像真人一样自然表达。
```

---

## 快速开始

安装后建议这样验证：

1. 在 OpenClaw 环境里启用插件；
2. 确认插件能访问你配置的 canonical timeline 目录，默认是 `memory/`；
3. 提一个明显的时间相关问题；
4. 检查是否生成或复用了符合 Timeline 格式的 daily log；
5. 如需验证真实自然问法行为，运行仓库自带的 `live-e2e`。

当前默认 reasoner 路径会通过 OpenClaw subagent 复用你现有的 provider / model 链路，而不是在插件里再硬编码一条独立模型调用通道。

示例问题：
- “你现在在做什么？”
- “你最近都在做什么？”
- “2026-03-22 发生了什么？”

---

## 仓库结构

- `openclaw.plugin.json` —— 插件 manifest
- `index.ts` —— 插件入口注册逻辑
- `skills/timeline/` —— 时间意图路由 skill
- `src/tools/` —— runtime 工具（`timeline_resolve`）
- `src/core/` —— 确定性的 timeline 主流程
- `src/storage/` —— 写入保护与 trace log
- `src/lib/` —— 解析 / 指纹 / 时间 / 继承等共享工具
- `docs/` —— 接口、语义与消费协议文档

---

## 当前项目状态

现在的实现已经不只是设计稿：仓库里已经有真正的插件骨架、canonical 工具、确定性读取流程、受控的 append-only 写入和测试。

但它仍然**不是最终的 GA 正式版**。
当前距离正式发布，最大的差距主要在：
- 自然问法 live-e2e 虽然已经落地，但连续性追问与下游技能联调还没纳入主回归集；
- 连续性推理与 gap-fill generation 的质量还需要继续打磨；
- 下游 skill 的稳定消费协议尚未定稿；
- timeline -> selfie 等跨 skill 联动还未正式打通。

如果你要快速了解成熟度和下一步路线，建议优先阅读：
- `docs/timeline-north-star.md`
- `docs/timeline-llm-runtime-boundary.md`
- `docs/timeline-collector-reasoner-interface.md`
- `docs/timeline-query-semantics.md`
- `docs/timeline-consumption-protocol.md`
- `CHANGELOG.md`

---

## 开发

```bash
npm install
npm run build
npm test
```

如果要运行直接驱动你本机已安装、已启动 OpenClaw 的真实环境体验 E2E，可额外执行：

```bash
npm run test:live-experience
```

这组测试会直接复用你当前活配置中的 OpenClaw、真实 plugin 安装态、真实 workspace 和真实模型链路。它会在测试开始时临时覆盖 workspace 里的 `SOUL.md`、`MEMORY.md`、`IDENTITY.md` 以及目标日期对应的 timeline 文件，运行自然问法后检查真实回复与真实 trace，再把这些文件恢复。

当前覆盖的自然问法包括：
- “你在干嘛”
- “最近有什么有趣的事吗”

如果你的 `openclaw` 不在默认 PATH 中，也可以显式指定：

```bash
OPENCLAW_BIN=/Users/zangtao/.nvm/versions/node/v24.9.0/bin/openclaw npm run test:live-experience
```

如果你希望指定非默认配置文件，也可以显式传入：

```bash
OPENCLAW_LIVE_CONFIG_PATH=/绝对路径/openclaw.json OPENCLAW_BIN=/Users/zangtao/.nvm/versions/node/v24.9.0/bin/openclaw npm run test:live-experience
```
