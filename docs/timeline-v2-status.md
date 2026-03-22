# Timeline v2 Status Review and Next-Step Plan

> Status: working memo
> Purpose: reconcile the v2 design docs with the code currently in the repository
> Audience: maintainers planning the next implementation phase

## 1. Executive Summary

Timeline v2 is **no longer only a design concept**.

The repository now contains:
- a plugin skeleton;
- a bundled timeline skill;
- a canonical `timeline_resolve` runtime entrypoint;
- deterministic read-only retrieval logic;
- a conservative generated-new path with append-only writes;
- lifecycle hook helpers for flush / snapshot / audit;
- canonical path hardening and lock-based write protection;
- passing unit/integration tests for the current implementation slice.

However, v2 is still **mid-flight**, not finished.

The current implementation is best described as:

> **Milestone 1 complete, Milestone 2 complete, Milestone 3 partially complete,
> Milestone 4 partially complete, Milestone 5 started but not finished.**

## 2. How to read the current state

The original v2 documentation described a target architecture with:
- plugin + bundled skill;
- deterministic runtime pipeline;
- append-only canon writes;
- lifecycle hooks;
- single-writer hardening;
- observability and traceability;
- phased migration away from prompt-heavy AGENTS / SOUL dependence.

The codebase now implements a meaningful subset of that plan, but still contains
several placeholders, simplifications, and local stand-ins for future production work.

## 3. What is already implemented

### 3.1 Plugin / packaging layer

Implemented:
- `openclaw.plugin.json`
- `index.ts`
- local `src/openclaw-sdk-compat.ts` compatibility facade
- bundled skill at `skills/timeline/SKILL.md`

Meaning:
- the repository now has a concrete plugin-oriented shape;
- temporal routing is no longer only described in docs;
- the v2 skill has been simplified toward routing behavior.

### 3.2 Canonical runtime entrypoint

Implemented:
- `src/tools/timeline_resolve.ts`

Meaning:
- timeline resolution now has a single code entrypoint;
- runtime dependencies can be injected for tests;
- the code no longer depends purely on prompt simulation.

### 3.3 Deterministic read-only path

Implemented:
- `src/core/resolve_window.ts`
- `src/core/collect_sources.ts`
- `src/core/map_window.ts`
- `src/core/trace.ts`

Meaning:
- temporal queries can now be normalized to a window;
- source collection order is explicit in code;
- existing Markdown entries can be parsed and mapped into a `timeline.window` result;
- trace IDs are produced for runtime calls.

### 3.4 Generated-new append-only path

Implemented:
- `src/core/infer_candidate.ts`
- integration with `src/storage/write-episode.ts`
- conservative generation fallback in `timeline_resolve`

Meaning:
- when no reusable canon entry exists, the runtime can now generate a minimal,
  low-confidence candidate and persist it append-only.

### 3.5 Lifecycle hooks

Implemented:
- `src/hooks/pre_compaction_flush.ts`
- `src/hooks/session_snapshot.ts`
- `src/hooks/audit_trace.ts`
- `src/storage/trace_log.ts`

Meaning:
- the hook layer is no longer a documentation placeholder;
- flush / snapshot / audit behavior has runnable helper functions;
- trace summaries can be persisted to disk.

### 3.6 Single-writer hardening (initial slice)

Implemented:
- `src/storage/daily_log.ts`
- `src/storage/lock.ts`
- guard integration inside `timeline_resolve`

Meaning:
- generated writes are now validated against canonical daily log path rules;
- writes use a simple lock file to reduce concurrent write risks;
- non-canonical write targets are rejected in code.

### 3.7 Test coverage for the implemented slice

Implemented:
- `src/core/resolve_window.test.ts`
- `src/tools/timeline_resolve.test.ts`
- `src/tools/timeline_resolve.generate.test.ts`
- `src/tools/timeline_resolve.guard.test.ts`
- `src/hooks/pre_compaction_flush.test.ts`
- `src/hooks/audit_trace.test.ts`
- `src/storage/daily_log.test.ts`

Meaning:
- the current runtime slice is not speculative;
- the implemented behavior is executable and regression-testable.

## 4. What is only partially implemented

### 4.1 Source semantics are still simplified

Current state:
- `sessions_history`, `memory_get`, and `memory_search` are dependency-injected stand-ins.
- There is no real OpenClaw SDK or gateway integration yet.

Implication:
- the code proves the pipeline structure,
- but not yet the real platform wiring.

### 4.2 Generation logic is intentionally conservative and shallow

Current state:
- `infer_candidate.ts` uses a very minimal heuristic fallback.
- It does not yet model richer duration logic, stronger conflict handling, or more nuanced
  confidence reasoning.

Implication:
- the generated path exists,
- but it is still a safe placeholder rather than a production-grade inference engine.

### 4.3 Hook integration is helper-level, not SDK-native registration

Current state:
- hook helper functions are implemented,
- but they are not yet wired against a real OpenClaw hook SDK/runtime surface.

