# Her：2026.10.9 适配实施与验收记录

基线：`feda99284ff7695d68dc283cb6f5295e8b3ccc91`。验收日期：2026-11-01。

目标保持每日 Markdown、可见字段、工具参数与结果消费协议、AGENTS/SOUL、人格补全和主动问候策略。没有引入第二份日志、数据库、后台提取或宿主补丁。变更保留在当前工作区供审查；原有调研文档未改写。

## 1. 无损提交与锁

- `daily-document.ts` 保留原文及位置，只插入新条目或替换目标 `Estimated_Duration` 数字；普通笔记、未知字段、自然语言、CRLF、BOM 均保留。按实际时间插入，不重新渲染旧条目。
- `commit-episode.ts` 作为 resolve/transition 共享提交边界，校验配置根目录，按固定路径次序加锁；写入及 transition 的半小时邻居检查在锁内重新读取。
- 同日“新增＋截断”一次替换；重试命中已存在事件时仍核验截断。跨日持有两把锁，但第二份文件失败仍按既有协议报告部分成功。
- 锁使用随机归属标记和文件身份核验，获取失败不会删除持有者的锁，业务回调 `EEXIST` 不再被误判为锁冲突。
- 临时文件位于目标目录，排他创建、同步后替换，提交前比较原文，清理仅限本次临时文件。

边界：外部编辑检测不是 OS 级 CAS，最终比较到替换之间仍有非协作写入竞争窗口；跨文件操作不是事务。没有新增崩溃后自动清除旧锁的策略。

## 2. 时间兼容

- setup 在原部署环境补齐 `legacyLogTimezone`，保留已有显式值；未固定时运行期使用宿主时区，doctor 提示。
- 新记录保留可见时间格式，以 `<!-- timeline:timestamp=... -->` 保存完整 offset。人工修改可见时间或元数据冲突时回到可见时间＋兼容时区解释并输出诊断。
- 旧日志不迁移。IANA 时区换算拒绝无效日期、DST gap/fold；offset 明确的时间按其实际 instant 处理。
- 当前状态、候选过滤、排序、截断使用统一换算；未来事件不能进入当前状态，负时间差不再因取整变成有效零分钟。
- 同时枚举当前时间和兼容时区覆盖的日志日期，覆盖更换宿主时区后的换日边界。

## 3. 宿主与模型适配

- 官方 SDK 固定为 `openclaw@2026.10.9` 开发依赖；生产入口、typed hooks、工具工厂接受官方类型检查，输出仍为 CommonJS 普通插件。
- 删除 `createPluginRuntime` fallback 和 typed hook 向 internal hook 的错误回退。保留调用期注入的 runtime。
- 四类模型调用统一执行器，保留各自 prompt/预算/语义降级，使用实际返回的 session key。`pending` 继续等待；总预算约束 run/wait/read/cleanup，超时不读旧结果、不将超时视作运行取消，也不改用 completion。
- 内部搜索状态与命中数组分开，区分 available/unavailable/denied/failed。未执行搜索不出现在来源列表；当前宿主下保留日记及合法会话读取降级。
- 问候预检由 `heartbeat_prompt_contribution` 承担；普通 prompt 不再通过关键词启动预检。pending 在状态锁内重新判断并领取。
- 发送回执需要 session、run、目标以及已知渠道/账户匹配；缺少关联信息不计成功。宿主 Agent Hook 的 `channel` 对应出站 Hook 的 `channelId`，`chatId/channelId` 对应会话目标。
- setup 保留显式禁用、现有 heartbeat 配置及自定义 session，移除 `skipWhenBusy`，写入真实 canonical root；doctor 检查权限、时区并报告内部搜索降级。

官方依据：[固定版 background-work 契约](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/plugins/sdk-runtime/background-work.md)、[固定版记忆契约](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/concepts/memory.md)，以及固定版本安装包的 SDK 声明和运行测试。固定版搜索配置位于 `memory.search`。

## 4. 验收结果

