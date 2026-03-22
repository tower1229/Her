# timeline-skill 集成测试用例清单

> **用途**：覆盖 timeline-skill 从「设计契约」到「脚本实现」再到「OpenClaw 编排与下游消费」的全链路场景与边界，供版本迭代后自查与回归。  
> **关联**：[`timeline-skill-design.md`](./timeline-skill-design.md)、[`../SKILL.md`](../SKILL.md)、[`../references/gotchas.md`](../references/gotchas.md)  
> **说明**：本清单中的 **L1** 与部分 **L2** 可自动化；**L3/L4** 依赖真实 Agent 与工具环境，适合手工或半自动验收。

---

## 1. 设计目标摘要（验收口径）

以下条目摘自已定稿设计，**集成测试的「应/不应」均应对齐这些目标**：

| # | 目标 | 含义（验收要点） |
|---|------|------------------|
| D1 | **事实时间线层** | 在给定时间窗口内产出结构化 `TimelineWindow` / `Episode`，供 persona 等消费，不负责最终聊天润色。 |
| D2 | **非空输出** | Skill 被调用且需响应该日/该窗时，返回体须可读、非空；允许低信息密度状态（休息、独处、睡眠等），禁止空壳式「没有记忆」。 |
| D3 | **单写者（single writer）** | 仅 timeline-skill（经约定流程）向 `memory/YYYY-MM-DD.md` 做日记格式追加；persona / 生图等不得直接改该文件。 |
| D4 | **Append-Only / 不可变 canon** | 软指纹命中后 `read_only_hit`，不得覆盖或「补细节」改写已落盘段落。 |
| D5 | **读取优先级** | `sessions_history`（硬锚）→ `memory_get`（当日确定性）→ `memory_search`（语义补充）；**禁止**用 memory 否定会话硬事实。 |
| D6 | **日粒度与窗口** | `now_today` / `recent_3d` / `explicit` 按**自然日**拆分；`recent_3d` 为 `(now-3d, now]`，多日返回 `days: TimelineWindow[]` 升序。 |
| D7 | **幂等（运行态）** | 磁盘不落 `window_id`；重复询问同一时空槽应倾向命中软指纹而非重复写入。 |
| D8 | **解析与契约** | 磁盘段落 → `Episode` 映射遵循 Level A/B；timeline→persona 必填字段齐全（见 `references/json-schema.md`）。 |
| D9 | **Appearance 日内稳态** | 新 Episode 默认继承日锚外观，仅在脚本识别的换装信号下允许覆盖（实现见 `scripts/inherit-appearance.ts`）。 |
| D10 | **可观测性** | 成功生成写盘时追加 `memory/.timeline-run.log`（JSONL）；便于调试与 Heartbeat 相关策略迭代。 |

---

## 2. 测试分层定义

| 层级 | 名称 | 范围 | 典型手段 |
|------|------|------|----------|
| **L0** | 单元 | 单函数纯逻辑 | Jest（已有：`fingerprint`、`parse-memory`、`inherit-appearance`、`write-episode`） |
| **L1** | 脚本链集成 | 多模块串联：读 md → `parseMemoryFile` → `checkReadOnlyHit` → `resolveAppearance` → `mapToEpisode` | Node 测试夹具 + 临时文件 |
| **L2** | Skill 编排集成 | 模拟/桩替换 OpenClaw 工具：`sessions_history`、`memory_get`、`memory_search`、`write` 调用顺序与数据 | 合约测试、录制回放、沙箱 workspace |
| **L3** | Agent E2E | 真实 OpenClaw Agent + 工作区文件 | 手工场景脚本 + 日志/磁盘断言 |
| **L4** | 生态联调 | timeline → persona → stella-selfie（或 Zhuang-Yan 文档约定） | 端到端用户意图（自拍、闲聊） |

**回归策略建议**：每次发版至少跑 **L0 全量 + L1 抽样扩展**；里程碑跑 **L2**；发 clawhub/大版本前跑 **L3/L4** 核心子集。

---

## 3. 环境与前置条件

