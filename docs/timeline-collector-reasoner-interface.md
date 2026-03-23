# Timeline Collector / Reasoner 接口草案

> 状态：当前草案
> 目的：定义 Timeline 中 collector、LLM reasoner、runtime guard 三层之间的稳定接口
> 关联：`docs/timeline-north-star.md`、`docs/timeline-llm-runtime-boundary.md`、`docs/timeline-roadmap.md`

## 1. 为什么先定义接口

当前重构的关键不是继续微调某个模块，而是先把系统层次拆清楚。

后续 Timeline 应按下面三步工作：

1. collector 收集事实与候选集
2. LLM reasoner 做语义判断
3. runtime guard 验证并执行

这份文档定义的就是这三步之间传什么，不传什么。

## 2. 核心原则

### 2.1 collector 不做语义裁决

collector 可以：
- 读取数据源
- 解析 markdown
- 归一化时间窗口
- 输出候选 facts

collector 不可以：
- 判断哪条 fact 最相关
- 判断某个活动是否仍在持续
- 判断用户到底在问当前状态还是近期回忆
- 判断是否应该生成

### 2.2 reasoner 不直接写盘

reasoner 只负责给出结构化判断结果。
它不能直接改 memory，也不能直接跳过 runtime guard。

### 2.3 guard 不补做语义判断

guard 只负责验证：
- 是否违反硬事实
- 输出结构是否合法
- 是否允许写盘

guard 不能在 reasoner 失败后自己补做“差不多的判断”。

## 3. Collector 输入

collector 的输入来自 `timeline_resolve` 的 runtime 上下文。

```ts
interface TimelineCollectorRequest {
  request_id: string;
  user_query?: string;
  target_time_range: 'now_today' | 'recent_3d' | 'explicit' | 'natural_language';
  start?: string;
  end?: string;
  reason: 'current_status' | 'past_recall' | 'compaction_flush' | 'heartbeat' | 'snapshot' | 'debug';
  now: string;
  timezone: string;
}
```

## 4. Collector 输出

collector 的目标不是输出结论，而是输出供 reasoner 判断的完整事实包。

```ts
interface TimelineCollectorOutput {
  schema_version: '1.0';
  request_id: string;
  request: {
    user_query?: string;
    target_time_range: 'now_today' | 'recent_3d' | 'explicit' | 'natural_language';
    reason: 'current_status' | 'past_recall' | 'compaction_flush' | 'heartbeat' | 'snapshot' | 'debug';
  };
  anchor: {
    now: string;
    timezone: string;
  };
  window: {
    preset: 'now_today' | 'recent_3d' | 'explicit';
    start: string;
    end: string;
    calendar_dates: string[];
  };
  source_order: string[];
  hard_facts: {
    sessions_history: string[];
  };
  canon_memory: {
    daily_logs: Array<{
      calendar_date: string;
      raw_content: string;
      parsed_episodes: ParsedTimelineEpisode[];
    }>;
  };
  semantic_memory: {
    memory_search: string[];
  };
  persona_context: {
    soul: string;
    memory: string;
    identity: string;
  };
  candidate_facts: Array<CollectedTimelineFact>;
}
```

其中 `candidate_facts` 是给 reasoner 的候选事实池，不是已选中的结论。

```ts
interface CollectedTimelineFact {
  fact_id: string;
  source_type: 'canon_daily_log';
  calendar_date: string;
  timestamp: string;
  location: string;
  action: string;
  emotion_tags: string[];
  appearance: string;
  internal_monologue?: string;
  natural_text?: string;
  parse_level: 'A' | 'B';
  confidence: number;
}
```

## 5. 什么信息不该由 collector 提前算好

collector 不应提前给出这些字段：

- `selected_fact_id`
- `is_continuing`
- `should_generate`
- `request_type`
- `best_match_reason`

这些都属于 LLM reasoner 的职责。

## 6. Reasoner 输入

