# OpenClaw Timeline Plugin v2（中文版）

[English README](./README.md)

这是一个面向 OpenClaw 的 v2 时间线插件运行时：它把时间相关事实解析从
prompt-only 行为迁移到代码里的 canonical `timeline_resolve` 工具，并提供
hooks、append-only 写入、trace 日志与内置 skill 路由。

本仓库遵循 OpenClaw 的原生插件形态：

- `openclaw.plugin.json` 提供插件发现与配置校验元数据；
- `index.ts` 导出运行时插件入口，并注册 tools / hooks；
- `package.json` 通过 `openclaw.extensions` 暴露运行时入口。

## 仓库内容

- `openclaw.plugin.json` —— v2 时间线插件的 draft manifest
- `index.ts` —— 插件入口注册逻辑
- `skills/timeline/` —— 时间意图路由用的 bundled skill
- `src/tools/` —— canonical 工具入口（`timeline_resolve`、`timeline_status`、`timeline_repair`）
- `src/core/` —— 确定性的时间线运行时主流程
- `src/hooks/` —— 生命周期 hook（flush / snapshot / audit）
- `src/storage/` —— canonical 写路径加固与 trace / run log 存储
- `src/lib/` —— 解析、指纹、继承、节假日、时间等共享辅助模块
- `docs/` —— v2 架构、接口、重构计划、状态与发布检查清单

## 当前状态

仓库当前只保留 v2 方向相关内容。
旧版 v1 prompt 时代的模板、参考文档和根目录 skill 文件已经移除，
以便仓库结构直接反映 plugin-first 的实现方向。

建议优先阅读：

- `docs/timeline-v2-refactor-plan.md`
- `docs/timeline-v2-status.md`
- `docs/timeline-v2-release-checklist.md`
- `docs/timeline-resolve-interface.md`

## 开发

```bash
npm install
npm run build
npm test
```
