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
