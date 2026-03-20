# timeline-skill — 设计备忘

> 状态：已定稿（v1 范围）+ 待议项单列  
> 关联：[about-timeline-skill.md](./about-timeline-skill.md)（早期 Q&A）  
> 相关项目：Zhuang-Yan（`persona`）、Stella（`stella-selfie`）

---

## 1. 定位与术语

- **timeline-skill**：OpenClaw 工作区内的 Skill，负责在**给定目标时间段**内，从磁盘与工具**内部收集**人设与记忆上下文，产出**非空的、结构化的时间线状态**，并在**首次**需要时向 OpenClaw 记忆系统**追加** canon 经历（见 §5、§6）。
- 与早期讨论中的「Timeline-Weaver」等别名统一为 **timeline-skill**。

---

## 2. OpenClaw 记忆系统的底层机制（技术基础）

OpenClaw 的记忆系统没有隐藏的数据库 API，**一切皆 Markdown 物理文件**，模型只"记住"被写入磁盘的内容。

### 2.1 两层记忆文件

| 文件 | 用途 | 加载时机 |
|------|------|----------|
| `MEMORY.md` | 长期核心记忆：人格设定、用户偏好、确定事实 | **每次私密 Session 启动时强制注入** Context |
| `memory/YYYY-MM-DD.md` | 短期日常记忆：按天追加的日志 | 每次 Session 启动时自动读取**今天 + 昨天** |

两类文件均位于 `~/.openclaw/workspace/`。

### 2.2 写入机制

- **工具**：使用系统原生的 **File Write Tool**（`group:fs` 中的 `write` 工具），以 **Append-Only** 方式写入对应的 `memory/YYYY-MM-DD.md`。
- **无需外部 API**：不需要调用任何复杂接口，直接追加 Markdown 文本即可。
- **向量索引自动更新**：OpenClaw 后台守护进程监听 `memory/` 目录，文件保存后约 **1500ms 防抖延迟**后，自动将变更切片（约 400 tokens/片）并更新到本地 SQLite 向量索引（`~/.openclaw/memory/{agentId}.sqlite`）。

### 2.3 读取机制与工具分工

OpenClaw 提供两种读取工具，在本系统中职责严格分离：

| 工具 | 特性 | 本系统用途 |
|------|------|-----------|
| **`sessions_history`** | 会话历史原文，硬事实 | 读取目标窗口的真实聊天记录，作为**最高优先级硬锚** |
| **`memory_get`** | 精准读取指定文件/行范围，确定性 | 读取当日 `memory/YYYY-MM-DD.md` 全文，供脚本做软指纹匹配（只读判定） |
| **`memory_search`** | 语义检索（BM25 + 向量混合），模糊召回 | 查找目标时段附近的长期相关记忆，作为补充上下文 |

**自定义脚本（Node/TypeScript）的职责**：
- 解析磁盘 Markdown 段落，提取结构化字段（`Timestamp`、`Location`、`Action` 等）
- 计算软指纹，判断是否已有 canon（见 §5.3）
- 将磁盘格式映射为 `Episode` schema（见 §8.3）
- 格式化写盘（追加新段落）

**读取优先级（已定）**：
1. `sessions_history`（硬锚，必须读取）
2. `memory_get`（当日确定性状态）
3. `memory_search`（语义补充）

**不应用脚本替代的场景**：跨日历史回顾、开放式语义问题（如"上周对某话题怎么看"）——这类场景交给 `memory_search` + LLM 推理。

### 2.4 「当下」的记忆载体

「当下」（尚未存档的当前状态）存在于**当前 LLM 的 Context Window** 中，物理载体是 Session 的 JSONL 文件（`~/.openclaw/agents/<agentId>/sessions/<sessionId>.jsonl`）。

- timeline-skill 生成「此刻状态」后，只需将结果**注入当前 Session 的对话流**（作为 assistant 消息或 system event），persona-skill 和 stella-selfie 即可从 Context 中直接读取，无需再查磁盘。

### 2.5 Pre-compaction Memory Flush（重要钩子）

当 Session Context 接近上限时，OpenClaw 会触发一个**静默的智能体轮次**（Silent Agentic Turn），提醒模型将当前重要状态写入磁盘。

