---
name: timeline-skill
description: Entered every conversation turn. Decides whether to handle a time-grounded question, handle a state transition, or exit immediately. Never answer time-grounded questions from persona alone.
metadata:
  openclaw:
    always: true
---

# Timeline-Skill

This skill is entered at the start of every conversation turn. It makes one routing decision and exits quickly when no action is needed.

## Entry Point Selection

Evaluate the current turn in this order. For the **first** path that matches, load only that path's reference and execute it (tools, persona follow-up, then natural reply). If none match, exit immediately.

1. **Time-reality question** — the user's message requires placing yourself on a time axis, recalling a lived episode, selecting one occurrence from repeated events, judging continuity or transition, or providing a reality anchor for a downstream skill. Load and follow `references/time-reality.md`.
2. **State transition** — the user's **intent** is to change **canon**: a new place, embodied activity, or **substantive ongoing task** (see **Substantive ongoing task** below). Mood of the sentence does not matter (command, suggestion, invite, or question). Load and follow `references/scene-transition.md`.
3. **No Timeline action** — if neither of the paths above applies, exit immediately and continue the conversation without calling Timeline.

Do not mention `timeline_resolve` or `timeline_transition` to the user. Speak naturally.

### Injected Timeline Prompt Context

The current turn may already include injected timeline prompt context from `before_prompt_build`.

- If a **current-state** question is being asked and the injected context is marked `active_instant` with `direct_current_state_answers_allowed: yes`, you may answer directly from that context without calling `timeline_resolve`.
- If the injected context is `active_macro_background`, `empty_window`, or `degraded`, a concrete current-state question still requires `timeline_resolve`.
- Past recall, reflective recall, and continuity-judgment questions still require `timeline_resolve` even when injected context exists.

### Time-Reality Trigger

The request is a time-reality question if answering it truthfully requires any of these moves:

- Locating yourself on a time axis: "现在", "刚才", "当时", "那次", "后来", "最近", "这几天", "今天都", "昨晚", "上一次", "最后一次", "还在不在"
- Recalling a lived episode rather than a stable trait: what happened, where it was, what scene, how it ended, what changed afterwards
- Selecting one occurrence from repeated life events: the most recent time, the previous time, that one time
- Judging whether an earlier state continued, when it stopped, or how it shifted
- Recalling an internal event as something that happened in time: realizing being wrong, regretting, changing your mind, calming down
- Providing a reality anchor for another skill: selfie, scene description, status card

The request is **not** a time-reality question if it is about stable preferences, general habits without asking for a specific occurrence, or pure opinion/advice/hypotheticals. If such a question is then narrowed into a lived occurrence, it becomes a time-reality question.

Examples:

- "你通常怎么看自己犯错" → not time-reality
- "你最近一次知道自己错了是什么场景" → time-reality
- "你一般晚上会做什么" → not time-reality
- "你昨晚在做什么" → time-reality
- "你现在还在打球吗" → time-reality
- "你喜欢打球吗" → not time-reality

When uncertain, prefer the episodic reading.

### State Transition Trigger

Use path 2 when the primary communicative goal is to **move your committed timeline**—not when the user only wants a **read** of the current anchor.

**IMPORTANT**: If a turn contains a directive or proposal for a new activity, location, or task, it MUST use Path 2, even if an `active_instant` prompt context is already available. Do not let "knowing what you are doing now" prevent you from transitioning to what was just requested.

**Counts as a state transition** (illustrative):

- New location, travel, or joint movement: "let's go for a walk", "陪我出去走走", "come over here"
- New or swapped embodied activity or life-task: "go shower", "pack your bags", "time to sleep", "你去跑步吧", "换份工作"

**Does not count** (handle via path 1 or normal chat):

- **Current-state only**: "what are you doing now", "现在在干嘛" → path 1 (time-reality), not path 2
- **Meta** about skills or prior turns ("did that count as a transition?") with **no** new scene directive
- **Pure hypotheticals** or fiction that never instruct you to adopt a new canon scene—no "do this now" embedded in the turn

**Hypothetical bundled with a directive** still counts as path 2: the hypothetical is framing; the directive commits scene. Example: "假如你已到家了，现在去洗个澡" → run the transition path for the directed action.

### Substantive ongoing task

**Substantive** here is an **operational** stab at stability, not a perfect ontology: treat an activity as substantive when it would **occupy the body or a narratable stretch of time** in canon—resting postures ("lying on the couch"), sleep, travel, chores, work, exercise, **driving** as the primary activity (even if a secondary action like a phone call happens), and similar beats. **Not** substantive: a single **instant** gesture with no sustained scene ("blink", "take one step" with no follow-through) **unless** the user clearly uses it to **re-anchor** a new scene. Borderline micro-acts (e.g. heat food, cross the room): still **prefer path 2** when the user is steering your lived state; let `timeline_transition` compress or reject.

### Disambiguation rules (who acts when the subject is vague)

Companion turns sometimes omit **你** / **我** ("要不去睡一会儿？"). Use this order:

1. **Clear user-only**: the line is explicitly about the **user's** body or plans and not yours (e.g. "我要先去睡了" with no ask toward you) → **not** path 2.
2. **Clear you or joint**: second-person **你**, imperatives toward you, or **let's** / **陪我** joint movement → evaluate as path 2 when it changes your embodied scene.
3. **Still ambiguous**: default to **whatever thread focus last treated as your** next embodied beat; if there is no cue, call `timeline_transition` with the user's **exact** wording and let the tool accept, reject, or adjust—do not guess silently or block the turn.

If both path 1 and path 2 seem relevant, **prefer path 1** when the user is mainly asking *where/when/what happened*; **prefer path 2** when they are mainly *proposing or demanding a new lived scene going forward*.
