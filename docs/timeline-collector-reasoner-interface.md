# Timeline Collector / Reasoner 接口规范

> 状态：当前有效
> 目的：定义 Timeline 当前主路径中 collector、LLM reasoner、runtime guard 之间的稳定接口
> 关联：[timeline-north-star.md](/Users/zangtao/Workspace/tower1229/Her/docs/timeline-north-star.md)、[timeline-query-semantics.md](/Users/zangtao/Workspace/tower1229/Her/docs/timeline-query-semantics.md)、[timeline-llm-runtime-boundary.md](/Users/zangtao/Workspace/tower1229/Her/docs/timeline-llm-runtime-boundary.md)

## 1. 主路径分层

当前 Timeline 主路径固定为四层：

1. `timeline_resolve` 接收查询并协调流程
2. collector 收集事实源并整理候选集
3. LLM reasoner 做时间语义判断与事实决策
4. runtime guard 校验 reasoner 输出，再决定是否进入 writer

其中：

- collector 不做语义裁决
- reasoner 不直接写盘
- guard 不补做语义推理

## 2. 查询语义与收集范围

Timeline 内部查询语义只有三类：

- `now`
- `past_point`
- `past_range`

当前 `timeline_resolve` 的外部输入已经收敛为语义型字段：

```ts
target_time_range: 'now' | 'past_point' | 'past_range'
```

对 `past_point / past_range` 来说，上游应尽量提供结构化时间；如果还没有结构化时间，则由 Timeline 内部的 LLM query planner 先归一化，再交给 collector 和 reasoner。归一化结果体现在：

- `window.semantic_target`
- `window.collection_scope`

例如：

- “你在干嘛” -> `semantic_target = now`
- “昨晚八点你在做什么” -> `target_time_range = past_point`，再由 planner 或上游归一化出 `normalized_point`
- “昨晚在做什么” -> `target_time_range = past_range`，再由 planner 或上游归一化出 `normalized_start / normalized_end`
- “最近有什么有趣的事吗” -> `target_time_range = past_range`，再由 planner 或上游归一化出具体范围

## 3. Collector 输入

collector 的直接输入来自 `timeline_resolve` 与已归一化的窗口：

```ts
interface TimelineCollectorInput {
  request_id: string;
  input: TimelineResolveInput;
  window: ResolvedWindow;
  sources: CollectedSources;
}
```

其中：

- `TimelineResolveInput` 仍保留外部请求形态
- `ResolvedWindow` 提供归一化后的时间语义
- `CollectedSources` 提供 sessions history、daily logs、memory search、persona 上下文

## 4. Collector 输出

collector 的目标不是给出结论，而是产出供 reasoner 判断的结构化事实包。

当前代码中的稳定输出如下：

```ts
interface TimelineCollectorOutput {
  schema_version: '1.0';
  request_id: string;
  request: {
    user_query?: string;
    target_time_range: 'now' | 'past_point' | 'past_range';
    reason: string;
    mode: 'read_only' | 'allow_generate';
  };
  anchor: {
    now: string;
    timezone: string;
  };
  window: {
    query_range: 'now' | 'past_point' | 'past_range';
    semantic_target: string;
    collection_scope: string;
    start: string;
    end: string;
    calendar_dates: string[];
    normalization_notes?: string[];
  };
  source_order: string[];
  hard_facts: {
    sessions_history: string[];
  };
  canon_memory: {
    daily_logs: Array<{
      calendar_date: string;
      raw_content: string;
      parsed_episode_count: number;
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
  candidate_facts: CollectedTimelineFact[];
}
```