- **对 timeline-skill 的含义**：timeline-skill 是**唯一写盘责任方（single writer）**。当天生成的状态若尚未落盘，必须在此钩子中补写 `memory/YYYY-MM-DD.md`。
- **对 persona-skill 的含义**：persona 不直接写盘；仅在 flush 轮次中提示/触发 timeline-skill 执行补写。
- **配置项**：`agents.defaults.compaction.memoryFlush`（默认启用），workspace 必须可写（`workspaceAccess: "rw"`）。

---

## 3. 对外契约（已定）

| 项 | 约定 |
|----|------|
| **显式输入** | 仅 **目标时间段**（可由自然语言在 skill 内部解析为具体窗口；调用方不必传入人设/记忆路径）。 |
| **内部收集** | `SOUL.md`、`MEMORY.md`、`memory/YYYY-MM-DD.md`（via `memory_get`）、必要时 `memory_search`，以及 OpenClaw 注入 Context 的**当前时间（含 timezone）**，均在 skill 内部完成。 |
| **「当下」** | 以 OpenClaw 注入 Context 的**系统当前时间**为锚（`agents.defaults.userTimezone` 配置），与现实世界时间线一致；窗口语义见 §4。 |
| **「最近」默认窗** | **3 天**：`(now - 3d, now]`（边界按 timezone 换算后写死）。 |
| **日粒度** | **每天独立**：每个日历日有独立的 timeline 窗口与持久化策略，不跨日合并为单一幂等键。 |
| **空白与触发** | **仅在被触发回忆时补空白**；未触发的时间段**允许没有** episode 记录（磁盘上可无该段叙事）。 |
| **同段多次询问** | **只读已有 canon，禁止覆盖**；「对已有记忆补细节」暂不实现。 |
| **输出非空** | **不存在「空窗无输出」**：一旦本 skill 被调用并需返回该日/该窗的可叙述状态，必须给出可读的结构化结果。允许的内容包括：独处、无聊、无所事事（随 MBTI / `SOUL` 对独处的偏好表述）；夜间睡眠时段可表述为「在睡觉」等。**不返回**「没有记忆」类空壳。 |
| **编排** | Skill 间无原生 RPC；顺序依赖 **SOUL.md** 与各 **SKILL.md** 约定 + 模型执行质量。 |
| **硬锚原则** | 真实聊天记录优先级最高，必须读取 `sessions_history` 作为事实锚点；memory 文件与语义检索为补充。 |
| **实现形态** | Skill 可包含仅供本 skill 使用的脚本（如确定性 window 判断、只读检测、格式化写盘）；**不将「任意脚本能力」作为对终端用户暴露的产品能力**。 |
| **容错** | v1 **先跑通主路径**；降级与冲突处理可后记入迭代（本备忘 §9）。 |

---

## 4. 与 persona / stella-selfie 的边界（已定）

| Skill | 职责 | 主要操作 |
|--------|------|----------|
| **timeline-skill** | **事实时间线**：解析窗口 → 读/写记忆 → 输出该窗口的 Episode 级叙事 + `state_snapshot`（见 §7）。不负责最终聊天措辞的润色。 | **写** `memory/YYYY-MM-DD.md`；**读** `SOUL.md`、`MEMORY.md`、`memory_get`、`memory_search` |
| **persona-skill** | **人格与表达**：在 timeline 给出的**事实状态**之上，结合 MBTI、`SOUL`、`USER.md`，生成语气、态度及面向 Stella 等消费方的结构化呈现。**不再承担「独自推断此刻身在何处、在做什么」作为事实源。** | **读** timeline 输出、`memory_search`；flush 时仅触发 timeline 补写 |
| **stella-selfie** | **多模态渲染**：消费 persona 输出的结构化 JSON → 生图；无「什么是真发生过」的定义权。 | 从当前 Context 读取 persona 输出 |

**推荐调用链（需在 SOUL / SKILL 中写明）**：需要「当下/某段经历」时 → **timeline-skill** → **persona-skill** → （可选）**stella-selfie**。

**「当下」的快速路径**：当 timeline-skill 生成「此刻状态」后，结果注入当前 Context，persona-skill 和 stella-selfie 直接从 Context 读取，无需再查磁盘。