| 检查 | 结果 |
| --- | --- |
| TypeScript 类型检查、CommonJS 构建 | 通过 |
| Node 24.22.1，`TZ=UTC` | 42 suites / 240 tests 通过 |
| Node 24.22.1，`TZ=Asia/Shanghai` | 42 suites / 240 tests 通过 |
| 普通文字、未知字段、CRLF/BOM、排序、精准截断、重复 ID、幂等重试 | 通过 |
| 锁竞争及归属、回调异常、替换失败清理、外部修改拒绝、同日/跨日 transition | 通过 |
| 新旧时间混合、人工时间修改、跨时区换日、未来事件、非法日期、DST gap/fold | 通过 |
| runtime 缺失、实际 session key、pending、超时、错误 JSON、request ID 不符、清理失败 | 通过 |
| 搜索不可用/拒绝/失败后的既有来源降级 | 通过 |
| setup 保留显式权限/heartbeat/session/时区配置，doctor 报告禁用 | 通过 |
| OpenClaw 2026.10.9 加载真实 npm tarball、发现两个工具 | 通过 |
| 宿主真实 Hook 注册及显式禁用门控 | 通过 |
| 同一每日文件的普通笔记和 Timeline 条目被真实 `memory_search` 召回 | 通过，默认 builtin 引擎关键词模式 |
| 指定不存在的宿主路径 | 明确 exit 1，不跳过成功 |

单测仍有 2 个 opt-in 集成套件、5 个测试未执行，不计作兼容证明。独立 `test:smoke` 已实际运行；旧 Jest smoke 入口已收拢为调用同一个脚本，显式启用后缺少宿主也会失败。

固定宿主安装路径：`C:/Users/shixiong/AppData/Local/nvm/v24.22.1/node_modules/openclaw`。Node：`C:/Users/shixiong/AppData/Local/nvm/v24.22.1/node.exe`。

验收脚本优先使用 `OPENCLAW_PACKAGE_ROOT` 和 `OPENCLAW_NODE_BIN`。脚本打包并解压真实 npm tarball，使用临时 workspace/config/state；调用真实宿主加载器、工具解析器及 `memory-core` 的 `memory_search`，没有模拟搜索结果或直接查询 SQLite。`.mjs` 私有导出仅存在于此固定版本测试探针。完成断言和记忆资源关闭后退出隔离宿主进程并清理目录。

CI 固定 Node 24.22.1、双时区回归和强制 smoke；npm/ClawHub 发布检查也强制执行 smoke。Windows 沙箱禁止宿主创建依赖符号链接，因此本机真实宿主测试在沙箱外运行，状态仍完全隔离。

## 尚未验证的真实运行条件

- 已补充 DeepSeek 的真实 Gateway 四类模型调用、WebChat RPC、人格补全及 heartbeat 预检／生成／重复抑制，详情见 [真实运行验收](20261101-live-validation.md)。默认 Gemini 路由及真实超时后的宿主生命周期仍未覆盖。
- 真实渠道的 heartbeat → 模型回复 → 出站回执完整链路仍未完成；当前无外部渠道，实际验证到 `no-route`／`target-none` 不误记成功，包括每种渠道是否提供必要的 run/session/目标信息仍需验收。
- 配置 embedding provider 后的向量/混合召回。此次证明的是默认记忆工具共享文件及其真实关键词检索，不宣称向量质量已验证。
- 其他 OpenClaw 版本、其他 Node 版本；不提供兼容承诺。

这些条件没有使用 mock 或单测通过来替代真实验收。未读取真实用户记忆、未修改实际 OpenClaw 配置，也没有发送消息或发布包。

复现：先运行 `npm run verify`，再在 Node 24.22.1 下设置 `OPENCLAW_PACKAGE_ROOT` 后运行 `npm run test:smoke`。升级部署时在原部署环境运行 setup，再运行 doctor；自定义宿主配置可用 `OPENCLAW_CONFIG_PATH` 或 setup 的 `--openclaw-config` 指定。当前 setup/doctor 仍沿用 JSON 配置解析，遇到 JSON5 注释配置需按诊断人工核对，不会擅自改写。