| 项 | 要求 |
|----|------|
| 工作区 | 存在 `~/.openclaw/workspace/`（或测试用临时目录），含 `MEMORY.md`、`SOUL.md`（按部署约定） |
| 记忆目录 | `memory/` 可写；测试后清理或隔离 `memory/YYYY-MM-DD.md` 与 `memory/.timeline-run.log` |
| 时间 | 可固定 **anchor.now** 与 **userTimezone**（L2 注入 mock；L3 记录实际时区便于解释窗口边界） |
| Node | `node` 可用；`npm test` 可执行 Her 仓库脚本测试 |

---

## 4. 用例清单（按域）

### 使用方式

- **ID**：稳定标识，便于在 PR/CHANGELOG 引用。  
- **步骤**：高层可执行步骤；实现时可映射为自动化或检查表。  
- **期望**：必须通过；若与实现暂不一致，应记为 **已知差距** 并单独立项。  
- **关联**：设计章节 / Gotcha / 脚本文件。

---

### 4.1 触发与时间窗口（D6）

| ID | 场景 | 前置 | 步骤 | 期望 | 层级 |
|----|------|------|------|------|------|
| TW-01 | `now_today` 窗口边界 | 固定 `anchor.now` 为某日 14:30（含 TZ） | 解析 preset；计算 `window.start`（当日 00:00 本地）、`window.end`（anchor.now） | JSON 中 `window.preset === "now_today"`，起止与 TZ 一致 | L2/L3 |
| TW-02 | `recent_3d` 三日拆分 | 同上 anchor | 解析 `recent_3d` | 得到 **最多 3 个日历日**，每日独立 `calendar_date`，**不合并**为单一窗口 | L2/L3 |
| TW-03 | `recent_3d` 开闭区间 | now = D0 日终 | 确认区间 `(now-3d, now]` | **不含**正好 3 天前 0 点整的「左端点」一侧若设计为开区间；**含**当前时刻 | L2（需与设计 `window-semantics.md` 一致） |
| TW-04 | `explicit` 跨日 | 用户指定「上周五 22:00 到周六 02:00」 | 拆成两个自然日分别处理 | 返回 `days` 长度 ≥ 2 或等价结构；每日独立 `resolution` | L2/L3 |
| TW-05 | 多时区夏令时边界 | `userTimezone` 为存在 DST 的区域 | 在切换日前后各测一次 `now_today` | 窗口仍按**本地日历日**理解，无异常偏移；记录已知平台限制 | L3 |
| TW-06 | 意图识别 | 用户仅闲聊无时间指向 | Agent 不应错误触发 timeline 或应明确不请求事实窗 | 行为符合 `SKILL.md` 触发条件（避免过度调用） | L3 |

---

### 4.2 数据源优先级与硬锚（D5，G1，G4）

| ID | 场景 | 前置 | 步骤 | 期望 | 关联 |
|----|------|------|------|------|------|
| SRC-01 | 工具调用顺序 | Mock 工具 | 执行一次完整 timeline 流程 | **先** `sessions_history`，**再** `memory_get`（当日），**再**按需 `memory_search` | 设计 §2.3 |
| SRC-02 | 会话与磁盘冲突 | `sessions_history` 写「昨日在健身房」；`memory` 写「昨日在家」 | 生成该日叙事 | **以会话为准**；不得用 `memory_search` 否定会话 | G1 |
| SRC-03 | memory_search 仅补充 | `memory_get` 已有软指纹命中段落 | 仍可调 `memory_search` | 检索结果**不参与** `read_only_hit` 判定 | G4 |
| SRC-04 | 仅有 memory 无会话 | 会话无相关条目 | 依赖 `memory_get` + 推理白名单（MEMORY/SOUL） | 输出非空且 `provenance.confidence` 反映不确定度 | 设计 §11 |
| SRC-05 | 白名单推理边界 | `sessions_history` 明确否定某活动 | 模型想从 SOUL 推断该活动 | **不得**与硬锚冲突；低置信或省略该活动 | G1、G6 |

---

### 4.3 软指纹与幂等（D4，D7，G3）