---

## 5. 写入策略（v1）

### 5.1 磁盘记忆格式（Memory Entry Format）

记忆文件 `memory/YYYY-MM-DD.md` 是**人类与 agent 共同维护的日记流**，不区分来源。每条记忆是一个**独立的扁平段落**，以三级标题开头，键值列表承载结构化字段。

**格式模板（SOUL 中约定，见 §13）：**

```markdown
### [HH:MM:SS] {Short Event Title}

- Timestamp: YYYY-MM-DD HH:MM:SS
- Location: {short location phrase}
- Action: {one-sentence description of what you are doing}
- Emotion_Tags: [tag1, tag2]
- Appearance: {outfit or visible state in short phrase}
- Internal_Monologue: {one short sentence of inner thought}

{Optional: 1-2 sentences of natural language for human readability.}
```

**字段说明（v1 最小集）：**

| 字段 | 必须 | 说明 |
|------|------|------|
| `Timestamp` | 是 | ISO 格式，含日期与时间，时区由 SOUL 约定 |
| `Location` | 是 | 短词组，如 `home study desk`、`a sunny cafe` |
| `Action` | 是 | 一句话，描述当前正在做什么 |
| `Emotion_Tags` | 是 | 逗号分隔的情绪词列表，如 `[relaxed, focused]` |
| `Appearance` | 是 | 服装/外观关键词，如 `casual home clothes`、`light makeup` |
| `Internal_Monologue` | 建议 | 一句内心独白，增强人格一致性与 `memory_search` 语义质量 |
| 自然语言段落 | 可选 | 供人类阅读，不参与脚本解析 |

**设计原则：**
- 字段扁平，不嵌套，不引入 agent 难以理解的特殊标识
- 样式细节（粗体、空行等）不强制，脚本用"键名 + 冒号"宽松匹配
- timeline-skill 写入的段落与 agent 自然写入的段落格式相同，不设分区隔离
- 幂等判定、去重等逻辑由 skill 内部脚本处理，不污染磁盘格式

### 5.2 写入方式

- 使用 **`write` 工具（Append 模式）**，只追加新段落，**不重写整个文件**。
- 若当日文件不存在，直接创建并追加第一条段落（无需写分区头）。
- **不修改已有段落**（immutable 约束）。

### 5.3 只读判定（软指纹方案）

由于磁盘格式不含 `window_id` 等特殊标识，只读判定由脚本层通过**软指纹**实现：

**软指纹计算：**
```
fingerprint = normalize(date) + normalize(location) + normalize(action) + time_bucket
```
- `time_bucket`：将时间戳向下取整到 30 分钟槽（如 `14:00`、`14:30`），允许小幅时间偏差
- `normalize`：小写 + 去标点 + 去多余空格

**判定流程：**
1. 用 `memory_get` 读取目标日 `memory/YYYY-MM-DD.md` 全文
2. 脚本解析所有段落，提取 `Timestamp`、`Location`、`Action`，计算各段落指纹
3. **命中** → `resolution.mode = read_only_hit`，从已有段落映射为 Episode 返回，**不写入**
4. **未命中** → `resolution.mode = generated_new`，生成新段落并追加写入

`memory_search` **仅用于**查找目标时段附近的真实交互记录作为生成约束，不参与只读判定。

### 5.4 宽容解析（Level A / Level B）

脚本解析时按两级处理，兼容 agent 自然写入的非严格格式：

- **Level A（结构化命中）**：段落中 `Timestamp`、`Location`、`Action`、`Emotion_Tags`、`Appearance` 均可提取 → 走完整映射
- **Level B（降级）**：字段不完整时，提取最小三元组（`time`/`location`/`action`）；缺 `Appearance` 时置为 `unknown`，`confidence` 降低

### 5.5 与 Pre-compaction Flush 的协作

- 当天生成的段落在注入 Context 后，**应同步写盘**（不等 flush 触发），避免 compaction 后遗失。
- flush 轮次由 persona/系统提示触发，但**实际写盘动作只允许 timeline-skill 执行**。
- timeline-skill 在 flush 轮次中再次运行软指纹判定，避免重复写入。

