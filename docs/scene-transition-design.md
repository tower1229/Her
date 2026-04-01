# 场景迁移（Scene Transition）需求文档

> 状态：设计草案  
> 版本：Phase 2 of timeline plugin roadmap  
> 前置依赖：v2.5.1（Event_Id + 宏观事件细化 + 场景多样性）  
> 关联仓库：[Her](https://github.com/tower1229/Her)（timeline plugin）、[Zhuang-Yan](https://github.com/tower1229/Zhuang-Yan)（persona skill）

---

## 1. 目标

让用户可以通过自然语言指令启动 agent 的**全周期状态迁移**（包括搬家、旅行、出差等长周期迁移，也包括出去逛街、洗澡、做饭等短周期日常动作），使 agent 的时间线和场景表现同步更新。

同时，Timeline 只负责记忆写入；当系统识别到该迁移可能需要更新持久人设时（例如搬家），主动联动 Persona Skill 执行更新逻辑，实现 Timeline 与 Persona 的反向联动。

完整的场景迁移包含三个情况：

| 阶段 | 说明 | 示例 |
|------|------|------|
| **启动** | 用户发出迁移指令，系统创建事件并写入记忆；如有必要，触发更新 Persona 的关键词。 | "你搬家去大理吧" / "去洗个澡" |
| **过程** | 事件持续时间内，每次查询返回合理的瞬时细化阶段（仅限长周期事件，v2.5.x 已实现）。 | 第 1 小时→打包，第 6 小时→在路上 |
| **完成** | 事件过期后，迁移结果生效；若是设定变动，由于联动了 Persona Skill 更新，后续生成将以新状态为基准。 | 此后如果在设定中改变了居所，生成将以新居所为准。 |

---

## 2. 入口设计

### 2.1 新增 tool：`timeline_transition`

新增一个独立的 tool，而非扩展 `timeline_resolve` 的 input schema。理由：

- `timeline_resolve` 是**查询型** tool，公开 schema 只有 `query`，语义纯净
- 场景迁移是**写入型**指令，包含状态变更的操作
- 分离后各自的 Reasoner prompt 和验证逻辑更清晰

#### 公开 Input Schema

```typescript
interface TimelineTransitionInput {
  directive: string;        // 用户的自然语言迁移指令
}
```

`directive` 是必填字段，承载用户原话。所有的状态迁移（不论长短）均使用同一套处理逻辑，**不区分 transition_type**。

#### Output Schema

```typescript
interface TimelineTransitionOutput {
  ok: boolean;
  trace_id: string;
  transition: {
    event_id: string;                 // 该事件的 Event_Id
    summary: string;                  // 人类可读的迁移摘要
    estimated_duration_minutes: number;
    started_at: string;               // ISO timestamp
    expected_end_at: string;          // ISO timestamp
    requires_persona_update: boolean; // 是否可能导致人设文件发生变更
    persona_update_data?: any;        // 如果为 true，则包含符合下游消费协议的更新数据
  };
  canon_write: {
    success: boolean;
    file_path: string;
  };
  notes: string[];
}
```

### 2.2 Skill 路由

在 `SKILL.md` 的 Entry Point Selection 中新增第三条路径：

```
1. Time-reality question → references/time-reality.md
2. Scene transition directive → references/scene-transition.md  ← 新增
3. Otherwise exit without Timeline action
```

#### 场景迁移触发条件

用户的消息是一个**明确指示 agent 进行状态改变 或 位置移动 的指令**，而非常规闲聊或纯提问。识别标志包括但不限于：

- 明确的位置或居所改变："搬去 X"、"以后住在 X"
- 外出出行："去 X 旅游 N 天"、"出差去 X"、"去楼下买杯咖啡"、"出去逛逛街"
- 日常生活状态改变："去洗个澡吧"、"准备去睡觉"、"你现在去厨房做饭"

**不属于**场景迁移的情况：

- 询问型："你想搬去大理吗"（这是闲聊）
- 假设型："如果你去洗澡会怎样"（这是假设）

---

## 3. 内部流程

### 3.1 调用链

```
用户消息
  → Skill 识别为 scene-transition directive
    → 调用 timeline_transition(directive)
      → Transition Planner（LLM）分析指令（包含中断/并发检测）
        → 输出：TransitionPlan
      → 处理状态插入或打断并写入事件到 canon
      → 返回 TimelineTransitionOutput
    → Skill 判断若 requires_persona_update=true，则利用 subagent 触发 Persona 更新
```

### 3.2 Transition Planner

新增一个 LLM 推理环节（类似现有的 `buildTimelineReasonerSystemPrompt`），输入：

- `directive`：用户原话
- `persona_context`：当前 PersonaContractV1
- `anchor`：当前时间和时区
- `world_context`：日历信息

输出 `TransitionPlan`：

```typescript
interface TransitionPlan {
  summary: string;
  estimated_duration_minutes: number;
  started_at: string;               // 通常是 anchor.now
  requires_persona_update: boolean; // 是否有可能更改长期人设（如搬家、换工作引发核心信息变动）
  persona_update_data?: any;        // 从设定上判定为需要更新时，返回符合消费协议的 JSON 格式更新数据
  initial_phase: {                  // 当前动作的初始阶段表现
    location: string;
    action: string;
    emotionTags: string[];
    appearance: string;
    internalMonologue: string;
  };
}
```

### 3.3 状态冲突与中断处理

当状态迁移发生且此时 Agent 本身处于一个活动进程中时，必须基于现实逻辑兼顾处理状态流转：

1. **直接打断（Interrupt）**
   - 场景：非强占用的日常过程事件（如“看书”、“看电视”）执行时，用户指令要求“去洗澡”。
   - 逻辑：支持打断。在 canon 写入新状态前，需要主动对正在发生的这段记忆修改其 `estimated_duration`（截断其时间），然后新增写入洗澡的事件（改变状态）。
2. **微观任务插入（Insert Micro-task）**
   - 场景：在宏观任务期间（如“出差”、“逛街”），用户提出小型状态迁移（如“尝尝这边的街边小吃”）。
   - 逻辑：判断该逻辑能现实兼容即可作为新的微观事件插入。不截断原有的逛街动作记录。
3. **不可兼容的拒绝（Reject）**
   - 场景：严重冲突。例如正在外地出差时，要求“回厨房做饭”。
   - 逻辑：如果不符合物理与现实逻辑，Planner 判断为不可兼容。此时状态迁移失败，返回中直接给出拒绝并提供合理的原因，从而解释给用户。

### 3.4 Canon 写入

动作/事件写入复用现有的 `writeEpisode`，字段映射：

| TransitionPlan 字段 | WriteEpisodeInput 字段 |
|---------------------|----------------------|
| `started_at` | `timestamp` |
| `initial_phase.location` | `location` |
| `initial_phase.action` | `action` |
| `initial_phase.emotionTags` | `emotionTags` |
| `initial_phase.appearance` | `appearance` |
| `initial_phase.internalMonologue` | `internalMonologue` |
| `estimated_duration_minutes` | `estimatedDurationMinutes` |
| 自动生成 | `eventId`（由 writeEpisode 自动生成） |
| 不设置 | `parentEventTag`（事件本身没有父事件） |

写入时将伴随着（3.3 节的打断处理等）。写入后，如果 `estimated_duration_minutes` 较长构成了宏观事件，后续的 `timeline_resolve` 会自动将其视为宏观背景并做瞬时细化。如果 duration 较短（如洗澡30分钟），则作为正常的普通记忆段落下潜，不会触发拆解细化。

### 3.5 联动 Persona 文件反向更新

Timeline 的职责明确为：**只负责记忆和时间线的写入，自身不修改设定文件**。

如果 Transition Planner 分析发现这是一个会导致长期人设变化的动作（例如“搬家”、“换工作”），会将 `requires_persona_update` 标记为 `true`，同时通过组装输出一份符合 Timeline 下游消费协议特征的 `persona_update_data` JSON 结构数据。

Timeline Skill 层收到 `requires_persona_update=true` 后，主动触发联动：
它将直接利用 subagent 机制执行如下调用：
`调用 persona skill 更新 PERSONA_PROFILE ：${符合 Timeline 下游消费协议的json 格式的更新数据}`

由于直接通过 subagent 调用链路进入到 `\Zhuang-Yan\SKILL.md`（Persona Skill）中，这里充分发挥了专门事由专门工具处理的优势。而且在 Persona Skill 层不需要把所有细节堆砌在入口，可以采用**渐进式披露机制**——仅将该设定的更新逻辑描述清楚，并放置成独立的 references 文件中通过引述执行。这使得结构足够清晰且职能剥离干净。

---

## 4. 跨天长周期事件问题

### 4.1 问题定义

对于出差、旅游等长周期动作，事件的时长可能会跨越多天（例如旅行 3 天）。由于 canon 存储在 `memory/YYYY-MM-DD.md` 中，跨天操作会由于仅记录在起始日而导致后续日常采集不到该背景状态。

### 4.2 解决方案：Collector 回溯采集

**核心思路**：不改变 canon 按日写入的模型，但在 Collector 阶段扩展采集范围。

#### 4.2.1 方案细节

在 `collectSources` 或 `collectTimelineRequest` 中增加逻辑：

1. 正常采集当天（和 window 覆盖的）daily logs
2. 如果当天 canon 中**没有未过期的高耗时事件**，向前回溯最多 7 天，检查是否存在 `timestamp + estimated_duration_minutes` 跨越到此时刻的记忆条目。
3. 回溯动作通过脚本快速扫描前几天文件的最后一条高 duration 事件即可。
4. 一旦命中跨天的进行中大事件，将其注入当天的 `candidate_facts`。

#### 4.2.2 细化阶段的归属

跨天场景下，基于被回溯出来的父事件，每次新的动作细化阶段仍然写入**当天**的 canon：

```
memory/2026-03-31.md  ← 旅行开始（08:00，duration=3600分钟）
memory/2026-04-01.md  ← 细化动作（在酒店吃早餐，09:00，Parent_Event: evt-20260331-080000）
```

保持每天记录瞬时状态的模型，并通过 `Parent_Event` 关联状态根源。

---

## 5. Skill 层 references/scene-transition.md

当 SKILL.md 路由到 scene-transition path 时，加载 `references/scene-transition.md`，该文件提供：

### 5.1 调用 timeline_transition

向 `timeline_transition` 传入用户的原话作为 `directive`。

### 5.2 处理返回结果

- 如果 `ok: true`：
  1. 向用户自然回复确认新状态的过程。
  2. 提取 `transition.requires_persona_update`，**如果是 true，必须触发 subagent 执行命令：`调用 persona skill 更新 PERSONA_PROFILE ：${transition.persona_update_data}`**，从而将变动数据输送至下游落地。
- 如果 `ok: false`（如现实逻辑冲突）：
  1. 根据 notes 信息，自然地向用户解释为什么现在无法进行该状态切换（比如身在外地无法居家做饭等）。

---

## 6. 与现有机制的衔接

### 6.1 与细化机制的衔接

`timeline_transition` 写入的时间线完全兼容 v2.5.x 的细化机制：
- 短周期动作 -> 直接结束。
- 长周期动作（`estimated_duration_minutes` 很长） -> 触发 Reasoner 处理细化的底层规则逻辑，通过 `Parent_Event` 锚定。

### 6.2 PersonaContractV1 更新

因为 Timeline 把 Persona 变更责任交还给了 Zhuang-Yan，所以当 Zhuang-Yan 完成持久文件修改后，Timeline 下次装载时自然会加载最新的 `PersonaContractV1`。这保证了状态始终正确且单向依赖。

---

## 7. 注册与导出

### 7.1 Tool 注册

在 `index.ts` 中新增 `timeline_transition` 的注册：
- `src/plugin_metadata.ts` 中 `TIMELINE_TOOL_NAMES` 扩展为 `['timeline_resolve', 'timeline_transition']`

### 7.2 文件结构

新增文件：

```
src/tools/timeline_transition.ts        ← tool 入口 + input/output 定义
src/core/transition_planner.ts          ← Transition Planner LLM 推理
src/core/transition_planner_contract.ts ← TransitionPlan 数据结构
skills/timeline-skill/references/scene-transition.md ← Skill 路由指令文档
```

修改文件：

```
src/core/collect_sources.ts             ← 跨天回溯采集逻辑
src/core/collect_timeline_request.ts    ← 注入回溯记忆
skills/timeline-skill/SKILL.md          ← Entry Point Selection 新增路径
src/plugin_metadata.ts                  ← TOOL_NAMES 扩展
index.ts / openclaw-sdk-compat.ts       ← 注册新 tool
```

---

## 8. 测试策略

### 8.1 单元测试

| 模块 | 测试要点 |
|------|---------|
| `transition_planner` | 对不同行为（长、短耗时）的有效识别与时长估算；`requires_persona_update` 正确判定 |
| `collect_sources` | 回溯找到跨天事件；未超时和已超时的边界；无宏观事件时不触发误回溯 |
| `timeline_transition` tool | 调用链路成功，canon 写入验证 |

### 8.2 手工测试（追加到 QUICK_TEST_CASES.md）

| 编号 | 测试项 | 通过条件 |
|------|--------|---------|
| T-Trans-1 | 任意状态迁移过程起效 | canon 成功写入新的行为。如果动作超过 120 分钟后续询问能有效被“细化” |
| T-Trans-2 | 跨天事件能够被继承 | 执行多日跨度的出远门操作，第二天问候时仍存在于异地 |
| T-Trans-3 | 连跑联动机制 | 明确执行导致属性变更指令（如：搬家），查看模型最终是否返回 `更新 PERSONA_PROFILE` |

---

## 9. 文档同步

发布时需同步更新：

- `docs/timeline-consumption-protocol.md`：新增 "Scene Transition" 说明
- `docs/architecture.md`：流程图新增 `timeline_transition` 逻辑流和联动 Persona 的虚线
- `docs/QUICK_TEST_CASES.md`：新增相关的 T-Trans 测试用例

---

## 10. 优先级

| 步骤 | 内容 | 优先级 |
|------|------|--------|
| 1 | `TransitionPlan` 接口收敛 | P0 |
| 2 | Transition Planner（LLM）推理支持任一状态迁移及联动标记 | P0 |
| 3 | `timeline_transition` tool 入口开发 | P0 |
| 4 | Skill 路由修改及 references 操作手册起草 | P0 |
| 5 | Collector 跨天回溯采集 | P0 |
| 6 | 各步骤单测与集成测试 | P0 |
| 7 | 功能连通及触发联动测试 | P1 |
