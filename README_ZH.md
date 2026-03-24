# OpenClaw Timeline 插件

Timeline 为 OpenClaw 提供一层规范化的时间感知记忆，专门回答这类问题：

- 你现在在做什么？
- 昨晚发生了什么？
- 你最近都在做什么？

Timeline 不再依赖松散的 prompt 约定来回答这些问题，而是通过结构化 runtime 复用已有 daily log 事实、按时间窗口推理，并在策略允许时追加受保护的新条目。

## 插件提供什么

- 作为 canonical timeline 工具的 `timeline_resolve`
- 带路径校验和文件锁保护的 append-only daily log 写入
- 内置的 Timeline skill 路由
- 用于运行诊断的 trace 日志
- 覆盖插件 runtime 的 smoke test 和单元测试

## 安装

### 从 npm 安装

```bash
openclaw plugins install stella-timeline-plugin --pin
openclaw plugins enable timeline-plugin
```

npm 包名是 `stella-timeline-plugin`，OpenClaw 内部的插件 ID 仍然是 `timeline-plugin`。

### 从本地仓库安装

```bash
git clone https://github.com/tower1229/Her.git
cd Her
npm install
npm run build
openclaw plugins install -l .
openclaw plugins enable timeline-plugin
```

## 必需的 workspace 初始化

Timeline 需要在 OpenClaw workspace 中写入合约文本，保证 agent 以一致的方式写入和消费 daily log。

执行：

```bash
npm exec --package=stella-timeline-plugin openclaw-timeline-setup -- --workspace ~/.openclaw/workspace
```

如果你是在本地仓库里开发，也可以执行：

```bash
npm run setup:workspace -- --workspace ~/.openclaw/workspace
```

这个命令会幂等地更新：

- `AGENTS.md`
- `SOUL.md`
- canonical daily-log 根目录，默认是 `memory/`

如果你更希望手动编辑文件，也可以直接把下面两个模板片段复制进去：

- `templates/AGENTS.fragment.md` 写入 `AGENTS.md`
- `templates/SOUL.fragment.md` 写入 `SOUL.md`

然后确认 canonical daily-log 根目录已经存在，默认是 `memory/`。

## Workspace 自检

安装完成后可执行：

```bash
npm exec --package=stella-timeline-plugin openclaw-timeline-doctor -- --workspace ~/.openclaw/workspace
```

如果你在本地仓库中运行：

```bash
npm run doctor:workspace -- --workspace ~/.openclaw/workspace
```

## 迁移已有 daily log

如果你已经有 `memory/YYYY-MM-DD.md` 文件，执行：

```bash
npm run migrate:memory
```

迁移脚本只会重写那些它能安全识别为 Timeline 风格 daily log 的文件，会保留 `.bak` 备份，并跳过以自由文本为主的文件。

## 配置项

插件 manifest 当前暴露：

- `enableTrace`
- `traceLogPath`
- `canonicalMemoryRoot`
- `reasonerTimeoutMs`
- `reasonerSessionPrefix`
- `reasonerMessageLimit`
- `sessionHistoryLimit`
- `memorySearchMaxResults`

## 运维建议

- 把这个插件视为运行在 OpenClaw 进程内的 trusted code。
- 如果 timeline 数据对你重要，请给 canonical memory root 做版本化备份。
- 集成阶段建议保持 `enableTrace` 开启；只有在你已经有别的可观测手段时再关闭。
- 如果你想把 Timeline 数据和旧的自由格式日志隔离开，把 `canonicalMemoryRoot` 指向单独目录。

## 开发

```bash
npm run verify
npm run test:smoke
```

可选的真实体验测试：

```bash
npm run test:live-experience
```

## 发布

先在 `package.json` 里设置好 `name` 和 `version`，然后执行发布脚本：

```bash
npm run release -- --push
```

本地直接发布到 npm：

```bash
npm run release -- --publish --push
```

完整的本地维护者发布流程见 [docs/PUBLISHING.md](./docs/PUBLISHING.md)。

## 延伸阅读

- [README.md](./README.md)
- [docs/timeline-north-star.md](./docs/timeline-north-star.md)
- [docs/timeline-llm-runtime-boundary.md](./docs/timeline-llm-runtime-boundary.md)
- [docs/timeline-collector-reasoner-interface.md](./docs/timeline-collector-reasoner-interface.md)
- [docs/timeline-query-semantics.md](./docs/timeline-query-semantics.md)
- [docs/timeline-consumption-protocol.md](./docs/timeline-consumption-protocol.md)
