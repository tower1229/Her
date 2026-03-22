# OpenClaw Timeline Plugin v2（中文版）

[English README](./README.md)

这是一个面向 OpenClaw 的草案版时间线插件：
它把时间相关事实解析从 prompt 约定迁移到代码里的 canonical runtime，
让“现在在做什么”“最近在做什么”“某天发生了什么”这类问题可以由插件统一处理，
而不是依赖 prompt 临场发挥。

如果你希望 agent 对时间线问题给出**结构化、可追踪、可追加写入、可排查**的答案，
这个仓库就是为这种场景设计的。

---

## 你是否需要安装这个插件？

### 适合安装的场景
- 你需要一个 **canonical timeline tool**，而不是 prompt-only 的记忆行为；
- 你希望 timeline 写入走 **append-only + canonical path + lock** 的受控路径；
- 你需要 **状态检查 / 修复诊断工具**（`timeline_status`、`timeline_repair`）；
- 你希望 timeline 结果带有 **trace**，方便回看“为什么得到这个答案”；
- 你希望 temporal intent 能通过 bundled skill 自动路由到 runtime。

### 不一定适合的场景
- 你只需要一个普通聊天 persona，不需要结构化 timeline memory；
- 你只想做自由写作式日记，不想接受 canonical 写路径约束；
- 你现在就需要一个完全稳定的正式版插件 —— 当前仓库仍是 **`2.0.0-draft`**。

---

## 这个插件解决什么问题

纯 prompt 时代的 timeline memory 很容易出现这些问题：
- “现在在做什么”依赖上下文猜测，而不是 canonical source；
- 外观 / 地点 / 行为细节在多轮对话后漂移；
- 新生成事实可能未经足够约束就写回 memory；
- 一旦 timeline 回答异常，很难追溯到底是哪一步出了问题。

Timeline Plugin v2 的目标就是把这些逻辑交回 runtime 代码，让插件自己负责：
- 时间窗口解析；
- 数据源读取顺序；
- Markdown 日志解析；
- fingerprint 复用还是生成；
- append-only 写入；
- repair / status 诊断；
- 生命周期 trace。

---

## 核心能力

### `timeline_resolve`
时间相关事实检索与（在允许时）append-only canon 生成的 canonical 入口。

### `timeline_status`
用于查看插件注册信息与最近一次 runtime 快照的轻量诊断工具。

### `timeline_repair`
用于检查 malformed daily log、canonical path 异常，以及最近 run / trace 日志的维护工具。

### 生命周期 hooks
仓库还提供了这些 hook helper：
- pre-compaction flush；
- session snapshot；
- audit trace persistence。

---

## 常见使用场景

### 1）当前状态回答
例如：
- “你现在在做什么？”
- “你现在在哪？”
- “你今天都在忙什么？”

### 2）最近活动回忆
适用于对近期时间窗口做回顾总结，同时尽量优先复用已有 canon。

### 3）安全的 timeline 写入
适用于希望 timeline 事实只能走受控写路径、而不是任意 memory mutation 的场景。

### 4）时间线排查与修复
当 daily log 格式异常、trace 可疑、写入路径有问题时，可使用 `timeline_status` 与 `timeline_repair`。

---

## 工作原理

整体流程大致如下：

1. 先把用户请求归一化成时间窗口；
2. 按固定顺序读取数据源（`sessions_history -> memory_get -> memory_search`）；
3. 把 Markdown 日志解析成结构化 episode；
4. 能复用 canon 就复用；
5. 只有在策略允许时才保守生成；
6. 所有写入都走 timeline 自己的 append-only 路径；
7. 最后产出 trace 与运行时诊断信息。

---

## 安装方式

> 当前仓库更适合被看作 **draft plugin project / 本地插件项目**。
> 目前最现实的使用方式是本地开发安装或在你自己控制的 OpenClaw 环境里侧载。

### 方案 A：从本地代码仓安装

```bash
git clone https://github.com/tower1229/Her.git
cd Her
npm install
npm run build
openclaw plugins install -l .
```

### 方案 B：手动指向插件入口

该仓库通过以下文件暴露插件入口：
- `openclaw.plugin.json`
- `package.json` 中的 `openclaw.extensions`
- `index.ts`

如果你的 OpenClaw 环境使用本地插件路径模式，可以直接把这个仓库接入，
并确保运行时能够解析到构建后的插件入口。

### 配置项

当前 draft manifest 暴露了这些插件配置：
- `enableTrace`
- `traceLogPath`
- `canonicalMemoryRoot`

这些配置会挂在 `timeline-plugin` 对应的 OpenClaw 插件配置项下面。

---

## 快速开始

安装完成后建议这样验证：

1. 在 OpenClaw 环境里启用该插件；
2. 确认插件可以访问你期望的 `memory/` 目录；
3. 发起一个明显的时间相关问题，让 skill 把请求路由到 timeline runtime；
4. 用 `timeline_status` 查看是否成功注册以及最近一次运行状态；
5. 如果日志格式异常或写路径可疑，用 `timeline_repair` 做诊断。

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
- `src/tools/` —— canonical 工具（`timeline_resolve`、`timeline_status`、`timeline_repair`）
- `src/core/` —— 确定性的运行时主流程
- `src/hooks/` —— 生命周期 hooks
- `src/storage/` —— 写入保护、trace log、runtime status、run log
- `src/lib/` —— 解析 / 指纹 / 时间 / 继承等共享工具
- `docs/` —— 设计、接口、路线图、状态和发布检查文档

---

## 当前状态

仓库现在只保留 v2 plugin-first 方向相关内容。
它已经能作为一个确定性的本地 runtime slice 使用，但仍未达到最终 GA 正式版。

如果你想先了解成熟度与后续路线，建议阅读：
- `docs/timeline-v2-refactor-plan.md`
- `docs/timeline-v2-status.md`
- `docs/timeline-v2-release-checklist.md`
- `docs/timeline-resolve-interface.md`

---

## 开发

```bash
npm install
npm run build
npm test
```
