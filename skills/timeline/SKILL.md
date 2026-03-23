---
name: timeline
summary: Route temporal queries to the canonical timeline_resolve tool.
---

# timeline (v2 bundled skill draft)

## When to use this skill

Use this skill whenever the user asks about:
- what you are doing right now;
- what you were doing recently;
- where you were at a specific past time;
- timeline continuity across the current or recent day(s).

## Primary rule

When the request is temporal, call `timeline_resolve` before providing factual activity details.
Do not simulate timeline logic from memory-writing prompts alone.

## What this skill is responsible for

- detecting temporal intent;
- selecting the correct `timeline_resolve` input shape;
- grounding the reply in tool output;
- keeping natural-language replies aligned with the returned facts;
- treating generated blank-memory states as the character's lived reality once timeline has resolved them.

## What this skill is NOT responsible for

Do not implement the following in prompt logic:
- soft-fingerprint deduplication;
- appearance inheritance;
- append-only write validation;
- hard-anchor enforcement.

Those belong to the runtime tool implementation.

## Suggested tool call patterns

### Current status

```json
{
  "target_time_range": "now_today",
  "mode": "allow_generate",
  "reason": "current_status",
  "trace": true
}
```

### Recent recall

```json
{
  "target_time_range": "recent_3d",
  "mode": "read_only",
  "reason": "past_recall",
  "trace": true
}
```

### Explicit past window

```json
{
  "target_time_range": "natural_language",
  "query": "where were you yesterday afternoon",
  "mode": "read_only",
  "reason": "past_recall",
  "trace": true
}
```


## Where the generation logic actually lives

The bundled skill only does **routing and calling**. The actual blank-memory generation logic lives in the runtime code:

- `src/tools/timeline_resolve.ts`
  - decides when generation should happen (`mode=allow_generate` and no reusable canon hit);
  - loads `SOUL`, `MEMORY`, and `IDENTITY` through runtime dependencies;
  - prefers an injected model-backed generation path when available, then writes the generated canon entry through the append-only writer.
- `src/core/generation_prompt.ts`
  - builds the semantic generation prompt that packages `SOUL` / `MEMORY` / `IDENTITY`, recent anchors, and real-world time context for an LLM.
- `src/core/infer_candidate.ts`
  - provides the fallback heuristic materialization path and the normalization / validation layer that turns a generated draft into a timeline episode.
- `src/core/collect_sources.ts`
  - collects the source context used by generation, including `sessions_history`, `memory_get`, `memory_search`, and the core persona files.

So if you are looking for the **generation algorithm itself**, read `src/tools/timeline_resolve.ts` and `src/core/generation_prompt.ts` first; `src/core/infer_candidate.ts` is the fallback / materialization layer.

## Design intent reminder

Timeline is not just a logging helper. Its purpose is to let OpenClaw feel like a person with continuous autobiographical recall.
When memory is blank, `timeline_resolve` should still supply a plausible, persona-consistent current or recent state by grounding itself in `SOUL`, `MEMORY`, `IDENTITY`, recent conversation anchors, and real-world time context.
That grounded state may then be used naturally in casual chat or by downstream consumers such as selfie-generation skills.
