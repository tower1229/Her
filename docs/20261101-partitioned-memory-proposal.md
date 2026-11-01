# 改进提案：默认记忆语料内按事件分文件

状态：2026-11-01 提案，尚未由用户定案。替代共享单个日记的方案，保持 Markdown 权威源、默认召回和可重建时间索引。未修改生产实现。

## 布局与职责

```text
memory/
  2026-11-01.md                       # 宿主普通日记，Timeline 不自动改写
  timeline/
    observed/2026-11-01/evt-a.md       # 有证据的事件
    simulated/2026-11-01/evt-b.md      # 人格模拟事件
    simulated/2026-11-01/detail-c.md   # evt-b 的新增细节，含 parent_event_id
```

日期组织目录，文件名用事件或细节 ID，不以 YYYY-MM-DD 开头。来源类型同时体现在路径和每条可独立检索陈述内。普通日记不必转换成事件格式，不再向日记复制完整 Timeline 事件。

一个事件/细节只有一个 Markdown 权威文件，不做“数据库正文＋Markdown 投影”双写。SQLite 派生时间、父子关系和当前状态。后续模拟细节作为关联记录新增，不自动修改原文件；这记录的是新增经历细节，不是保存每次编辑的历史版本。用户直接编辑已有 Markdown 后重新校验和索引。旧笔记可以作为真实事件证据链接，原始证据与结构化事件可能有语义重叠，须保留来源身份去重，不能声称完全没有重复内容。

新事件采用唯一 ID、排他创建；后台新增文件不覆盖用户正在编辑的既有事件文件。临时内容应在宿主不索引的 staging 区完成，发布前校验；完整文件的无覆盖发布方式需要跨平台实现验证。显式修改同一事件和外部编辑器同时保存仍是冲突，不承诺任意编辑器任意时刻覆盖都能无损；避免自动重写已提交文件使此冲突不再是普通后台工作路径。

## 已执行验证

`scripts/probe-shared-memory.mjs` 使用安装的 OpenClaw 2026.10.9 发布代码：

- 实际调用 `listMemoryFiles(tempWorkspace)`，不传 extraPaths，返回普通日记与 `memory/timeline/simulated/2026-11-01/evt-safe.md`。证明默认语料发现覆盖该布局，不需要另一套搜索索引入口。
- 同时更新普通日记、创建新的关联细节文件，既有事件内人工编辑内容保留；再次用 `wx` 创建同名文件被 EEXIST 拒绝。
- 从真实实现原样提取 `isShortTermMemoryPath` 及依赖测试：普通日记返回 true，日期目录下 `evt-safe.md` 返回 false，而 `memory/timeline/2026-11-01-evt-safe.md` 返回 true。
- 源码确认 `collectDailyIngestionBatches` 扫描 memory 根目录日期文件；promotion 候选使用上述路径判断。因此当前版本此布局不进入这两条直接的按日日记提炼入口。
- 前一轮已实际调用分块函数：短、自包含来源陈述保留标签；长文本仅标题标来源会丢失标签。因此格式必须保持短陈述，路径也携带类型和 ID；片段不完整时回读原文。

以上是宿主文件发现、纯函数和隔离文件写入验证，不是 memory_search 全工具流程或真实 Gateway 压力测试。测试未读写用户记忆、未调用模型，临时目录自动清理。

## 召回与整理边界

Agent 仍使用默认 memory_search 检索整个 memory 语料，再用 memory_get 回读；精确时间查询使用 Timeline。插件不直接导入上述宿主私有文件，它们只用于核验当前实现。生产只依赖 Markdown 文件布局及公开工具。

路径判断属于固定版本实现行为，不是永久的“禁止提炼”公开协议。升级必须重跑；不能把此布局宣传成完整的来源隔离。对话中说出的模拟经历仍可能通过 session ingestion 再次进入记忆，普通 Agent 也可能主动总结文件。来源说明须进入模拟内容的上下文，并验证这些间接路径；若用户要求默认召回和所有后续整理都提供机器强制的来源保证，需要上游支持 event-level provenance 或接管 memory provider，不能用提示词假装强保证。

与方案比较：

| 方案 | 判断 |
| --- | --- |
| 各方共写单日日记 | 已有丢失反例，不推荐 |
| 同目录新增 YYYY-MM-DD-timeline.md | 能分开宿主写入，但长期追加仍与人工编辑争用，且仍参与按日提炼 |
| memory 下日期目录＋事件文件 | 推荐；复用默认语料和召回，按事件减少竞争，当前直接提炼路径可避开 |
| SQLite 权威源＋Markdown 副本 | 带来双写与人工编辑回流，不符合当前偏好 |
| 替换默认 memory provider | 可增加硬约束，但不再直接沿用默认 provider，维护面显著扩大 |

下一步验收应围绕实际 memory_search/get 的路径与来源显示、session ingestion 对模拟对话的处理、人工修改后时间索引失效机制。当前无需为普通后台记忆记录要求用户暂停编辑。

参考：[默认记忆引擎](https://docs.openclaw.ai/concepts/memory-builtin)、[记忆说明](https://docs.openclaw.ai/concepts/memory)、[固定版本 Dreaming](https://github.com/openclaw/openclaw/blob/v2026.10.9/docs/concepts/dreaming.md)。
