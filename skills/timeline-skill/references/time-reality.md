# Time-Reality Path

Load this document when the `timeline-skill` skill has identified the current turn as a time-reality question.

## Scope

This path does only two things:

1. Decide whether the request is a time-grounded reality question that Timeline should own.
2. Pass the user's exact wording, or the downstream skill's natural-language question, straight into `timeline_resolve`.

It does not generate facts directly, normalize time on its own, or bypass Timeline and answer directly.
When the target time lacks an existing fact, Timeline decides whether to generate and write.

## Hard Rules

1. For time-reality questions, call `timeline_resolve` first and answer second.
2. Do not answer "what are you doing now" or "what happened recently" from `SOUL.md`, `IDENTITY.md`, `MEMORY.md`, or `persona/PERSONA_PROFILE.md` alone.
3. Do not bypass `timeline_resolve` by directly reading files under `memory/` to assemble an answer. Only Timeline results are the factual basis for time-reality questions.
4. Do not rewrite the query into structured time parameters before the call.
5. Let Timeline own time classification and time normalization.
6. If `timeline_resolve` returns an existing fact, reuse it as-is.
7. If the user is doing ordinary conversation rather than strict read-only verification, Timeline may generate missing facts and write canon.
8. Questions like "最近一次你知道自己错了是什么场景", "上一次你后悔是什么时候", or "最后一次改变主意是在什么时候" are timeline recall questions, not persona-only questions.
9. When uncertain between persona-only and episodic recall, prefer Timeline.

## Call Shape

Default path:

```json
{
  "query": "the user's exact words"
}
```

Do not pass time points, time ranges, request types, modes, or debug fields into `timeline_resolve`. Its public interface is the natural-language query.

## Scenarios

### Scenario A: Current State

Abstract shape:

- The user is asking about "right now" or the current short stretch of time.
- The goal is to answer where she is, what she is doing, or what state she is in.

Examples:

- "你在干嘛"
- "你现在在哪"
- "你现在什么状态"
- "你刚才不是在打球吗，现在还在吗"
- A downstream skill needs the current state, such as a selfie, scene description, or status card

Handling:

- Call `timeline_resolve`
- Set `query` to the user's exact wording
- Do not decide `now` yourself before calling

### Scenario B: A Specific Past Time

Abstract shape:

- The user is asking about a sufficiently specific point in time.
- The goal is to recall facts around that time anchor.

Examples:

- "昨晚八点你在做什么"
- "你昨天上午十点在哪"
- "你昨晚八点是不是还在看电视"
- "上周六晚上九点你在忙什么"

Handling:

- Call `timeline_resolve`
- Set `query` to the user's exact wording
- Do not normalize the time point yourself before passing it through

### Scenario C: A Past Range

Abstract shape:

- The user is asking about the overall state of a time range rather than a single point.
- The goal is to organize recall, an activity overview, or recent updates from that range.

Examples:

- "最近有什么有趣的事吗"
- "你最近都在忙什么"
- "这几天怎么样"
- "你今天都忙了什么"
- "昨晚在做什么"
- "最近一次你知道自己错了是什么场景"
- "上一次你后悔是什么时候"
- "最后一次改变主意是在什么时候"
- "最近一次你和别人和好是什么时候"
- "上一次你冷静下来是在什么情境里"

Handling:

- Call `timeline_resolve`
- Set `query` to the user's exact wording
- Let Timeline's internal planner interpret natural-language ranges such as "最近", "昨晚", or "今天都"
- When the user asks for the most recent occurrence of an event, still pass the raw wording through instead of shrinking it into your own paraphrase

### Scenario D: Borderline Or Ambiguous

Abstract shape:

- The wording could be read either as a stable trait question or as autobiographical recall.
- The user seems to be asking about lived experience, not abstract philosophy.

Examples:

- "你怎么收场的"
  If it refers to a just-mentioned lived event, Timeline
- "你一般会怎么收场"
  Usually not Timeline
- "你会认错吗"
  Usually not Timeline
- "你上一次认错是怎么认的"
  Timeline

Handling:

- Prefer the episodic reading when the wording points to a concrete occurrence
- Prefer Timeline when the previous turn has already established a time-grounded event
- If it is plainly a general-trait question, do not force Timeline

## Reply Requirements

- Speak naturally to the user and do not mention `timeline_resolve`.
- Keep the tone human, like natural recall or present-moment description.
- If Timeline returns an empty window or a failure, do not pretend you have certain facts; phrase the answer cautiously from what is available.
- Do not output JSON unless the user explicitly asks for raw results.