Implication:
- lifecycle behavior can be tested locally,
- but not yet claimed as production-integrated.

### 4.4 Trace schema is still lightweight

Current state:
- traces store IDs, event names, timestamps, and some summary fields.
- They do not yet capture the full decision graph expected by the architecture docs.

Implication:
- observability exists,
- but not yet at the depth needed for production debugging and evaluation.

### 4.5 Single-writer discipline is not fully enforced platform-wide

Current state:
- canonical path guards and locks exist in the timeline runtime path.
- Other non-timeline code paths are not globally blocked by platform permissions yet.

Implication:
- the timeline runtime is hardened,
- but the whole repository/runtime is not yet guaranteed to be single-writer by system policy.

## 5. What is still missing relative to the v2 plan

### 5.1 Real OpenClaw SDK alignment

Missing:
- replacing the local compatibility facade with actual OpenClaw SDK contracts if/when the published runtime API differs;
- verifying the current tool/hook registration shape against a real OpenClaw runtime load.

### 5.2 Production-grade trace schema

Missing:
- source payload summaries;
- fingerprint match diagnostics;
- appearance inheritance reasoning in trace form;
- explicit fallback/error categories;
- trace sinks that can be inspected operationally.

### 5.3 Better write-path hardening

Missing:
- stronger lock semantics if concurrent writes become more complex;
- optional write-deny detection for non-timeline writers;
- stronger reconciliation when a competing writer touches canon files.

### 5.4 Better generated-state semantics

Missing:
- duration boundary logic for ongoing vs finished activities;
- stronger conflict resolution with hard anchors;
- better multi-day behavior for `recent_3d`;
- explicit low-confidence fallback strategies by scenario.

### 5.5 Maintenance / repair tooling

Missing:
- deeper diagnostic commands for malformed daily logs and repair workflows beyond the initial `timeline_repair` tool.

### 5.6 Documentation sync

Missing:
- explicit documentation of current milestone status in the repo until this memo;
- a short roadmap tying current code to the original v2 plan.

## 6. Milestone status re-evaluation

### Milestone 1 — Plugin skeleton

**Status: done**

Completed:
- plugin manifest draft
- plugin entrypoint
- bundled skill
- runtime tool shell

### Milestone 2 — Core runtime path

**Status: done (for the current local architecture slice)**

Completed:
- window resolution
- source collection ordering
- parse + map path
- read-only hit path
- tests

### Milestone 3 — Generation and writing

**Status: partially done**

Completed:
- candidate generation exists
- append-only writer integration exists
- canonical path validation exists
- file lock exists

Still missing:
- richer generation logic
- stronger conflict/duration reasoning
- richer write diagnostics

### Milestone 4 — Hook integration

**Status: partially done**

Completed:
- runnable helper-level hook functions
- tests for hook behavior
- trace persistence helpers

Still missing:
- true OpenClaw runtime registration/integration
- production lifecycle semantics validation

### Milestone 5 — Hardening

**Status: started**

Completed:
- canonical path guard
- lock file helper
- test coverage for guard failure

Still missing:
- broader platform-level write controls
- richer observability
- repair/status tooling
- production-grade trace analytics

## 7. Recommended next-step plan

The next tasks should now be ordered by leverage, not by original document order.

## 8. Next task batch A — Platform alignment (highest priority)

Goal:
- replace local assumptions with real OpenClaw integration points.

Tasks:
1. Replace the local compatibility facade with actual OpenClaw SDK/plugin contracts.
2. Align `index.ts` and `openclaw.plugin.json` with the real plugin entry format.
3. Verify how OpenClaw expects tools/hooks to be registered in production.
4. Confirm whether bundled skills need any additional manifest wiring.

Definition of done:
- the plugin can be loaded by a real OpenClaw runtime without relying on local stand-in types.

## 9. Next task batch B — Observability hardening

Goal:
- make timeline runs diagnosable in production.

Tasks:
1. Expand `src/core/trace.ts` to capture:
   - source ordering;
   - source payload summaries;
   - fingerprint hit/miss metadata;
   - appearance inheritance decisions;
   - write guard outcomes;
   - fallback reasons.
2. Update `src/storage/trace_log.ts` schema accordingly.
3. Add tests for richer trace contents.
4. Add a small reader/debug helper if needed.

Definition of done:
- a failed or surprising timeline run can be explained from trace logs alone.

## 10. Next task batch C — Generation quality

Goal:
- make `generated_new` behavior safer and more realistic.

Tasks:
1. Improve `infer_candidate.ts` with duration-boundary reasoning.
2. Prefer recent hard-anchor/session facts over generic fallback text.
3. Add confidence reason codes.
4. Improve low-information fallback wording.
5. Add tests for:
   - ongoing activity continuation;
   - completed activity rollover;
   - low-confidence sleep/rest states.

Definition of done:
- generated timeline states are conservative, explainable, and less placeholder-like.

## 11. Next task batch D — Write-path hardening