`candidate_facts` 是候选事实池，不是已选中的答案。

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
  parse_level: 'A' | 'B';
  confidence: number;
}
```

## 5. Collector 明确不做的事

collector 不应提前计算这些结论：

- 哪条候选事实最相关
- 是否属于连续性覆盖
- 是否应生成
- “最近”里哪件事更值得提
- “有趣”“轻松”“忙”这类语义筛选结果

这些都属于 reasoner 职责。

## 6. Reasoner 输入

reasoner 输入就是完整的 `TimelineCollectorOutput`。

可以理解成：

> runtime 已经按固定顺序收集好了事实、候选集、persona 和时间锚点，现在由 LLM 负责判断查询类型、事实命中、连续性和是否需要生成。

## 7. Reasoner 输出

当前代码中的稳定返回结构如下：

```ts
interface TimelineReasonerOutput {
  schema_version: '1.0';
  request_id: string;
  request_type: 'now' | 'past_point' | 'past_range';
  time_interpretation?: {
    normalized_kind: 'now' | 'point' | 'range';
    normalized_point?: string;
    normalized_start?: string;
    normalized_end?: string;
    match_strategy?: 'exact_match' | 'continuation' | 'range_summary' | 'generated';
    summary: string;
  };
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
    timestamp?: string;
    location: string;
    action: string;
    emotionTags: string[];
    appearance: string;
    internalMonologue: string;
    confidence: number;
    reason?: string;
  };
}
```

## 8. Reasoner 输出语义要求

### 8.1 `request_type`

只允许：

- `now`
- `past_point`
- `past_range`

连续性不是第四类 `request_type`，而是 `now` 或 `past_point` 查询中的推理策略。

### 8.2 `time_interpretation`

用于记录 reasoner 是怎样理解用户时间语义的，包括：

- 归一化到时间点还是时间范围
- 采用精确命中、连续性覆盖、范围摘要还是生成
- 对“昨晚”“最近”“今晚八点”这类口语表达的解释

### 8.3 `reuse_existing_fact`

表示已有候选事实足以回答问题。

必须满足：

- `selected_fact_id` 存在于 `candidate_facts`
- `should_write_canon = false`

### 8.4 `generate_new_fact`

表示候选事实不足，需要新建 Timeline fact。

必须满足：

- `generated_fact` 完整
- `should_write_canon = true`
- 如查询是 `past_point` 或 `past_range`，优先提供合理的过去 `timestamp`

### 8.5 `return_empty`

表示当前请求既不应错误复用，也不应勉强生成。

这个分支应尽量少见，只用于：

- 输入严重不足
- persona 上下文无法支撑可信生成
- 当前请求本身不应被解释为时间事实查询

## 9. Guard 输入与职责

guard 的输入固定为：

1. `TimelineCollectorOutput`
2. `TimelineReasonerOutput`

guard 负责验证：

- `request_id` 是否一致
- `selected_fact_id` 是否真实存在于候选集中
- `generated_fact` 结构是否完整
- 在 `read_only` 模式下是否错误请求生成
- 是否具备 canon 写入许可

guard 不负责：

- 自己选一条“差不多的候选事实”
- 自己推理活动是否持续
- 在 reasoner 失败后补做生成

## 10. Guard 输出

当前 guard 的执行许可结构如下：

```ts
interface TimelineGuardResult {
  ok: boolean;
  outcome: 'reuse_existing_fact' | 'generate_new_fact' | 'return_empty' | 'blocked';
  selected_fact?: CollectedTimelineFact;
  selected_episode?: ParsedEpisode;
  generated_fact?: TimelineGeneratedDraft;
  write_allowed: boolean;
  block_reason?: string;
}
```

如果 `outcome = blocked`，主流程应停止，不得偷偷降级到脚本 heuristics。

## 11. Writer 接入要求

writer 不直接接 collector，也不直接接 reasoner。

writer 只能消费经 guard 验证后的 `generated_fact`，并继续负责：

- append-only 写入
- 目标日期选择
- 锁与冲突处理
- trace 与 status 记录

## 12. 对下游的影响

这份接口规范保障的是 Timeline 内部职责边界。

对聊天层、selfie skill 等下游消费者，稳定消费入口不是 `candidate_facts` 或 `reasoner` 原始字段，而是 `timeline_resolve` 最终返回中的：

- `result.window`
- `result.consumption`

其中 `result.consumption.selfie_ready` 是当前为下游技能准备的稳定现实锚点。
