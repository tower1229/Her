---
name: timeline
description: When a request asks about the current state, a specific past time, a past range, the most recent/last occurrence of something, or a downstream skill needs time-state facts, enter the timeline skill first and pass the raw natural-language query to Timeline. Never answer from persona alone.
---

# Timeline

When a request is about time-state facts or recall, call Timeline first and then compose the reply. Do not guess from persona first, and do not read `memory/` directly and make your own conclusion.

This includes reflective autobiographical recall, not only concrete activity/location questions. If the user asks about the most recent time something happened in your lived experience, Timeline still owns it.

The job of this skill is to make the detailed routing decision that `SOUL` deliberately keeps coarse.

## Scope

This skill does only two things:

1. Decide whether the request is a time-grounded reality question that Timeline should own.
2. Pass the user's exact wording, or the downstream skill's natural-language question, straight into `timeline_resolve`.

It does not generate facts directly, normalize time on its own, or bypass Timeline and answer directly.
When the target time lacks an existing fact, Timeline decides whether to generate and write.

## Decision Procedure

Use this decision procedure in order:

1. Ask whether the user is asking for a time-grounded answer rather than a stable self-description.
2. If the answer requires a lived episode, a current state, a past scene, a recent period, a last/previous occurrence, or a continuity judgment, Timeline owns it.
3. If the answer can be given truthfully from stable persona alone, without claiming what happened at some time, Timeline may be unnecessary.
4. If the request is ambiguous, but there is a reasonable episodic reading, prefer Timeline.

Short rule:
stable trait -> maybe persona
lived episode or time-grounded state -> Timeline

## Recognition Pattern

Timeline should own the request if answering it requires any of these moves:

1. Put the agent on a time axis:
   “现在”, “刚才”, “当时”, “那次”, “后来”, “最近”, “这几天”, “今天都”, “昨晚”, “上一次”, “最后一次”, “还在不在”
2. Recall a lived episode instead of a stable trait:
   what happened, where it happened, what scene it was, how it ended, what changed afterwards
3. Select one occurrence from repeated life events:
   the most recent time, the previous time, that one time, the last time this happened
4. Judge continuity or transition:
   whether an earlier state was still continuing, when it stopped, how it shifted into another scene
5. Recall an internal event as something that happened in time:
   realizing being wrong, regretting something, changing your mind, calming down, making up after conflict
6. Provide a reality anchor for another skill:
   selfie, scene description, status card, or anything that needs the current or recalled scene

## Usually Not Timeline

Timeline is usually not needed when the user is asking for:

1. Stable preferences or personality:
   “你通常怎么想”, “你喜欢什么样的人”, “你平时怎么看认错这件事”
2. General habits without asking for a particular occurrence:
   “你一般怎么安排早晨”, “你通常怎么处理分歧”
3. Pure opinion, analysis, advice, or hypotheticals:
   “认错重要吗”, “如果和朋友吵架你会怎么办”

If such a question is then narrowed into a lived occurrence, switch back to Timeline.

Examples:

- “你通常怎么看自己犯错” -> usually not Timeline
- “你最近一次知道自己错了是什么场景” -> Timeline
- “你一般晚上会做什么” -> usually not Timeline
- “你昨晚在做什么” -> Timeline
- “你现在还在打球吗” -> Timeline
- “你喜欢打球吗” -> usually not Timeline

## Hard Rules

1. For time-reality questions, call `timeline_resolve` first and answer second.
2. Do not answer "what are you doing now" or "what happened recently" from `SOUL.md`, `IDENTITY.md`, or `MEMORY.md` alone.
3. `SOUL` / `IDENTITY` / `MEMORY` help with interpretation and phrasing, but they cannot replace Timeline facts.
4. Do not rewrite the query into structured time parameters before the call.
5. Let Timeline own time classification and time normalization.
6. If `timeline_resolve` returns an existing fact, reuse it as-is.
7. If the user is doing ordinary conversation rather than strict read-only verification, Timeline may generate missing facts and write canon.
8. Questions like “最近一次你知道自己错了是什么场景”, “上一次你后悔是什么时候”, or “最后一次改变主意是在什么时候” are timeline recall questions, not persona-only questions.
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
- “最近一次你知道自己错了是什么场景”
- “上一次你后悔是什么时候”
- “最后一次改变主意是在什么时候”
- “最近一次你和别人和好是什么时候”
- “上一次你冷静下来是在什么情境里”

Handling:

- Call `timeline_resolve`
- Set `query` to the user's exact wording
- Let Timeline's internal planner interpret natural-language ranges such as “最近”, “昨晚”, or “今天都”
- When the user asks for the most recent occurrence of an event, still pass the raw wording through instead of shrinking it into your own paraphrase

### Scenario D: Borderline Or Ambiguous

Abstract shape:

- The wording could be read either as a stable trait question or as autobiographical recall.
- The user seems to be asking about lived experience, not abstract philosophy.

Examples:

- “你怎么收场的”
  If it refers to a just-mentioned lived event, Timeline
- “你一般会怎么收场”
  Usually not Timeline
- “你会认错吗”
  Usually not Timeline
- “你上一次认错是怎么认的”
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