| ID | 场景 | 前置 | 步骤 | 期望 | 层级 |
|----|------|------|------|------|------|
| FP-01 | 同桶命中 | 磁盘已有 14:35 段落；新请求 14:50，同 normalize 后 location/action | `checkReadOnlyHit` | `hit === true`，`resolution.mode === read_only_hit`，**无新 append** | L0/L1 |
| FP-02 | 跨 30 分钟桶未命中 | 14:20 与 15:10 | 指纹比较 | `hit === false`，允许 `generated_new`（若业务决定写入） | L0 |
| FP-03 | 标点与空白归一 | `读 书` vs `读书`，location 多空格 | 指纹 | 与设计一致：`normalize` 去标点与空白类字符后命中 | L0 |
| FP-04 | 同日不同活动 | location/action 不同 | 指纹 | 不命中；可各有一条 canon | L1 |
| FP-05 | 重复用户提问 | 连续两次「你在干嘛」同一会话 | 第二次 | **不覆盖**第一段；命中只读或等价返回 | L2/L3 |
| FP-06 | 无效时间戳回退 | timestamp 无法解析为 Date | `toTimeBucket` | 行为符合实现（如 `unknown_time`）；**记录是否与产品预期一致** | L0 |
| FP-07 | 指纹与 episode 顺序 | 同一桶内两条相似段落（异常数据） | `checkReadOnlyHit` 遍历顺序 | **明确**：先匹配到谁即谁；数据层应避免重复桶 | L1 |

---

### 4.4 解析与 Disk→Episode（D8）

| ID | 场景 | 输入 md | 步骤 | 期望 | 关联 |
|----|------|---------|------|------|------|
| PAR-01 | Level A 完整字段 | `examples/episode-sample.md` 风格 | `parseMemoryFile` | `parseLevel === 'A'`，`confidence === 1.0`，字段齐全 | L0 |
| PAR-02 | 缺 Appearance | 仅有 Timestamp/Location/Action | 解析 | `appearance === 'unknown'`，`parseLevel === 'B'`，`confidence <= 0.6` | L0 |
| PAR-03 | 缺 Emotion_Tags | 无情绪行 | 解析 | 默认 `neutral`，confidence 降级（与实现一致，当前为与 appearance 缺失叠加取 min） | L0 |
| PAR-04 | 无 Timestamp | 有 `###` 但无 Timestamp 行 | 解析 | **跳过**该段，`episodes` 不含此段（设计：缺 Timestamp 不映射） | L0 |
| PAR-05 | 列表项前缀 | `- Timestamp:` 与 `* Timestamp:` | 解析 | 宽松匹配均可提取 | L1 |
| PAR-06 | 自然语言 summary | 段落后有自由文本 | `mapToEpisode` | `narrative.summary` 使用自然文本或 `action+location` 回退 | L1 |
| PAR-07 | `temporal.end` | 有效 ISO 起始时间 | `mapToEpisode` | `end === start + 1h`（保留时区后缀行为与实现一致） | L0 |
| PAR-08 | `time_of_day` | 0–5 / 6–11 / 12–17 / 18–23 | `mapTimeOfDay` | night / morning / afternoon / evening；非法返回 `unknown` | L0 |
| PAR-09 | `location_kind` 关键词 | home/cafe/work/transit/outdoor/中文触发词 | `mapLocationKind` | 与设计表一致；未匹配为 `other` | L0 |

---

### 4.5 Appearance 继承与换装（D9，G5）

| ID | 场景 | 当日已有 episodes | 新 action | 期望 | 关联 |
|----|------|-------------------|-----------|------|------|
| APP-01 | 纯继承 | 早 8 点 pajamas | reading | 继承 pajamas，`overridden === false` | L0 |
| APP-02 | 运动信号 | 任意锚点 | 含 `gym` / `健身` 等 | `defaultInference` 采纳，`overridden === true` | `OUTFIT_CHANGE_SIGNALS` |
| APP-03 | 正式场合 | 锚点居家服 | `晚宴` / `面试` | 覆盖 | L0 |
| APP-04 | 起床/沐浴/睡眠/购物/居家 | 各选一例关键词 | 覆盖 | reason 含对应关键词 | L0 |
| APP-05 | 首条即无锚 | 空数组或仅 `unknown` appearance | 任意 | 使用 `defaultInference`，`overridden === true`（与设计「unknown 不继承」一致） | 设计 §5.5 |
| APP-06 | **顺序 vs 时间最早** | 数组顺序与 timestamp 顺序不一致 | `resolveAppearance` | **自查**：设计要求「时间最早」；若实现为「数组首次非 unknown」，应记 **差距单** | L1 |
| APP-07 | 大小写 | `GYM` / `Gym` | 匹配 | 不区分大小写 | L0 |

