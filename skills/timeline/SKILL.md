---
name: timeline
description: When a request asks about the current state, a specific past time, a past range, or a downstream skill needs time-state facts, enter the timeline skill first and pass the raw natural-language query to Timeline. Never answer from persona alone.
---

# Timeline

When a request is about time-state facts or recall, call Timeline first and then compose the reply. Do not guess from persona first, and do not read `memory/` directly and make your own conclusion.

## Scope

This skill does only two things:

1. Decide whether the request is a time-grounded reality question that Timeline should own.
2. Pass the user's exact wording, or the downstream skill's natural-language question, straight into `timeline_resolve`.

It does not generate facts directly, normalize time on its own, or bypass Timeline and answer directly.
When the target time lacks an existing fact, Timeline decides whether to generate and write.

## Hard Rules

1. For time-reality questions, call `timeline_resolve` first and answer second.
2. Do not answer "what are you doing now" or "what happened recently" from `SOUL.md`, `IDENTITY.md`, or `MEMORY.md` alone.
3. `SOUL` / `IDENTITY` / `MEMORY` help with interpretation and phrasing, but they cannot replace Timeline facts.
4. Do not rewrite the query into structured time parameters before the call.
5. Let Timeline own time classification and time normalization.
6. If `timeline_resolve` returns an existing fact, reuse it as-is.
7. If the user is doing ordinary conversation rather than strict read-only verification, Timeline may generate missing facts and write canon.

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

- “你在干嘛”
- “你现在在哪”
- “你现在什么状态”
- “你刚才不是在打球吗，现在还在吗”
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

- “昨晚八点你在做什么”
- “你昨天上午十点在哪”
- “你昨晚八点是不是还在看电视”
- “上周六晚上九点你在忙什么”

Handling:

- Call `timeline_resolve`
- Set `query` to the user's exact wording
- Do not normalize the time point yourself before passing it through

### Scenario C: A Past Range

Abstract shape:

- The user is asking about the overall state of a time range rather than a single point.
- The goal is to organize recall, an activity overview, or recent updates from that range.

Examples:

- “最近有什么有趣的事吗”
- “你最近都在忙什么”
- “这几天怎么样”
- “你今天都忙了什么”
- “昨晚在做什么”

Handling:

- Call `timeline_resolve`
- Set `query` to the user's exact wording
- Let Timeline's internal planner interpret natural-language ranges such as “最近”, “昨晚”, or “今天都”

## Reply Requirements

- Speak naturally to the user and do not mention `timeline_resolve`.
- Keep the tone human, like natural recall or present-moment description.
- If Timeline returns an empty window or a failure, do not pretend you have certain facts; phrase the answer cautiously from what is available.
- Do not output JSON unless the user explicitly asks for raw results.