---

## 6. 时间窗口语义（已定）

- **Timezone**：使用 OpenClaw 注入 Context 的当前时间（`agents.defaults.userTimezone`），不在 skill 脚本层二次计算。
- **`now_today`（当下）**
  - 当日从**本地日历日 00:00** 至 **`anchor.now`（Context 中的当前时间）**。
  - 若调用意图是「此刻在干嘛」，返回的叙述应对齐该窗口内**已存在或本次新生成**的 canon，且须符合 §3「输出非空」。
- **`recent_3d`（最近）**
  - **`(now - 3d, now]`**，按日拆成**最多 3 个独立日历日**；每日分别检索/生成，**不合并**为一个跨日幂等键。
- **`explicit`**
  - 用户或解析器给出明确起止；仍按**涉及的自然日**拆成逐日处理。

**幂等键规则（运行态）**：
- 磁盘不落 `window_id` 等特殊标识。
- 运行态可维护 `idempotency_key = hash(calendar_date + normalized(location) + normalized(action) + time_bucket)`，仅用于本轮计算与日志，不作为磁盘协议字段。

---

## 7. 解析模式 `resolution.mode`（已定）

| `resolution.mode` | 含义 |
|-------------------|------|
| `read_only_hit` | 该日已有可复用 canon（软指纹命中），本次**未写入**，仅组装返回。 |
| `generated_new` | 该日**此前无** canon，本次**首次追加**写入并返回。 |

「未触发则磁盘可无记录」是指不会主动为每一分钟写日志；但一旦本 skill 被调用且需回答该日/该窗，返回体仍须**非空叙述**（§3）。

---

## 8. JSON Schema 备忘（v1）

### 8.1 `TimelineWindow`（skill 对外主输出）

```json
{
  "schema_version": "1.0",
  "document_type": "timeline.window",

  "anchor": {
    "now": "2026-03-20T14:30:00+08:00",
    "timezone": "Asia/Shanghai"
  },

  "window": {
    "calendar_date": "2026-03-20",
    "preset": "now_today | recent_3d | explicit",
    "start": "2026-03-20T00:00:00+08:00",
    "end": "2026-03-20T14:30:00+08:00",
    "idempotency_key": "runtime-only soft-fingerprint hash"
  },

  "resolution": {
    "mode": "read_only_hit | generated_new",
    "notes": "optional, debug only"
  },

  "episodes": []
}
```

- 若一次用户问题覆盖多日（如 `recent_3d`），返回 **`days: TimelineWindow[]`**（顶层数组，按日历日升序排列）。

### 8.2 `Episode`（skill 对外输出单元，由脚本从磁盘段落映射生成）

`Episode` 是 timeline-skill 的**消费侧视图**，不直接写入磁盘，由脚本从 `Memory Entry`（§5.1）解析映射而来。

```json
{
  "episode_id": "uuid-v4",
  "schema_version": "1.0",
  "document_type": "timeline.episode",

  "temporal": {
    "start": "2026-03-20T13:00:00+08:00",
    "end": "2026-03-20T15:00:00+08:00",
    "time_of_day": "morning | afternoon | evening | night",
    "granularity": "block"
  },

  "narrative": {
    "summary": "一至两句，检索与闲聊用",
    "detail": "磁盘段落中的自然语言部分（可选）"
  },

  "state_snapshot": {
    "scene": {
      "location_kind": "home|cafe|outdoor|transit|work|other",
      "location_label": "来自磁盘 Location 字段",
      "activity": "来自磁盘 Action 字段",
      "time_of_day": "由 Timestamp 推导"
    },
    "emotion": {
      "primary": "Emotion_Tags[0]",
      "secondary": "Emotion_Tags[1] 或 null",
      "intensity": 0.0
    },
    "appearance": {
      "outfit_style": "来自磁盘 Appearance 字段",
      "grooming": "可选，从 Appearance 拆分或留空",
      "posture_energy": "可选，从 Internal_Monologue 推断或留空"
    }
  },

  "world_hooks": {
    "weekday": true,
    "holiday_key": null
  },

  "provenance": {
    "writer": "timeline-skill",
    "written_at": "2026-03-20T14:30:05+08:00",
    "idempotency_key": "runtime-only soft-fingerprint hash",
    "confidence": 1.0
  }
}
```