Goal:
- move closer to actual single-writer enforcement.

Tasks:
1. Strengthen lock handling and lock cleanup behavior.
2. Add explicit write-denied / write-conflict error categories.
3. Add non-timeline-write detection if the OpenClaw runtime permits it.
4. Add recovery rules for partially written traces or failed writes.

Definition of done:
- write conflicts and invalid writes become explicit operational events, not silent edge cases.

## 12. Next task batch E — Maintenance tools

Goal:
- make the runtime operable by humans.

Tasks:
1. Expand `timeline_status` to cover more operational counters and recent trace summaries.
2. Expand `timeline_repair` beyond structural diagnostics into guided repair workflows.
3. Add tests for both tools.
4. Document how they should be used during debugging and migration.

Definition of done:
- maintainers can inspect and repair the runtime without digging through raw files manually.

## 13. Concrete recommended order for the next 3 implementation PRs

### PR 1 — OpenClaw SDK alignment

Ship:
- real plugin registration
- real tool registration
- real hook registration
- manifest cleanup

Why first:
- this validates the architecture against the actual platform.

### PR 2 — Trace / observability upgrade

Ship:
- richer trace schema
- better hook trace logging
- trace-based debugging helpers

Why second:
- without stronger observability, later generation improvements are hard to trust.

### PR 3 — Generation-quality upgrade

Ship:
- richer `infer_candidate`
- duration logic
- confidence reason codes
- more scenario tests

Why third:
- once platform alignment and traces are solid, generation quality can improve safely.

## 14. Immediate action items for the next coding step

If implementation continues immediately, the most valuable next coding step is:

1. inspect the real OpenClaw plugin SDK / runtime registration surface;
2. replace the local plugin spec shim;
3. align `index.ts` and hooks with the real platform API;
4. preserve the current tests wherever possible.

If real SDK alignment is blocked, then the fallback next step is:

1. enrich trace schema;
2. add trace assertions to existing tests;
3. follow the first `timeline_repair` slice with guided repair actions and richer trace readers.

## 15. GA gap re-inventory

If the question is **"what still prevents an official release today?"**, the answer is now clearer than before.

### 15.1 Release blockers (must finish before GA)

1. **Real OpenClaw runtime validation**
   - The plugin still relies on a local compatibility facade.
   - Tool and hook registration have not been validated end-to-end inside a real OpenClaw runtime.
   - Packaging assumptions (`index.ts`, manifest wiring, lifecycle semantics) still need platform proof.

2. **Write-path trust model is incomplete**
   - Canonical-path checks and lock files exist, but they only protect the timeline-owned code path.
   - Explicit conflict / write-denied error categories are still thin.
   - Recovery semantics for interrupted writes and partial trace persistence need to be defined and tested.

3. **Observability is not yet production-grade**
   - Trace logs exist, but they still do not fully explain every surprising run from logs alone.
   - `timeline_status` needs richer counters, recent trace summaries, and clearer operator-facing health reporting.
   - `timeline_repair` still focuses more on diagnostics than guided recovery.

4. **Generated write quality is not yet strong enough for GA trust**
   - Candidate inference is intentionally conservative, but still weak on duration reasoning, conflict checks, and anchor selection.
   - Low-information states can still fall back to generic output.
   - Confidence explanations need to be stronger before operators should rely on generated writes in production.

### 15.2 Important but likely post-blocker polish

These items matter, but they are better treated as **GA polish or immediate post-GA follow-up** unless they reveal a harder architectural issue:

- broader operator docs with failure playbooks;
- richer examples of repair workflows;
- more runtime metrics / dashboards if the host platform supports them;
- packaging ergonomics for easier third-party installation.

### 15.3 Recommended release sequence from here

If the goal is to reach a credible formal release with minimum thrash, the best order is now:

1. **Platform proof first** — validate the real OpenClaw registration/integration path.
2. **Observability second** — make runtime outcomes explainable from traces and status tooling.
3. **Write-path hardening third** — formalize conflict, denial, and recovery semantics.
4. **Generation quality fourth** — improve candidate quality once the platform and diagnostics are trustworthy.

### 15.4 Practical release call

So the current repo is best treated as:

> **a solid draft / pilotable local runtime slice, not yet an officially releasable GA plugin.**

The main reason is not lack of code volume; it is that the remaining work sits exactly on the four areas that determine production trust: **platform validation, write safety, observability, and generated-write quality.**

## 16. Final status statement

Timeline v2 has moved from:
- **idea** → **design docs** → **plugin skeleton** → **tested local runtime slice**.

It has **not yet** moved to:
- **real OpenClaw SDK integration**
- **production-grade observability**
- **fully hardened single-writer enforcement**
- **high-quality generation semantics**

That means the project is now at a very useful intermediate point:

> **The architecture is proven enough to keep building, but it should still be described as draft / pilot-ready rather than GA. The next work should focus on platform alignment, observability, and write-path hardening before expanding surface area further.**
