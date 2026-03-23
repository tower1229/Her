# OpenClaw Timeline 插件

[English README](./README.md)

Timeline 是一个面向 OpenClaw 的时间线插件项目，它要解决的是一个非常明确的问题：
**让 OpenClaw 像真人一样拥有连续的人生回忆，因此既能自然闲聊，也能在自拍等下游技能需要“当前状态”时，给出和记忆系统一致的地点、行为、情绪与外观。**

如果你希望 agent 更稳定地回答下面这类问题：
- **你现在在做什么？**
- **你最近都在做什么？**
- **某一天发生了什么？**
- **这份 timeline 日志是不是坏了？**

那么这个仓库就是为这种需求设计的。

---

## Timeline 项目的真正目标

这个项目的重点不应该是“v2 和 v1 的差距是什么”。
Timeline 从头到尾想完成的核心目标其实一直没变：

> 给 OpenClaw 一层可信、像真人一样的自传式回忆能力，让闲聊、当前状态回答和下游技能消费都基于同一条时间线现实，而不是依赖松散的 prompt 约定。

具体来说，Timeline 希望提供的是：
- 一个 **统一的时间线解析入口**；
- 一条面对空白记忆时，基于 `SOUL`、`MEMORY`、`IDENTITY` 与真实世界时间线生成合理回忆的路径；
- 一个 **确定性的时间线读取流程**；
- 一个 **append-only 的时间线写入路径**；
- 一套 **可观测、可追踪、可排查** 的运行机制；
- 一组 **给维护者用的状态/修复工具**。

当前仓库只是用新的 OpenClaw 插件架构来实现这个目标。

## 文档语言约定

从当前版本开始，项目中的新增设计文档、路线图、实现说明、验收说明统一使用中文撰写。

这条约定的目的不是形式统一，而是降低设计讨论和实现协作中的语义漂移。
历史上已经存在的英文文档暂不在本次统一范围内；后续如需保留英文版本，应以中文文档为准再做派生。

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

### 4）运维排查与修复
适合维护者检查插件是否注册成功、最近一次运行发生了什么、某日日志是否 malformed、trace 是否异常。

---

## 核心能力

### `timeline_resolve`
时间线检索的 canonical 工具；在策略允许时，也负责保守地生成并追加写入新的 timeline 条目。

### `timeline_status`
给维护者使用的轻量状态工具，用来查看插件元信息、注册情况，以及最近一次 runtime 快照。

### `timeline_repair`
诊断工具，用于检查 malformed daily log、canonical path 是否正确，以及最近的运行 / trace 记录。

### 生命周期 helper
插件还包含以下 hook helper：
- pre-compaction flush
- session snapshot
- audit trace persistence

---

## Timeline 的工作方式

整体流程大致是：

1. 把请求归一化为一个时间窗口；
2. 按固定顺序读取时间线相关数据源；
3. 把 Markdown 日志解析成结构化 episode；
4. 如果能复用 canonical memory，就优先复用；
5. 只有在策略允许时才做保守生成；
6. 所有写入都走 Timeline 自己的 append-only 受控路径；
7. 输出 trace 和运行状态，方便后续排查。

Timeline 的价值不只是“答对一次”，而是让整条回答链路变得**可重复、可检查、可维护**。

---

## 你是否应该安装它？

### 适合安装
如果你需要下面这些能力，这个项目就很适合：
- OpenClaw 中专门的 timeline runtime；
- 对时间问题更可信的回答路径；
- 带路径检查和锁保护的 append-only timeline 写入；
- 给维护者使用的状态 / 修复工具；
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

---

## 快速开始

安装后建议这样验证：

1. 在 OpenClaw 环境里启用插件；
2. 确认插件能访问你打算使用的 `memory/` 目录；
3. 提一个明显的时间相关问题；
4. 用 `timeline_status` 看注册与最近一次运行状态；
5. 如发现日志格式异常或写入路径异常，用 `timeline_repair` 做诊断。

示例问题：
- “你现在在做什么？”
- “你最近都在做什么？”
- “2026-03-22 发生了什么？”
- “帮我检查今天的 timeline 日志有没有格式问题。”

---

## 仓库结构

- `openclaw.plugin.json` —— 插件 manifest
- `index.ts` —— 插件入口注册逻辑
- `skills/timeline/` —— 时间意图路由 skill
- `src/tools/` —— runtime 工具（`timeline_resolve`、`timeline_status`、`timeline_repair`）
- `src/core/` —— 确定性的 timeline 主流程
- `src/hooks/` —— 生命周期 helper
- `src/storage/` —— 写入保护、trace log、runtime status、run log
- `src/lib/` —— 解析 / 指纹 / 时间 / 继承等共享工具
- `docs/` —— 接口、路线图、迁移、状态与发布文档

---

## 当前项目状态

现在的实现已经不只是设计稿：仓库里已经有真正的插件骨架、canonical 工具、确定性读取流程、受控的 append-only 写入、hooks、诊断能力和测试。

但它仍然**不是最终的 GA 正式版**。
当前距离正式发布，最大的差距主要在：
- 真实 OpenClaw runtime 的端到端验证；
- 更强的写入路径 / 单写者保障；
- 更完整的可观测性和运维工具；
- 更高可信度的生成写入行为。

如果你要快速了解成熟度和下一步路线，建议优先阅读：
- `docs/timeline-north-star.md`
- `docs/timeline-roadmap.md`
- `docs/timeline-v2-status.md`
- `docs/timeline-v2-implementation-review.md`
- `docs/timeline-v2-release-checklist.md`
- `docs/timeline-v2-quickstart.md`
- `docs/timeline-v2-migration.md`
- `docs/timeline-v2-refactor-plan.md`
- `docs/timeline-resolve-interface.md`
- `CHANGELOG.md`

---

## 开发

```bash
npm install
npm run build
npm test
```
