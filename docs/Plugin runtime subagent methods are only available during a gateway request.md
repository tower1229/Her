结论基本坐实了：你的判断是对的，根因在 OpenClaw 宿主的 runtime 注入机制，不在 `timeline_resolve` 本身。

OpenClaw 默认会给插件一个 “不可用 subagent runtime” 占位，直接抛 `Plugin runtime subagent methods are only available during a gateway request.`，定义就在 [/home/shixiong/.npm-global/lib/node_modules/openclaw/dist/runtime-DQb3-ECx.js#L921](/home/shixiong/.npm-global/lib/node_modules/openclaw/dist/runtime-DQb3-ECx.js#L921)。只有走了 `createPluginRuntime({ allowGatewaySubagentBinding: true })` 这条路，它才会 late-bind 到进程级 gateway subagent 单例；gateway 启动时也确实这么做了，见 [/home/shixiong/.npm-global/lib/node_modules/openclaw/dist/gateway-cli-Dsd9gHBa.js#L34412](/home/shixiong/.npm-global/lib/node_modules/openclaw/dist/gateway-cli-Dsd9gHBa.js#L34412)。而 agent 工具解析侧本来也打算把这个开关传下去，见 [/home/shixiong/.npm-global/lib/node_modules/openclaw/dist/pi-embedded-CbCYZxIb.js#L70708](/home/shixiong/.npm-global/lib/node_modules/openclaw/dist/pi-embedded-CbCYZxIb.js#L70708)。所以更像是 Telegram Channel 这条链路上，某次插件 registry/runtime 被“默认 runtime”缓存或复用了，导致 `pluginApi.runtime.subagent` 还是那个空壳。

我已经在插件侧做了一个防御性修复：当注入进来的 `pluginApi.runtime.subagent` 抛这个 unavailable 错误时，插件会自动改为从 `openclaw/plugin-sdk/runtime` 重新拿一个 `allowGatewaySubagentBinding: true` 的 late-bound runtime，再继续跑 planner/reasoner，以及 `sessionsHistory`/`conversationContext` 的 transcript 读取。实现见 [openclaw_timeline_runtime.ts#L86](/mnt/c/Workspace/tower1229/Her/src/runtime/openclaw_timeline_runtime.ts#L86) 和 [openclaw_timeline_runtime.ts#L822](/mnt/c/Workspace/tower1229/Her/src/runtime/openclaw_timeline_runtime.ts#L822)。我也补了回归测试，专门覆盖“注入 runtime 是 unavailable，但 gateway 全局 runtime 可用”的 Telegram/Channel 场景，见 [openclaw_timeline_runtime.test.ts#L498](/mnt/c/Workspace/tower1229/Her/src/runtime/openclaw_timeline_runtime.test.ts#L498)。

验证已经跑过：`TMPDIR=/tmp TEMP=/tmp TMP=/tmp npm run verify` 通过，结果是 15 个 suite 通过、2 个 skipped、56 个测试通过。现有的 `package.json` 还有一处工作区里的未提交修改，我没动它。

如果后面要从 OpenClaw 上游彻底修，方向建议就两条：

1. 保证所有 Channel 触发的 agent/plugin tool 执行都强制使用 `allowGatewaySubagentBinding: true`。
2. 不要把带“默认 subagent 占位”的 plugin runtime 长期缓存进 active registry；即使 registry 复用，`pluginApi.runtime.subagent` 也应按请求时 late-bind。
