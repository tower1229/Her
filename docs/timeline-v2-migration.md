# Timeline v2 Migration Notes

> Status: migration memo
> Audience: users familiar with the old prompt-era timeline skill

## 1. What changed conceptually

Timeline v2 moves responsibility from prompts to runtime code.

In v1-style usage, prompt files and templates carried much of the timeline logic.
In v2, the runtime owns:
- temporal window resolution;
- source ordering;
- fingerprint reuse vs generation;
- append-only writes;
- traceable diagnostics;
- repair/status tooling.

## 2. What was removed

The repository no longer centers around:
- root-level prompt-oriented skill files;
- template-heavy AGENTS / SOUL artifacts;
- legacy reference docs that described prompt-era behavior.

## 3. What replaced it

The new center of gravity is:
- `openclaw.plugin.json` + `index.ts` for plugin loading;
- `src/tools/timeline_resolve.ts` as the canonical temporal entrypoint;
- `src/tools/timeline_status.ts` and `src/tools/timeline_repair.ts` for operations;
- `src/core/` + `src/storage/` for deterministic runtime behavior.

## 4. What to expect operationally

Compared with the old prompt-era shape:
- writes are more constrained;
- diagnostics are more explicit;
- non-`now_today` generation is intentionally conservative;
- malformed logs can be inspected through a dedicated repair tool.

## 5. Migration advice

If you previously depended on prompt behavior:
1. start by routing temporal queries through the bundled skill;
2. verify current-status questions hit `timeline_resolve`;
3. inspect `timeline_status` after the first runs;
4. use `timeline_repair` before trusting old malformed logs;
5. review the release checklist before treating the plugin as production-ready.


## 6. Is empty-memory generation the same as v1?

At the **design-goal level, yes**: the runtime is supposed to do the same job as the old timeline system — when memory is blank, it should still produce a plausible, persona-consistent memory so OpenClaw can chat naturally and downstream skills can consume a coherent current state.

In the current v2 runtime, that means:
- generation happens only when `mode=allow_generate`;
- the runtime still prefers existing canon when parsed day-log episodes already exist;
- when blank-memory generation is needed, it now explicitly consults `SOUL`, `MEMORY`, `IDENTITY`, recent conversational anchors, and real-world time cues such as weekday / holiday / time of day;
- the generated result is meant to become part of the character's lived autobiographical reality rather than a throwaway placeholder.

So the correct compatibility statement is: **v2 should preserve v1's core generation purpose, but implement it through deterministic runtime code instead of prompt-only conventions.**

## 7. Did the structured output format change?

Yes — the answer is **partly yes, partly no**.

What stayed conceptually similar:
- the core payload is still a structured timeline result;
- the runtime still returns episode-oriented timeline data rather than free-form prose;
- the result still uses `schema_version: "1.0"` and `document_type: "timeline.window"` for the main window payload.

What changed:
- the tool now returns a stronger **envelope contract** with `ok`, `trace_id`, `resolution_summary`, `notes`, optional `trace`, and structured `error` data;
- the tool distinguishes `read_only_hit`, `generated_new`, and some draft fallback cases in the resolution summary;
- diagnostics and traceability are now part of the contract, not just implicit behavior;
- the response is explicitly shaped as a plugin tool contract rather than a prompt-era output convention.

In short: the **episode/window core remains recognizable**, but the **top-level tool response format has definitely changed** in order to support deterministic runtime behavior and operator diagnostics.