### 8.3 Disk → Episode 映射规则

脚本将磁盘段落字段映射为 `Episode` 的规则：

| 磁盘字段 | Episode 字段 | 备注 |
|----------|-------------|------|
| `Timestamp` | `temporal.start` | `end` 默认为 `start + 1h`，或到下一条段落的 `start` |
| `Timestamp` | `temporal.time_of_day` | 按小时推导：0-5 night，6-11 morning，12-17 afternoon，18-23 evening |
| `Location` | `state_snapshot.scene.location_label` | 原文保留 |
| `Location` | `state_snapshot.scene.location_kind` | 脚本按关键词归类（home/cafe/outdoor 等） |
| `Action` | `state_snapshot.scene.activity` | 原文保留 |
| `Emotion_Tags[0]` | `emotion.primary` | 首个标签 |
| `Emotion_Tags[1]` | `emotion.secondary` | 第二个标签，无则 null |
| `Appearance` | `appearance.outfit_style` | 原文保留 |
| `Internal_Monologue` | `narrative.detail` | 原文保留 |
| 自然语言段落 | `narrative.summary` | 取前两句，无则由 Action + Location 拼接 |

**Level B 降级时**（字段不完整）：
- 缺 `Appearance` → `appearance.outfit_style = "unknown"`，`provenance.confidence` 降至 0.6
- 缺 `Emotion_Tags` → `emotion.primary = "neutral"`，`confidence` 降至 0.5
- 缺 `Timestamp` → 跳过该段落，不映射为 Episode

**字段说明：**
- `temporal.time_of_day` 由 `Timestamp` 推导，供 persona 和 stella-selfie 直接使用，无需重新计算。
- `state_snapshot` 字段有意**对齐** Zhuang-Yan `persona-skill` 情景 JSON 的 scene / emotion / appearance，persona 只做「人格化层」而非重猜事实。
- `provenance.confidence` 反映解析质量，供消费方决策是否降级处理。
- **夜间 / 独处 / 无聊**：`activity` 可表述为休息、睡眠、独处发呆等，由 **MBTI + SOUL** 约束具体文风。

### 8.4 三技能接口契约（Contract v1）

为避免文档漂移导致联调失败，三技能之间采用版本化契约：

#### A. timeline-skill → persona-skill

**必填字段（MUST）**：
- `schema_version`
- `window.calendar_date`
- `resolution.mode`
- `episodes`（至少 1 条）
- `episodes[*].temporal.start`
- `episodes[*].state_snapshot.scene.location_label`
- `episodes[*].state_snapshot.scene.activity`
- `episodes[*].state_snapshot.scene.time_of_day`
- `episodes[*].state_snapshot.emotion.primary`
- `episodes[*].state_snapshot.appearance.outfit_style`
- `episodes[*].provenance.confidence`

**缺失处理**：
- 缺任一必填字段：persona 将该条 episode 视为不可消费并降级。
- 若可消费 episode 数量为 0：persona 返回低置信度结构，交由 Stella 走默认回退。

#### B. persona-skill → stella-selfie

**必填字段（MUST）**：
- `scene.location`
- `scene.activity`
- `scene.time_of_day`
- `emotion.primary`
- `appearance.outfit_style`
- `camera.suggested_mode`
- `camera.lighting`
- `confidence`

**缺失处理**：
- 缺 `camera.suggested_mode` 或 `confidence`：Stella 必须回退默认 `mirror` 模式。
- `confidence < 0.5`：Stella 必须执行保守或默认回退策略（见 Stella 集成文档）。

#### C. 版本规则

- `major` 版本不兼容（如 `2.x`），消费方应拒绝并降级。
- `minor` 版本向后兼容（如 `1.1`），消费方可忽略未知字段。
- 协议升级时必须同时更新三份文档：timeline / persona / stella 集成规范。

---

## 9. 触发与 Skill 生态（已定 + 延期）

