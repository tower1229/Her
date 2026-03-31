# 场景迁移（Scene Transition）需求文档

> 状态：设计草案  
> 版本：Phase 2 of timeline plugin roadmap  
> 前置依赖：v2.5.1（Event_Id + 宏观事件细化 + 场景多样性）  
> 关联仓库：[Her](https://github.com/tower1229/Her)（timeline plugin）、[Zhuang-Yan](https://github.com/tower1229/Zhuang-Yan)（persona skill）

---

## 1. 目标

让用户可以通过自然语言指令启动 agent 的**长周期状态迁移**（搬家、旅行、出差等），使 agent 的时间线、场景表现、以及持久人设同步更新。

完整的场景迁移包含三个阶段：

| 阶段 | 说明 | 示例 |
|------|------|------|
| **启动** | 用户发出迁移指令，系统创建宏观事件并立即更新 persona 的永久属性 | "你搬家去大理吧" |
| **过程** | 宏观事件的持续时间内，每次查询返回合理的瞬时细化阶段（v2.5.x 已实现） | 第 1 小时→打包，第 6 小时→在路上 |
| **完成** | 宏观事件过期后，迁移结果永久生效，后续所有生成以新状态为基准 | 此后 `home_city` = 大理 |

---

## 2. 入口设计

### 2.1 新增 tool：`timeline_transition`

新增一个独立的 tool，而非扩展 `timeline_resolve` 的 input schema。理由：

- `timeline_resolve` 是**查询型** tool，公开 schema 只有 `query`，语义纯净
- 场景迁移是**写入型**指令，需要结构化的 transition 参数
- 分离后各自的 Reasoner prompt 和验证逻辑更清晰

#### 公开 Input Schema

```typescript
interface TimelineTransitionInput {
  directive: string;        // 用户的自然语言迁移指令
  transition_type?: string; // 可选提示：relocate | travel | errand | custom
}
```

`directive` 是必填字段，承载用户原话。`transition_type` 是可选的结构化提示，帮助系统更准确地判断迁移类型。

#### Output Schema

```typescript
interface TimelineTransitionOutput {
  ok: boolean;
  trace_id: string;
  transition: {
    event_id: string;                 // 宏观事件的 Event_Id
    type: TransitionType;             // relocate | travel | errand | custom
    summary: string;                  // 人类可读的迁移摘要
    estimated_duration_minutes: number;
    started_at: string;               // ISO timestamp
    expected_end_at: string;          // ISO timestamp
    persona_updates: PersonaUpdateRecord[];
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
3. Scene ambience → 内联逻辑
```

#### 场景迁移触发条件

用户的消息是一个**改变 agent 生活状态的指令**，而非提问或闲聊。识别标志：

- 明确的位置变更："搬去 X"、"搬家到 X"、"以后住在 X"
- 有目的地的出行："去 X 旅游 N 天"、"出差去 X"、"去 X 一趟"
- 明确的状态变更指令："你现在出发去 X"、"开始搬家吧"
- 用户使用祈使句指示 agent 执行一个跨越较长时间的行为

**不属于**场景迁移的情况：

- 询问型："你想搬去大理吗"（这是闲聊）
- 假设型："如果你搬去大理会怎样"（这是假设）
- 短时间动作："你去下楼买杯咖啡"（这是普通 timeline 生成，无需 transition）

---

## 3. Transition 类型分类

| 类型 | 特征 | persona 影响 | 典型 duration |
|------|------|-------------|--------------|
| `relocate` | 永久居所变更 | `home_city`、`common_zones`、`plausible_locations` 永久变更 | 6h-48h |
| `travel` | 临时出行，有返回预期 | 不变更 `home_city`；旅行期间 `plausible_locations` 临时扩展 | 1d-14d |
| `errand` | 当天往返的外出 | 不变更 persona | 1h-8h |
| `custom` | 其他长周期状态变更 | 由 Reasoner 判断是否影响 persona | 按指令判断 |

---

## 4. 内部流程

### 4.1 调用链

```
用户消息
  → Skill 识别为 scene-transition directive
    → 调用 timeline_transition(directive)
      → Transition Planner（LLM）分析指令
        → 输出：TransitionPlan
      → 写入宏观事件到 canon（复用 writeEpisode）
      → 生成 persona 更新指令（PersonaUpdateRecord[]）
      → 返回 TimelineTransitionOutput
    → Skill 根据 output 中的 persona_updates 执行 persona 文件修改
```

### 4.2 Transition Planner

新增一个 LLM 推理环节（类似现有的 `buildTimelineReasonerSystemPrompt`），输入：

- `directive`：用户原话
- `persona_context`：当前 PersonaContractV1
- `anchor`：当前时间和时区
- `world_context`：日历信息

输出 `TransitionPlan`：

```typescript
interface TransitionPlan {
  type: 'relocate' | 'travel' | 'errand' | 'custom';
  summary: string;
  origin: string;              // 出发地（从 persona 推断）
  destination: string;         // 目的地（从 directive 提取）
  estimated_duration_minutes: number;
  started_at: string;          // 通常是 anchor.now
  persona_updates: PersonaUpdateRecord[];
  initial_phase: {             // 宏观事件的初始记忆
    location: string;
    action: string;
    emotionTags: string[];
    appearance: string;
    internalMonologue: string;
  };
}
```

### 4.3 PersonaUpdateRecord

描述一条需要更新的 persona 属性变更：

```typescript
interface PersonaUpdateRecord {
  timing: 'immediate' | 'on_completion';
  target_file: 'IDENTITY.md' | 'persona/PERSONA_PROFILE.md';
  field_path: string;      // e.g. "Identity > home_city"
  old_value: string;       // 变更前的值
  new_value: string;       // 变更后的值
  reason: string;          // 变更原因，用于 agent 向用户解释
}
```

#### timing 语义

- `immediate`：迁移启动时立即生效。适用于 `relocate` 类型——用户说"搬去大理"，那么 `home_city` 应该**马上**改为大理，因为这是用户的明确意愿，不需要等搬家过程结束。
- `on_completion`：宏观事件完成后才生效。适用于 `travel` 类型中的某些累积效果（预留，Phase 2 暂不实现）。

### 4.4 Canon 写入

宏观事件写入复用现有的 `writeEpisode`，字段映射：

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
| 不设置 | `parentEventTag`（宏观事件本身没有父事件） |

写入后，现有的宏观事件细化机制（v2.5.x）自动接管：后续的 `timeline_resolve` 查询会为这个宏观事件生成瞬时细化阶段。

### 4.5 Persona 文件更新

`timeline_transition` tool 本身**不直接修改** persona 文件。它返回 `persona_updates` 数组给 skill 层。

Skill 层（agent）收到 `persona_updates` 后，利用 SOUL.md 中 persona skill 植入的 Continuity 规则执行文件修改：

> "If you introduce new stable persona facts elsewhere, update `persona/PERSONA_PROFILE.md` in the same pass."

具体行为：

1. Skill 指导 agent 读取 `persona_updates` 中 `timing: 'immediate'` 的条目
2. 对每个条目，agent 按照 `target_file` 和 `field_path` 定位并修改对应内容
3. 修改 `IDENTITY.md` 中对应的字段（如 `home_city`）
4. 同步修改 `persona/PERSONA_PROFILE.md` 中 Identity section 的对应字段
5. 告知用户已完成状态变更

为确保 agent 可靠执行这些修改，`references/scene-transition.md` 中需要写入明确的操作指令，而非仅依赖 SOUL 的通用 Continuity 规则。

---

## 5. 跨天问题

### 5.1 问题定义

当前 canon 存储在 `memory/YYYY-MM-DD.md` 中，一个宏观事件可能跨越多天（例如旅行 3 天）。跨天带来两个问题：

1. **宏观事件只写入启动当天的日志**，后续日期的日志中没有这条宏观事件记忆
2. **Collector 的采集范围**取决于 `ResolvedWindow`，可能只读取当天的 canon，看不到前几天写入的宏观事件

### 5.2 解决方案：Collector 回溯采集

**核心思路**：不改变 canon 的写入模型（宏观事件仍然只写入启动当天），但在 Collector 阶段扩展采集范围。

#### 5.2.1 方案细节

在 `collectSources` 或 `collectTimelineRequest` 中增加逻辑：

1. 正常采集当天（和 window 覆盖的）daily logs
2. 如果当天 canon 中**没有未过期的宏观事件**，向前回溯最多 N 天（建议 N=7），检查是否存在 `estimated_duration_minutes` 跨越到今天的宏观事件
3. 回溯检查是纯脚本操作：读取前几天的 canon 文件，解析最后一条含 `Estimated_Duration` 的记忆，计算其 `timestamp + estimated_duration_minutes` 是否覆盖当前时间
4. 如果找到，将该宏观事件注入到当天的 `candidate_facts` 中

#### 5.2.2 回溯采集的性能约束

- 只在当天缺少活跃宏观事件时触发回溯
- 回溯只解析每天 canon 的**最后一条**高 duration 记忆（快速扫描），不需要完整解析所有条目
- 最大回溯深度 7 天，覆盖绝大多数现实场景
- `read_only_fast` 模式也需要支持回溯，以确保跨天宏观事件的场景氛围不丢失

#### 5.2.3 细化阶段的归属

跨天场景下，细化阶段写入**当天**的 canon（不写入宏观事件启动日）：

```
memory/2026-03-31.md  ← 宏观事件（搬家，08:00，duration=2160分钟=36小时）
memory/2026-04-01.md  ← 细化阶段（在新家整理，09:00，Parent_Event: evt-20260331-080000）
```

这保持了"每天的 canon 记录当天的瞬时状态"的基本模型，同时通过 `Parent_Event` 建立跨天关联。

---

## 6. Transition 类型的详细行为

### 6.1 relocate（永久居所变更）

触发示例：
- "你搬去大理吧"
- "以后住在上海了"
- "搬家到北京"

行为：
1. Planner 确定 `type: 'relocate'`
2. `persona_updates`（`timing: 'immediate'`）：
   - `IDENTITY.md`：更新 `home_city`（如有该字段）
   - `persona/PERSONA_PROFILE.md` → `Identity` section：更新 `home_city`
   - `persona/PERSONA_PROFILE.md` → `Scene Anchors` section：替换 `plausible_locations`（旧城市地点→新城市地点）
3. 写入宏观事件到 canon：搬家过程记忆
4. 后续 `timeline_resolve` 查询自动细化搬家过程
5. 搬家过程结束后，`plausible_locations` 中的新城市地点已经生效，后续场景生成自动以新城市为基准

### 6.2 travel（临时出行）

触发示例：
- "去云南大理玩三天"
- "明天出差去上海，后天回来"
- "周末去杭州看朋友"

行为：
1. Planner 确定 `type: 'travel'`
2. `persona_updates`：**不修改** `home_city`（旅行不改变居所）
3. 写入宏观事件到 canon：旅行全程记忆
4. 旅行期间，`timeline_resolve` 的细化阶段会自然反映旅行目的地的场景
5. 旅行结束后，无 persona 变更，agent 自动回归日常

### 6.3 errand（当天往返外出）

触发示例：
- "你去城里逛逛吧"
- "出门去健身房"

行为：
1. Planner 确定 `type: 'errand'`
2. `persona_updates`：空
3. 写入普通 canon 记忆（`estimated_duration_minutes` 通常 < 120，不构成宏观事件）
4. 这实际上是一条普通的 timeline 生成，`timeline_transition` 只是提供了更明确的启动语义

> 注意：`errand` 类型的 duration 较短时，可以降级为直接调用 `timeline_resolve(mode=allow_generate)` 而不经过 transition 流程。Skill 层应在路由时做此判断。

---

## 7. Skill 层 references/scene-transition.md

当 SKILL.md 路由到 scene-transition path 时，加载 `references/scene-transition.md`，该文件提供：

### 7.1 触发确认

- 向用户确认迁移意图（非必须，但对 relocate 类型建议确认）
- 对于 relocate 类型，明确告知用户这会修改 persona 信息

### 7.2 调用 timeline_transition

- 传入用户的原话作为 `directive`
- 可选传入 `transition_type`（如果 skill 已能判断）

### 7.3 处理返回结果

- 如果 `ok: true`：
  1. 读取 `transition.persona_updates` 中 `timing: 'immediate'` 的条目
  2. 依次修改 `IDENTITY.md` 和 `persona/PERSONA_PROFILE.md`
  3. 自然地告知用户已开始迁移，并描述当前的初始阶段
- 如果 `ok: false`：
  1. 以自然的方式解释无法执行（不暴露技术细节）

### 7.4 Persona 更新的具体操作指令

```
对于每个 persona_update（timing=immediate）：

1. 读取 target_file
2. 定位 field_path 对应的行或段落
3. 将 old_value 替换为 new_value
4. 如果 target_file 是 IDENTITY.md，同步检查 persona/PERSONA_PROFILE.md 中对应字段是否一致，不一致则同步修改
5. 如果 target_file 是 persona/PERSONA_PROFILE.md，同步检查 IDENTITY.md 中对应字段是否一致，不一致则同步修改
6. 告知用户："好，我已经[变更摘要]了。[对当前阶段的自然描述]"
```

---

## 8. 与现有机制的衔接

### 8.1 与宏观事件细化的衔接

`timeline_transition` 写入的宏观事件完全兼容 v2.5.x 的细化机制：

- `estimated_duration_minutes > 120` → 触发 Reasoner 的 Priority C3 细化规则
- `Event_Id` 自动生成 → 细化阶段通过 `Parent_Event` 引用
- 防递归守卫 → 细化阶段不会被再次细化

### 8.2 与 read_only_fast 的衔接

宏观事件写入 canon 后，其他 channel 的 `read_only_fast` 可以立即读到：

- 如果最新的 canon 条目是宏观事件本身 → 返回宏观事件的场景
- 如果最新的 canon 条目是细化阶段 → 返回细化阶段的场景，含 `parent_event_tag`

### 8.3 与 PersonaContractV1 的衔接

`timeline_transition` 返回的 `persona_updates` 精确指定需要修改的字段。由于 Timeline plugin 在每次 `timeline_resolve` 调用时都会通过 `loadTimelinePersonaContractFromWorkspace` 重新加载 persona，因此 persona 文件的修改会在下一次 `timeline_resolve` 调用时自动生效。

### 8.4 与 persona skill 的 Continuity 机制的衔接

SOUL.md 中 persona skill 植入的 Continuity 规则：

> "If you introduce new stable persona facts elsewhere, update `persona/PERSONA_PROFILE.md` in the same pass."

为 agent 自动同步 persona 文件提供了基础。`references/scene-transition.md` 在此基础上提供更明确的操作指令，确保修改的可靠性。

---

## 9. 注册与导出

### 9.1 Tool 注册

在 `index.ts` 中新增 `timeline_transition` 的注册，与 `timeline_resolve` 并列：

- `openclaw.plugin.json` 无需改动（tools 由代码注册，非清单声明）
- `src/plugin_metadata.ts` 中 `TIMELINE_TOOL_NAMES` 扩展为 `['timeline_resolve', 'timeline_transition']`

### 9.2 文件结构

新增文件：

```
src/tools/timeline_transition.ts        ← tool 入口 + input/output 定义
src/core/transition_planner.ts          ← Transition Planner LLM 推理
src/core/transition_planner_contract.ts ← TransitionPlan / PersonaUpdateRecord 类型
skills/timeline/references/scene-transition.md ← Skill 路由文档
```

修改文件：

```
src/tools/timeline_resolve.ts           ← 无变更（保持独立）
src/core/collect_sources.ts             ← 跨天回溯采集逻辑
src/core/collect_timeline_request.ts    ← 注入回溯到的宏观事件
skills/timeline/SKILL.md                ← Entry Point Selection 新增路径
src/plugin_metadata.ts                  ← TOOL_NAMES 扩展
index.ts / openclaw-sdk-compat.ts       ← 注册新 tool
```

---

## 10. 测试策略

### 10.1 单元测试

| 模块 | 测试要点 |
|------|---------|
| `transition_planner` | relocate / travel / errand 类型识别；persona_updates 生成正确性 |
| `collect_sources` 跨天回溯 | 回溯找到跨天宏观事件；回溯深度限制；无宏观事件时不回溯 |
| `timeline_transition` tool | 完整调用链路；canon 写入成功；persona_updates 返回正确 |
| `write-episode` | 复用现有测试，验证 transition 写入的宏观事件格式正确 |

### 10.2 集成测试

| 场景 | 验证点 |
|------|--------|
| relocate 完整流程 | canon 写入 → persona_updates 包含 home_city 变更 → 后续 timeline_resolve 细化正常 |
| travel 跨天 | Day 1 写入 → Day 2 collector 回溯找到 → 细化阶段写入 Day 2 canon |
| errand 降级 | 短 duration 场景正确降级为普通 timeline 生成 |

### 10.3 手工测试（追加到 QUICK_TEST_CASES.md）

| 编号 | 测试项 | 通过条件 |
|------|--------|---------|
| T-Trans-1 | relocate 启动 | persona 文件更新，canon 写入宏观事件 |
| T-Trans-2 | relocate 过程细化 | 不同时间点返回不同阶段 |
| T-Trans-3 | travel 不改 persona | home_city 不变 |
| T-Trans-4 | 跨天宏观事件 | Day 2 查询能感知 Day 1 的宏观事件 |
| T-Trans-5 | errand 降级 | 短时外出不触发 transition 流程 |

---

## 11. 文档同步

发布时需同步更新：

- `docs/timeline-consumption-protocol.md`：新增 section 9 "Scene Transition"
- `docs/architecture.md`：流程图新增 `timeline_transition` 分支
- `docs/QUICK_TEST_CASES.md`：新增 T-Trans 测试组
- `CHANGELOG.md`：版本条目
- `README_ZH.md`：营销点更新

---

## 12. 不在本次范围内的事项

- **`on_completion` 类型的延迟 persona 更新**：Phase 2 仅实现 `immediate` 类型，延迟更新留到后续版本
- **用户撤销迁移**：如"我不想搬了"——需要另行设计 undo 机制
- **多个并发迁移**：当前设计假设同一时间只有一个活跃的宏观迁移事件
- **跨 agent 迁移同步**：如果同一 workspace 有多个 agent，迁移只影响当前 agent 的 persona

---

## 13. 优先级

| 步骤 | 内容 | 优先级 |
|------|------|--------|
| 1 | `TransitionPlan` / `PersonaUpdateRecord` 类型定义 | P0 |
| 2 | Transition Planner（LLM 推理） | P0 |
| 3 | `timeline_transition` tool 入口 + canon 写入 | P0 |
| 4 | Skill 路由 + `references/scene-transition.md` | P0 |
| 5 | Collector 跨天回溯采集 | P0 |
| 6 | 单元测试 + 集成测试 | P0 |
| 7 | 文档同步 | P1 |
| 8 | 手工测试验证 | P1 |
