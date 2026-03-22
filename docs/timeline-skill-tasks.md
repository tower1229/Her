# timeline-skill 开发任务计划

> 创建时间：2026-03-22  
> 目标：使 OpenClaw Agent 获得独立的时间线回忆能力，能在日常闲聊中自然响应时间类问题（"你在干嘛"/"最近有什么好玩的"），无需依赖 persona / Stella 集成。  
> 设计依据：[timeline-skill-design.md](file:///c:/Workspace/tower1229/Her/docs/timeline-skill-design.md) · [protocol.md](file:///c:/Workspace/tower1229/Her/docs/protocol.md)

---

## 工作区约定

| 仓库 | 用途 | 说明 |
|------|------|------|
| `Her/` | timeline-skill 源码仓库 | 存放 timeline-skill 的 TypeScript 脚本、Skill 文件夹和系统配置模板。 |

*注：`Zhuang-Yan/` 是 persona-skill 的源码仓库，实际的 OpenClaw Agent 工作区由用户在本地环境独立维护。*

---

## 里程碑总览

```
M0  集成准备与文档   ░░░  提供 AGENTS/SOUL 协议模板和集成指南
M1  Skill 入口文件     ░░░  轻量 SKILL.md + references/ 子目录
M2  核心读取脚本       ░░░  parse-memory.ts + fingerprint.ts  (P0)
M3  写入路径脚本       ░░░  holidays + inherit-appearance + write-episode  (P1)
M4  可观测性           ░░░  run-log.ts  (P3)
M5  端到端验证         ░░░  在真实 OpenClaw Agent 上进行集成测试
```

---

## M0 · 集成准备与文档（先决条件）

> **目标**：不直接修改用户的环境，而是将必需的 Agent 系统级协议提炼为模板，并在 README 中提供明确的手动集成指引。

- [ ] **T0.1** 在 `Her/templates/` 提取配置模板
  - 创建 `AGENTS-protocol.template.md`：包含完整 `[MEMORY FORMAT PROTOCOL]` 区块（§12 内容），含 Appearance 继承规则。
  - 创建 `SOUL-awareness.template.md`：包含完整 `[TEMPORAL AWARENESS & MEMORY RETRIEVAL]` 区块（§12.1 内容，5条 CRITICAL RULES）。
  - 验收：两个模板文件清晰、可直接被复制粘贴。

- [ ] **T0.2** 编写/更新 [Her/README.md](file:///c:/Workspace/tower1229/Her/README.md) 集成指南
  - 增加「OpenClaw Agent 安装与配置」章节。
  - 指导用户如何将 timeline-skill 安装到其 Agent 所在的 `skills/` 目录下。
  - 明确要求用户将 `AGENTS-protocol.template.md` 的内容手动复制到他们的工作区 `AGENTS.md` 的核心指令区。
  - 明确要求用户将 `SOUL-awareness.template.md` 的内容手动复制到他们的工作区 `SOUL.md` 的末尾。
  - 验收：集成指引结构分明，无歧义。

- [ ] **T0.3** 本地手动环境搭建（开发者验证环节）
  - 开发者在本地启动一个测试用的 OpenClaw Agent 环境。
  - 按照 T0.2 中的步骤实施配置。
  - 进行无脚本语言层冒烟验证：向 Agent 提问："你现在在干嘛？"，确认模型有调用 timeline-skill 的意图，而不是幻觉编造。

---

## M1 · Skill 入口文件

> **目标**：建立 Skill 文件夹骨架，创建轻量主入口和所有 references 子文件。  
> SKILL.md 是 OpenClaw 识别和加载 Skill 的关键文件。

### T1.1 初始化 Her 工程结构

- [ ] 在 `Her/` 根目录创建 `package.json`：
  ```json
  {
    "name": "timeline-skill",
    "version": "1.0.0",
    "scripts": {
      "build": "tsc",
      "test": "node --experimental-vm-modules node_modules/.bin/jest"
    },
    "devDependencies": {
      "typescript": "^5.x",
      "@types/node": "^20.x",
      "jest": "^29.x",
      "ts-jest": "^29.x"
    }
  }
  ```
- [ ] 创建 `Her/tsconfig.json`（target: ES2022, module: CommonJS, strict: true）
- [ ] `npm install` 安装依赖

### T1.2 创建 `Her/timeline-skill/SKILL.md`（主入口，≤100行）

内容约束（严格控制篇幅，其余全部 `→ references/` 引用）：

```yaml
---
name: timeline-skill
description: >
  Factual timeline layer. Given a time range, retrieves or generates
  structured episode facts from memory and session history.
  Returns a TimelineWindow JSON object. Writes new episodes to disk (Append-Only).
---
```

正文包含：
1. **触发条件**：自然语言时间类问题 → 解析为 `now_today` / `recent_3d` / `explicit`
2. **强依赖声明**：先读 `sessions_history`（硬锚），再读 `memory_get`，再 `memory_search`
3. **三条绝对禁令**（指向 `references/gotchas.md` 查完整列表）：
   - 禁止覆盖已有 canon（软指纹命中 → read_only_hit，直接返回）
   - 禁止用 `memory_search` 结果否定 `sessions_history` 硬事实
   - 禁止输出空结果（允许"在睡觉/发呆"，不允许"没有记忆"）
4. **文件引用索引**（links to references/）
5. **输出格式**：`→ references/json-schema.md`

### T1.3 创建 `references/gotchas.md`

从设计文档 §15.2 提炼，包含 G1~G6 全部 Gotchas：
- 🚨 G1: sessions_history 是绝对硬锚
- 🚨 G2: timeline-skill 是唯一写盘责任方（single writer）
- 🚨 G3: 禁止覆盖已有 canon（immutable）
- ⚠️ G4: memory_search 不参与只读判定
- ⚠️ G5: Appearance 继承必须发生在脚本层
- ⚠️ G6: 输出非空 ≠ 可以虚构事实

### T1.4 创建 `references/memory-format.md`

来源：设计文档 §5.1  
内容：完整的 Markdown 段落格式模板 + 字段说明表（v1 最小集 6 字段）+ 设计原则 4 条

### T1.5 创建 `references/window-semantics.md`

来源：设计文档 §6  
内容：三种 preset 语义（`now_today` / `recent_3d` / `explicit`）+ 幂等键运行态规则

### T1.6 创建 `references/json-schema.md`

来源：设计文档 §8.1 + §8.2  
内容：
- `TimelineWindow` 完整 JSON Schema
- `Episode` 完整 JSON Schema（含 `state_snapshot` / `world_hooks` / `provenance`）
- Disk → Episode 映射规则表（§8.3）
- 三技能接口契约中 timeline → persona 的必填字段列表（§8.4.A）

### T1.7 创建 `examples/episode-sample.md`

一条完整的示例 Episode：
- 磁盘段落原文（Markdown 格式）
- 对应的 Episode JSON（Level A 完整映射）
- 一条 Level B 降级示例（缺 Appearance 时 confidence 降至 0.6）

---

## M2 · 核心读取脚本（P0）

> **目标**：实现读取路径的确定性逻辑。这是 `read_only_hit` 判断和 Episode 生成的核心。

### T2.1 创建 `scripts/types.ts`（共享类型定义）

```typescript
// 磁盘解析产物
interface ParsedEpisode {
  timestamp: string;        // 原始 Timestamp 字段值
  location: string;
  action: string;
  emotionTags: string[];
  appearance: string;       // "unknown" when Level B
  internalMonologue?: string;
  naturalText?: string;
  parseLevel: 'A' | 'B';
  confidence: number;       // 1.0 for A, 0.6/0.5 for B
}

// 消费侧视图（不落盘）
interface Episode { /* 完整 §8.2 结构 */ }
interface TimelineWindow { /* 完整 §8.1 结构 */ }
interface WorldHooks { weekday: boolean; holiday_key: string | null }
```

### T2.2 实现 `scripts/parse-memory.ts`

**职责**：将 `memory/YYYY-MM-DD.md` 全文字符串解析为 `ParsedEpisode[]`

关键逻辑：
- 按 `### [HH:MM:SS]` 三级标题切割段落
- **Level A**：`Timestamp` / `Location` / `Action` / `Emotion_Tags` / `Appearance` 全部命中 → `confidence = 1.0`
- **Level B 降级**：
  - 缺 `Appearance` → `appearance = "unknown"`, `confidence = 0.6`
  - 缺 `Emotion_Tags` → `emotionTags = ["neutral"]`, `confidence = 0.5`
  - 缺 `Timestamp` → 跳过该段落（不映射）
- 解析使用"键名 + 冒号"宽松匹配（不依赖严格格式，兼容 agent 自然写入）
- 暴露函数：`parseMemoryFile(content: string): ParsedEpisode[]`

**单元测试覆盖**：
- Level A 正常解析
- Level B 各字段缺失降级
- 含中文内容的宽松匹配
- 多段落文件正确切割

### T2.3 实现 `scripts/fingerprint.ts`

**职责**：计算软指纹，判断目标时间段是否已有 canon

```typescript
// 软指纹算法（§5.3）
function computeFingerprint(date: string, location: string, action: string, timestamp: string): string {
  const bucket = toTimeBucket(timestamp); // 向下取整到 30min 槽
  return normalize(date) + '|' + normalize(location) + '|' + normalize(action) + '|' + bucket;
}

// normalize: 小写 + 去标点 + 去多余空格
function normalize(s: string): string

// time_bucket: "14:30" (30分钟槽)  
function toTimeBucket(timestamp: string): string

// 主判定接口
function checkReadOnlyHit(
  episodes: ParsedEpisode[],
  target: { location: string; action: string; timestamp: string; date: string }
): { hit: boolean; matchedEpisode?: ParsedEpisode }
```

**单元测试覆盖**：
- 相同活动 ±15min 偏差应命中（同一 30min 槽）
- 不同活动不命中
- normalize 中英文混合场景

---

## M3 · 写入路径脚本（P1）

> **目标**：实现确定性写入，包含外观继承、格式验证、world_hooks 计算。

### T3.1 实现 `scripts/holidays.ts`

**职责**：封装 Nager.Date API，提供带年级缓存的节假日查询

```typescript
// API: GET https://date.nager.at/api/v3/PublicHolidays/{year}/CN
// 缓存路径: scripts/.cache/holidays-{year}-CN.json

async function getHoliday(dateStr: string, countryCode = 'CN'): Promise<string | null>
// 返回节日英文名（如 "Chinese New Year"）或 null
// 首次调用当年时自动拉取并缓存，后续读缓存
```

**注意**：
- 缓存目录 `.cache/` 加入 `.gitignore`
- 网络请求失败时静默降级返回 `null`（不应因节假日 API 失败阻断写盘）
- 超时设置 3s

### T3.2 实现 `scripts/inherit-appearance.ts`

**职责**：实现日内稳态字段继承逻辑（§5.5）

```typescript
const OUTFIT_CHANGE_SIGNALS = {
  sport: ['gym', 'swim', 'run', '运动', '健身', '跑步'],
  formal: ['formal', 'wedding', 'dinner', '正装', '晚宴', '面试'],
  wakeup: ['wake up', '起床', '刚起', 'morning routine'],
  bath: ['shower', 'bath', '洗澡', '换衣'],
  sleep: ['sleep', 'bedtime', '睡觉', '就寝'],
};

function resolveAppearance(
  dayEpisodes: ParsedEpisode[],
  newAction: string,
  defaultInference: string   // 由 LLM 推断的默认值（仅首次或换装时使用）
): { appearance: string; overridden: boolean; reason: string }
```

逻辑：
1. 取当日时间最早且 `appearance !== "unknown"` 的 Episode 作为日锚
2. 新 Action 包含换装信号 → 覆盖（附 reason）
3. 无日锚（首次）→ 使用 `defaultInference`
4. 日锚为 `unknown` → 使用 `defaultInference` 并升格为新日锚

**单元测试覆盖**：
- 正常继承场景
- gym 关键词触发换装覆盖
- 首次写入场景（无日锚）
- 日锚为 unknown 时的升格逻辑

### T3.3 实现 `scripts/write-episode.ts`

**职责**：格式验证 + world_hooks 计算 + Append-Only 写盘，是唯一指定的磁盘写入入口。

```typescript
interface WriteEpisodeInput {
  timestamp: string;        // ISO 格式
  location: string;
  action: string;
  emotionTags: string[];
  appearance: string;       // 经过 inherit-appearance 处理后的值
  internalMonologue?: string;
  naturalText?: string;
  filePath: string;         // memory/YYYY-MM-DD.md 的绝对路径
}

interface WriteResult {
  success: boolean;
  written_at: string;
  world_hooks: WorldHooks;
  error?: string;
}

async function writeEpisode(input: WriteEpisodeInput): Promise<WriteResult>
```

内部流程：
1. **格式验证**：检查必填字段（Timestamp/Location/Action/Emotion_Tags/Appearance）→ 缺失时拒绝写入，返回 `error`
2. **world_hooks 计算**：
   - `weekday = date.getDay() !== 0 && date.getDay() !== 6`（纯计算）
   - `holiday_key = getHoliday(dateStr)`（查询内置静态节假日表，无网络请求）
3. **格式化段落**：按 §5.1 模板组装 Markdown 文本
4. **Append-Only 写盘**：使用 `fs.appendFile`，若目标日文件不存在则自动创建
5. **不修改已有内容**（immutable 约束）

### T3.4 集成测试：完整读写往返

- [ ] 用 `write-episode.ts` 写入一条测试 Episode
- [ ] 用 `parse-memory.ts` 读回并解析
- [ ] 用 `fingerprint.ts` 对同一内容做只读判定 → 应 `hit = true`
- [ ] 用 `fingerprint.ts` 对不同内容做只读判定 → 应 `hit = false`
- [ ] 验证节假日检测：对 `2026-01-01` 应返回 `"New Year's Day"`

---

## M4 · 可观测性（P3）

> **目标**：让每次 skill 调用留下可查询的运行轨迹，支撑 Heartbeat 优化和人工调试。

### T4.1 实现 `scripts/run-log.ts`

**日志文件**：`memory/.timeline-run.log`（Append-Only JSON Lines）

```typescript
interface RunLogEntry {
  ts: string;              // 本次调用时间 ISO
  date: string;            // 目标日历日 YYYY-MM-DD
  mode: 'generated_new' | 'read_only_hit';
  episodes_written: number;
  window: string;          // preset: now_today / recent_3d / explicit
  confidence: number;      // 本次最低 provenance.confidence
}

function appendRunLog(entry: RunLogEntry, logPath: string): void
function readRecentLogs(logPath: string, n = 20): RunLogEntry[]
```

### T4.2 集成到 `write-episode.ts`

写盘成功后，调用 `appendRunLog` 记录本次运行状态，字段包含：
- `mode: "generated_new"`（仅 write-episode 成功时记录）
- `confidence`：来自 `write-episode` 中的写入产物

`read_only_hit` 的日志记录由调用 `write-episode.ts` 的上层（SKILL.md 脚本编排层）负责，在 fingerprint 命中后追加。

---

## M5 · 端到端验证

> **目标**：在真实的 OpenClaw Agent 环境上验证完整链路，确认语言层 + 脚本层协同正确。

### T5.1 部署 Skill 到测试 Agent 工作区

- [ ] 在本地搭建好的测试 Agent 工作区中，确保护栏已如 M0 配置
- [ ] 将 `Her/timeline-skill/` 部署到测试 Agent 的 `skills/ timeline-skill/` 目录下

### T5.2 对话场景验证

| 场景 | 输入 | 预期行为 |
|------|------|---------|
| 当下查询 | "你现在在干嘛？" | 调用 timeline-skill(now_today)，生成或读取 Episode，自然回复 |
| 最近查询 | "最近几天有什么有趣的事吗？" | 调用 timeline-skill(recent_3d)，按日返回 3 天 Episodes |
| 夜间场景 | 23:00 问"你在干嘛" | 应返回"在睡觉/休息"等合理状态，不输出"没有记忆" |
| 已有记忆 | 同一时段第二次查询 | fingerprint 命中 → read_only_hit，不重复写盘 |
| 硬锚场景 | 会话中提及"你刚才还在帮我查资料" | sessions_history 作为硬锚，timeline 必须以此为准 |

### T5.3 磁盘记忆文件验证

对话结束后，检查测试 Agent 工作区中的 `memory/YYYY-MM-DD.md`：
- [ ] 文件存在且格式符合 §5.1 模板（6 字段齐全）
- [ ] 同一天内 Appearance 字段一致（无漂移，跨段落正确继承）
- [ ] 无重复段落（相同时间槽仅有一条有效记录）

### T5.4 Heartbeat 补写验证

- [ ] 触发 Heartbeat（心跳机制）
- [ ] 检查 `.timeline-run.log`：当日已有 Episode 的时段应显示 `read_only_hit`，不产生新日志段落
- [ ] 确认对于 `read_only_hit` 条目，`episodes_written = 0`

---

## 完整产物清单

```
Her/
├── package.json
├── tsconfig.json
├── README.md                         ← M0.2  集成文档
├── templates/
│   ├── AGENTS-protocol.template.md   ← M0.1  §12 内容模板
│   └── SOUL-awareness.template.md    ← M0.1  §12.1 内容模板
├── .gitignore                        （含 node_modules/ scripts/.cache/）
└── timeline-skill/
    ├── SKILL.md                      ← M1.2  主入口（≤100行）
    ├── references/
    │   ├── gotchas.md                ← M1.3  G1~G6 Gotchas
    │   ├── memory-format.md          ← M1.4  §5.1 磁盘格式
    │   ├── window-semantics.md       ← M1.5  §6 窗口语义
    │   └── json-schema.md            ← M1.6  §8 完整 Schema
    ├── scripts/
    │   ├── types.ts                  ← M2.1  共享类型
    │   ├── parse-memory.ts           ← M2.2  Level A/B 解析
    │   ├── fingerprint.ts            ← M2.3  软指纹 + 只读判定
    │   ├── holidays.ts               ← M3.1  Nager.Date + 缓存
    │   ├── inherit-appearance.ts     ← M3.2  日内稳态继承
    │   ├── write-episode.ts          ← M3.3  格式验证 + 写盘
    │   ├── run-log.ts                ← M4.1  运行日志
    │   └── .cache/                   （自动生成并 gitignore）
    └── examples/
        └── episode-sample.md         ← M1.7  Level A/B 示例
```

---

## 依赖关系图

```
M0（输出配置模板和 README 供用户安装集成）
  └─► M1（Skill 骨架构建，提供轻量上下文环境）
        └─► M2（核心读取脚本，奠定逻辑基础并定义类型）
              └─► M3（核心写入脚本，闭环整个生命周期的事实落地功能）
                    └─► M4（运行日志，支撑可观测和调试效率）
                          └─► M5（端到端实际环境验证）
```