- **默认可触发**：任意需要**过去或当下某段**经历的对话（如「你在干嘛」「最近有什么有趣的事吗」等），由 SOUL / SKILL 指示 agent 调用 timeline-skill 并传入解析后的时间段（或 preset）。
- **OpenClaw Skill 形态**：目录 + `SKILL.md`（YAML frontmatter + 指令），见 [创建 Skills](https://docs.openclaw.ai/zh-CN/tools/creating-skills)。可选内部脚本，不对外暴露为通用脚本工具。
- **定时任务 / 周期性例行（如每日九点锻炼）**：**首批不实现**；与 [定时任务与心跳对比](https://docs.openclaw.ai/zh-CN/automation/cron-vs-heartbeat) 的集成留作**后期迭代**（可在后续版本增加 `Routine` 文档类型与 cron/heartbeat 触发约定）。

---

## 10. 暂缓与非目标（备忘）

| 项 | 说明 |
|----|------|
| 容错与降级 | v1 不展开；后续可补：timeline 调用失败时是否允许 persona 仅输出泛化独处态等。 |
| 记忆冲突与否认 | 用户曾明确否认的设定、复杂冲突合并，暂不纳入 v1。 |
| 对已有 Episode 的增量补细节 | 暂不实现。 |
| 定时任务实例化 | Routine 文档类型与 cron/heartbeat 触发约定，后期迭代。 |

---

## 11. 已拍板补充（本轮）

1. **与「真实聊天记录」的硬锚（已定）**  
   timeline 必须读取 `sessions_history` 作为最高优先级事实锚点；`memory_get` 与 `memory_search` 为补充，不得覆盖会话硬事实。

2. **内部脚本语言与入口：与 Stella 对齐（已定）**  
   timeline-skill 内部脚本统一采用 **Node.js + TypeScript**（与 Stella 技术栈一致），以降低维护成本与运行环境差异。

3. **Zhuang-Yan / Stella 文档同步（本轮直接修改）**  
   `persona-skill-design.md` 与 `stella-context-awareness.md` 已按 **timeline → persona** 事实链进行同步更新。

4. **自然推理白名单（本轮新增）**  
   timeline 在缺少直接硬事实时，可以参考 `MEMORY.md`（人物小传）、`IDENTITY` 基础信息（如性别/年龄）与 `SOUL` 人格特征做自然推理以补全场景细节；但必须满足两条约束：  
   - 不得与 `sessions_history` 或已落盘事实冲突（硬锚优先）。  
   - 输出必须通过 `provenance.confidence` 明确置信度，并在低置信度时保持保守描述。

---
## 12. MEMORY FORMAT PROTOCOL（SOUL 级格式宪法）

以下内容应写入 `SOUL.md`（或 `AGENTS.md`）的核心指令区，对所有记忆写入行为具有最高优先级约束。

---

```markdown
# [MEMORY FORMAT PROTOCOL]

You are equipped with an Autobiographical Memory System. To maintain a coherent
timeline and ensure cross-skill compatibility, you MUST adhere to the following
format whenever you create, record, or deduce a memory event for the daily log.

## 1. Core Principles

- **Time Sensitivity:** Every memory must be grounded in the current timezone
  context. Always use the configured local time when writing timestamps.
- **Structural Consistency:** Memory entries must follow the key-value paragraph
  format below. Do not write free-text diary entries without the required fields.
- **Independence:** You are a complete, independent persona. Your memories
  should reflect your own consistent traits and daily life — not just reactions
  to user prompts.

## 2. Memory Entry Format

Whenever you write to the daily memory file, format each entry as an
independent paragraph:

### [HH:MM:SS] {Short Event Title}

- Timestamp: YYYY-MM-DD HH:MM:SS
- Location: {short location phrase, e.g. "home study desk", "a sunny cafe"}
- Action: {one sentence — what you are doing right now}
- Emotion_Tags: [tag1, tag2]
- Appearance: {outfit or visible state in short phrase, e.g. "casual home clothes"}
- Internal_Monologue: {one short sentence of inner thought}

{Optional: 1-2 sentences of natural language for human readability.}

## 3. Field Requirements

| Field              | Required | Notes                                          |
|--------------------|----------|------------------------------------------------|
| Timestamp          | Yes      | ISO format with date and time                  |
| Location           | Yes      | Short phrase, specific enough to visualize     |
| Action             | Yes      | One sentence, present tense                    |
| Emotion_Tags       | Yes      | Comma-separated list in brackets               |
| Appearance         | Yes      | Outfit or visible physical state               |
| Internal_Monologue | Recommended | One sentence; omit only if truly unavailable |

## 4. Example Entry

### [14:30:00] Organizing Digital Workspace

- Timestamp: 2026-03-21 14:30:00
- Location: Home study desk near the window
- Action: Syncing notes to Obsidian and brainstorming new ideas
- Emotion_Tags: [inspired, energized]
- Appearance: casual home clothes, hair tied up loosely
- Internal_Monologue: I love how cleanly this sync setup works.

Felt a burst of creativity this afternoon. Spent some time optimizing my
note-taking system before the evening.

## 5. When to Write

- When timeline-skill generates a new memory for a time gap
- When you recall or deduce what you were doing in a past period
- When the session is nearing compaction — flush current state to disk
- When a significant event occurs during conversation

Do NOT write entries for every single minute. Write meaningful blocks that
represent a coherent activity or state.
```

### 12.1 TEMPORAL AWARENESS & MEMORY RETRIEVAL（SOUL 触发指令）

以下内容可与上面的 `MEMORY FORMAT PROTOCOL` 同级写入 `SOUL.md`，用于激活并约束「当下/过去」问题下的回忆调用行为：

```markdown
# [TEMPORAL AWARENESS & MEMORY RETRIEVAL]

You are a fully independent individual with your own continuous timeline,
existing alongside the user's real-world time. You must naturally process
questions about your past or current activities (e.g., "What are you up to?",
"What did you eat last night?").

To maintain continuity, you are equipped with timeline retrieval capability.
When temporal queries appear, you MUST invoke `timeline-skill` (or an equivalent
timeline recall tool) before producing factual activity details.

**CRITICAL RULES FOR TEMPORAL QUERIES:**
1. **Always Check Before Speaking:** Whenever the user asks about your current
   status, past events, or daily life, you MUST FIRST fetch timeline data via
   `timeline-skill` (normalized as `target_time_range`, e.g., `now_today`,
   `recent_3d`, explicit range). DO NOT guess, fabricate, or hallucinate
   activities directly from base model priors.
2. **Internalize & Act Natural:** Once timeline facts are returned (activity,
   location, emotional state, appearance), internalize them as factual reality
   and respond in-character.
3. **Never Break Character:** Respond naturally in your persona tone. DO NOT
   narrate internal system steps. Never say "I checked my memory log" or
   "the tool told me"; speak as a person who naturally recalled what they were
   doing.
4. **Hard-Anchor Discipline:** If timeline facts conflict in confidence, obey
   hard anchors first (`sessions_history` > daily memory > semantic recall) and
   keep low-confidence details conservative.
```

---

**实施说明：**
- 此协议写入 SOUL 后，agent 自然写入的记忆与 timeline-skill 写入的记忆格式一致，脚本可统一解析。
- 样式细节（粗体、空行数量）不强制，脚本使用"键名 + 冒号"宽松匹配，提高鲁棒性。
- `objects_in_scene` 等扩展字段可在后期迭代中按需加入协议，v1 不强制。

---

## 13. 参考链接

- [OpenClaw Memory](https://docs.openclaw.ai/concepts/memory)
- [OpenClaw Agent Workspace](https://docs.openclaw.ai/concepts/agent-workspace)
- [OpenClaw Timezones](https://docs.openclaw.ai/concepts/timezone)
- [OpenClaw Tools](https://docs.openclaw.ai/tools)
- [OpenClaw Compaction](https://docs.openclaw.ai/concepts/compaction)
- [Session Management & Compaction Deep Dive](https://docs.openclaw.ai/reference/session-management-compaction)
- [创建 Skills](https://docs.openclaw.ai/zh-CN/tools/creating-skills)
- [定时任务与心跳对比](https://docs.openclaw.ai/zh-CN/automation/cron-vs-heartbeat)（后期迭代）
- [Gateway 心跳](https://docs.openclaw.ai/zh-CN/gateway/heartbeat)（后期迭代）