reasoner 输入就是整个 collector 输出。

可以把它理解成：

> Timeline runtime 已经把所有可用事实按秩序收集好了，现在请 LLM 在这些事实与 persona 上下文之上做结构化判断。

## 7. Reasoner 输出

reasoner 的返回必须是结构化 JSON，而不是自然语言。

```ts
interface TimelineReasonerOutput {
  schema_version: '1.0';
  request_id: string;
  request_type: 'current_status' | 'recent_recall' | 'explicit_past' | 'continuity_followup';
  decision: {
    action: 'reuse_existing_fact' | 'generate_new_fact' | 'return_empty';
    selected_fact_id?: string;
    should_write_canon: boolean;
  };
  continuity: {
    judged: boolean;
    is_continuing?: boolean;
    reason?: string;
  };
  rationale: {
    summary: string;
    hard_fact_basis: string[];
    canon_basis: string[];
    persona_basis: string[];
    uncertainty?: string;
  };
  generated_fact?: {
    location: string;
    action: string;
    emotionTags: string[];
    appearance: string;
    internalMonologue: string;
    naturalText: string;
    confidence: number;
    reason: string;
  };
}
```

## 8. Reasoner 输出语义

### 8.1 `reuse_existing_fact`

表示 reasoner 判断已有候选事实已经足够回答当前问题。

它必须返回：
- `selected_fact_id`
- `should_write_canon = false`

### 8.2 `generate_new_fact`

表示 reasoner 判断当前问题没有足够事实命中，需要生成新的 timeline fact。

它必须返回：
- `generated_fact`
- `should_write_canon = true` 或 `false`

### 8.3 `return_empty`

表示当前问题不应强行生成，也不应错误复用。

这个分支应极少出现，通常只用于：
- 输入严重不足
- persona 上下文不足以支持可信生成
- 请求本身并不适合被 Timeline 解释成事实问题

## 9. Guard 输入

guard 的输入由两部分组成：

1. `TimelineCollectorOutput`
2. `TimelineReasonerOutput`

guard 负责验证：

- reasoner 是否引用了不存在的 `selected_fact_id`
- 是否违反会话硬事实
- 是否试图改写既有 canon
- `generated_fact` 结构是否完整
- 是否允许写盘

## 10. Guard 输出

guard 的输出不是新的语义判断，而是执行许可。

```ts
interface TimelineGuardResult {
  ok: boolean;
  outcome: 'reuse_existing_fact' | 'generate_new_fact' | 'return_empty' | 'blocked';
  selected_fact_id?: string;
  validated_generated_fact?: {
    location: string;
    action: string;
    emotionTags: string[];
    appearance: string;
    internalMonologue: string;
    naturalText: string;
    confidence: number;
    reason: string;
  };
  write_allowed: boolean;
  block_reason?: string;
}
```

## 11. `timeline_resolve` 最终如何使用这套接口

未来 `timeline_resolve` 应收敛成下面的主流程：

1. 校验输入
2. 解析硬时间窗口
3. collector 收集事实与候选集
4. 调用 reasoner 做结构化判断
5. guard 验证 reasoner 结果
6. 若允许则写盘
7. 返回 `timeline.window`
8. 记录 trace / status

## 12. 对当前代码重构的直接要求

按这份接口草案，当前代码后续需要变成：

- `resolve_window.ts`
  只保留硬时间窗口归一化，不再扩展自然语言语义判断

- `map_window.ts`
  不再负责“选择哪条 episode 最相关”

- `select_episode.ts`
  不应继续作为最终 selector；后续应改造成候选集整理器，或被 collector 模块替代

- `timeline_resolve.ts`
  从“自己做大部分决策”改成“协调 collector / reasoner / guard / writer”

## 13. 一句话总结

> Timeline runtime 的正确方向，不是让脚本逐步变聪明，而是让脚本把事实准备好，再让 LLM 在受约束的接口里做真正的时间语义判断。