---

### 4.6 写盘与格式（D3，Append-Only）

| ID | 场景 | 步骤 | 期望 | 层级 |
|----|------|------|------|------|
| WRT-01 | 当日文件不存在 | `writeEpisode` 到新路径 | 自动创建目录与文件；内容含必填键值行 | L0 |
| WRT-02 | 当日文件已存在 | 再次 append | 仅追加新 `###` 段，**不**重写全文 | L0 |
| WRT-03 | 必填校验 | 缺 location / 空 emotionTags | `writeEpisode` | `success === false`，错误信息明确 | L0 |
| WRT-04 | 非法 timestamp | 非解析日期 | 拒绝写入 | L0 |
| WRT-05 | 标题行截断 | 任意长度 `action` | 标题 `action.substring(0,15)...` | 与实现一致；超长无崩溃 | L0 |
| WRT-06 | 可选字段 | 无 `Internal_Monologue` / `naturalText` | 写入 | 仍可成功；md 结构有效 | L0 |
| WRT-07 | 人工改磁盘 | 命中软指纹后用户手工改 md | 再次请求 | **仍应只读返回旧 canon**（若与实现冲突则属 bug）— 与设计「不可变」对齐时以产品决策为准 | L3 |

---

### 4.7 `world_hooks` 与节假日

| ID | 场景 | 日期 | 期望 |
|----|------|------|------|
| WH-01 | 工作日 | 2026-03-23（周一） | `weekday === true`（以本地星期为准） |
| WH-02 | 周末 | 2026-03-22（周日） | `weekday === false` |
| WH-03 | 中国节假日 | `2026-02-17` + `getHoliday(..., 'CN')` | 非 null 中文节日英文名 |
| WH-04 | 美国节假日 | 同日期 US | 与 `holidays.ts` 静态表一致 |
| WH-05 | 表外年份 | 2030 | `holiday_key === null`，不抛错 |

---

### 4.8 Run log（D10）

| ID | 场景 | 期望 |
|----|------|------|
| LOG-01 | `writeEpisode` 成功 | `memory/.timeline-run.log` 新增一行 JSON，`mode` 为 `generated_new`，`episodes_written === 1` |
| LOG-02 | 字段完整性 | 行内含 `ts`、`date`、`window`、`confidence` |
| LOG-03 | `read_only_hit` | 若流程仅命中只读，应有对应日志策略（**若当前未实现，记为待办**） | 
| LOG-04 | 损坏行 | 手工破坏一行 JSONL | `readRecentLogs` 跳过坏行不崩溃 | L0/L1 |

---

### 4.9 JSON 契约与下游 persona（D8）

| ID | 场景 | 期望 |
|----|------|------|
| SCH-01 | 单日返回 | 含 `schema_version`、`document_type`、`anchor`、`window`、`resolution`、`episodes` |
| SCH-02 | 多日返回 | 顶层为 `days: TimelineWindow[]`，日历日升序 |
| SCH-03 | persona MUST 字段 | 每条 episode：`temporal.start`、`scene.location_label`、`scene.activity`、`scene.time_of_day`、`emotion.primary`、`appearance.outfit_style`、`provenance.confidence` |
| SCH-04 | `episodes.length >= 1` | 任意有效响应 | 至少一条可消费 episode（与「非空」一致） |
| SCH-05 | `schema_version` 主版本 | 消费方收到 `2.x` | persona/下游按约定拒绝或降级（契约测试） | L4 |

---

### 4.10 输出非空与置信度（D2，G6）

