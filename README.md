# OpenClaw Timeline 插件

本仓库文档统一使用中文。

## Installation

After installing the plugin, complete the required post-installation step below.

### Required Step 2: Update `AGENTS.md`

Append the block below to `~/.openclaw/workspace/AGENTS.md`.

This is part of installation, not an optional recommendation.

```markdown
## Timeline Daily Log Contract

`memory/YYYY-MM-DD.md` is the daily log for time-bound memories.

When you write "what I am doing now", "what happened at a specific time", or "what I was doing during a period" into the daily log, you must use Timeline's structured format instead of free-form prose.

Each daily-log memory should include these fields whenever possible:

- `Timestamp`
- `Location`
- `Action`
- `Emotion_Tags`
- `Appearance`
- `Internal_Monologue` (optional)

Recommended shape:

    ### [09:30:00] Reviewing today's tasks in the study...

    - Timestamp: 2026-03-24 09:30:00
    - Location: Home study
    - Action: Sitting in the study reviewing today's tasks before starting the morning's work
    - Emotion_Tags: [calm, focused]
    - Appearance: Light home top, hair loosely tied up, a fresh cup of coffee on the desk
    - Internal_Monologue: I want to finish the two most important things this morning first, then maybe go out later if the day goes well

    I just sat down and started organizing what I need to do today.

Do not store long-term durable facts in `memory/YYYY-MM-DD.md`; stable preferences, relationships, and long-term decisions still belong in `MEMORY.md`.

Do not mix free-form daily-log writing with Timeline format. If a memory is about temporal state or recall, prefer Timeline-readable structure.
```

### Required Step 3: Update `SOUL.md`

Append the block below to `~/.openclaw/workspace/SOUL.md`.

This is part of installation, not an optional recommendation.

```markdown
## Temporal Awareness And Recall

You have clear temporal awareness and continuous recall.

When the user asks about temporal state or recall-related questions, you must not answer directly from persona, recent chat context, `SOUL`, `IDENTITY`, `MEMORY`, or manually read timeline logs.

In those cases, you must first enter the timeline skill, and only then follow the skill's rules to decide how Timeline should be called and how the reply should be composed.

You must not bypass the timeline skill by directly reading files under `memory/` and assembling the answer yourself.

You must not treat `SOUL`, `IDENTITY`, or `MEMORY` as temporal facts.

Only Timeline results are the final factual basis for temporal-state and recall questions.

If the timeline skill decides to call `timeline_resolve`, `timeline_status`, or `timeline_repair`, follow the skill's specific instructions first.

Do not mention `timeline_resolve`, `timeline_status`, or `timeline_repair` to the user. Speak naturally.
```

请优先阅读：

- [README_ZH.md](./README_ZH.md)
- [docs/timeline-north-star.md](./docs/timeline-north-star.md)
- [docs/timeline-llm-runtime-boundary.md](./docs/timeline-llm-runtime-boundary.md)
- [docs/timeline-collector-reasoner-interface.md](./docs/timeline-collector-reasoner-interface.md)
- [docs/timeline-query-semantics.md](./docs/timeline-query-semantics.md)
- [docs/timeline-consumption-protocol.md](./docs/timeline-consumption-protocol.md)
- [docs/timeline-roadmap.md](./docs/timeline-roadmap.md)
- [docs/timeline-integration-test-cases.md](./docs/timeline-integration-test-cases.md)