| ID | 场景 | 步骤 | 期望 |
|----|------|------|------|
| EMP-01 | 无记忆无会话 | 仍触发 timeline | 返回独处/休息/睡眠等**合理非空**状态，非「没有记录」 |
| EMP-02 | 低证据推理 | 仅 SOUL 推断 | `confidence` 偏低，描述保守 |
| EMP-03 | 禁止「为满而编」 | 审查日志与 md | 不得因非空原则把高置信写满虚构事件 | 人工 L3 |
| EMP-04 | 夜间睡眠 | 凌晨 3 点问在干嘛 | 允许「睡觉」类叙述 + 合理 scene | L3 |

---

### 4.11 Heartbeat 与二次路径（设计 §2.5、§5.6）

| ID | 场景 | 期望 |
|----|------|------|
| HB-01 | 本轮已 `write` | 同 Heartbeat 内再次巡检 | 软指纹命中，不重复追加 |
| HB-02 | 本轮仅 Context 未写盘 | Heartbeat 触发补写 | 由 timeline 执行写盘；**非** persona 直写 |
| HB-03 | run log 近时写入 | 可选优化路径 | 若实现「读 log 短路」，行为可预测且不跳过必要校验 |

---

### 4.12 跨 Skill 集成（L4）

| ID | 场景 | 步骤 | 期望 |
|----|------|------|------|
| ECO-01 | 闲聊「你在干嘛」 | 用户中文问句 | timeline → 事实进上下文 → 回复不暴露工具措辞 |
| ECO-02 | 无场景自拍 | Stella + Persona + Timeline 齐全 | 编排：timeline 事实 → persona JSON → 生图参数含场景一致性 |
| ECO-03 | 缺 timeline skill | 卸载或不可用 | Stella 等按各自 SKILL 降级，**不**随意编造 location/activity |
| ECO-04 | persona 不写 memory | 任意 | 磁盘日记仅 timeline 路径写入 |

---

### 4.13 安全、隐私与运维（非功能）

| ID | 场景 | 期望 |
|----|------|------|
| OPS-01 | 大 `memory/YYYY-MM-DD.md` | 单日数百段 | `memory_get` + 解析在可接受时间内；或需分页策略（迭代项） |
| OPS-02 | 路径穿越 | `filePath` 恶意 | `writeEpisode` 仅允许 workspace 内目标（若在封装层实现） |
| OPS-03 | 敏感会话 | `sessions_history` 含隐私 | 落盘 md 遵循用户/产品 redaction 策略（若适用） |

---

## 5. 已知实现与设计对照（自查时重点核对）

执行 L1 时建议逐项核对：

| 点 | 设计文档 | 当前实现提示 |
|----|----------|----------------|
| 软指纹时间桶 | 30 分钟 | `scripts/fingerprint.ts` `toTimeBucket` |
| 解析分段 | `### [` 分段 | `parse-memory.ts` split |
| Timestamp 磁盘格式 | 设计示例多类 | `write-episode` 写出 `YYYY-MM-DD HH:mm:ss`；`mapToEpisode` 对 ISO 与空格格式依赖 `Date` 解析 |
| Appearance 日锚 | 「时间最早」 | `resolveAppearance` 按**数组迭代**取首个非 `unknown`，与「时间最早」可能不一致 → **建议增加 PAR/APP 对照用例** |
| `read_only_hit` 写 log | 设计 §15.4 | `write-episode` 仅 `generated_new` 写 log；只读路径需 orchestration 补记（若有） |

---

## 6. 追溯矩阵（节选）

| 用例域 | 设计文档章节 | Gotchas |
|--------|----------------|---------|
| 4.1 时间窗口 | §6、`window-semantics.md` | — |
| 4.2 数据源 | §2.3、§3、§11 | G1、G4 |
| 4.3 软指纹 | §5.3、§6 幂等 | G3 |
| 4.4 解析 | §5.4、§8.3 | — |
| 4.5 Appearance | §5.5 | G5 |
| 4.6 写盘 | §5.1–5.2 | G2、G3 |
| 4.10 非空 | §3、`SKILL.md` | G6 |

---

## 7. 迭代记录

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-03-22 | v1 | 初版：对齐 `timeline-skill-design.md` v1 与 Her 仓库 `scripts/` 实现 |

---

**文档维护**：契约或 `scripts/` 行为变更时，请同步更新 §5 对照表与相关用例期望，并在 §7 追加一行版本记录。
