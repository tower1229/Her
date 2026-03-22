# Timeline for OpenClaw — Recommended Architecture Memo

> Status: draft memo
> Purpose: record the recommended technical shape for evolving `timeline-skill`
> Audience: maintainers designing the next implementation phase

## 1. Executive Summary

`timeline` should evolve from a **prompt-only skill** into a **hybrid OpenClaw extension**:

- **Plugin + agent tool** as the execution core
- **Skill** as the routing / trigger layer
- **SOUL / AGENTS instructions** as policy reinforcement only
- **Hooks** as lifecycle automation for flush, snapshot, and audit

This is the smallest OpenClaw-native architecture that makes the timeline pipeline
real, deterministic, observable, and enforceable without prematurely taking over
OpenClaw's global memory slot or context engine.

## 2. Problem Statement

The current repository is shaped like an OpenClaw skill package plus helper scripts.
That form is useful for prompt guidance, but it cannot guarantee that the model will:

1. always read the skill entry before acting;
2. always follow `sessions_history -> memory_get -> memory_search`;
3. always run soft-fingerprint deduplication;
4. always apply appearance inheritance deterministically;
5. always preserve append-only writing and single-writer discipline.

As long as timeline exists only as instructions plus globally-available `read` / `write`
 tools, the LLM can simulate the desired behavior but the runtime cannot enforce it.

## 3. Architectural Goals

The next architecture should satisfy the following goals:

1. **Deterministic execution**
   - timeline resolution must run through code, not prompt interpretation.
2. **Single controlled entrypoint**
   - temporal fact resolution should go through one tool contract.
3. **Single writer discipline**
   - canonical timeline writes should occur through timeline-owned code paths.
4. **Prompt compatibility**
   - existing skill / SOUL behavior should still guide when the tool is used.
5. **Observability**
   - every run should produce traces explaining what was read, decided, and written.
6. **Incremental adoption**
   - avoid replacing OpenClaw's global memory or context engine unless proven necessary.

## 4. Recommended Technical Shape

### 4.1 Core choice

Implement timeline as a **regular OpenClaw plugin** that provides:

- an agent tool named `timeline_resolve`;
- optional helper tools such as `timeline_status` and `timeline_repair`;
- lifecycle hooks for flush / snapshot / audit;
- a bundled `skills/timeline/` directory so the agent learns when to call the tool.

### 4.2 Why not keep prompt-only form

Prompt-only skills are good at teaching behavior, but not enforcing execution order or
 deterministic state transitions. Timeline's critical behaviors are algorithmic, so they
 should live in code.

### 4.3 Why not start as a memory plugin

A memory plugin would push timeline into OpenClaw's global memory slot too early.
Timeline is a **fact-assembly and persistence workflow**, not primarily a replacement
for the platform's search backend.

### 4.4 Why not start as a context engine plugin

A context engine plugin is powerful but heavy. It is appropriate only if timeline later
needs to participate directly in context assembly / compaction orchestration for the
whole agent runtime.

## 5. Layered Architecture

The recommended implementation is intentionally layered.

### Layer A — Prompt / Policy Layer

**Artifacts**:
- `skills/timeline/SKILL.md`
- selected `SOUL.md` instructions
- selected `AGENTS.md` protocol fragments

**Responsibilities**:
- detect temporal intent;
- route such requests to `timeline_resolve`;
- require the model to ground answers in timeline output;
- forbid direct improvisation when factual timeline data is required.

**Non-responsibilities**:
- fingerprinting;
- appearance inheritance;
- file mutation policy;
- output validation.

Those must move into the runtime tool.

### Layer B — Runtime Tool Layer

**Artifact**:
- `timeline_resolve`

**Responsibilities**:
- normalize the requested time window;
- collect facts in the required order;
- parse disk memories;
- perform deduplication;
- apply appearance inheritance;
- decide `read_only_hit` vs `generated_new`;
- write append-only canonical entries when allowed;
- return a structured `TimelineWindow` result.

This is the actual timeline engine.

### Layer C — Lifecycle Automation Layer

**Artifacts**:
- pre-compaction flush hook
- session snapshot hook
- audit / trace hook or shared logging service

**Responsibilities**:
- flush eligible current-state facts before compaction or reset;
- persist run traces for debugging and evaluation;
- snapshot state at stable session boundaries.

## 6. Plugin Package Layout

A recommended package layout is:

```text
openclaw-timeline/
├── openclaw.plugin.json
├── index.ts
├── skills/
│   └── timeline/
│       └── SKILL.md
├── src/
│   ├── tools/
│   │   ├── timeline_resolve.ts
│   │   ├── timeline_status.ts
│   │   └── timeline_repair.ts
│   ├── hooks/
│   │   ├── pre_compaction_flush.ts
│   │   ├── session_snapshot.ts
│   │   └── timeline_audit.ts
│   ├── core/
│   │   ├── resolve-window.ts
│   │   ├── parse-memory.ts
│   │   ├── fingerprint.ts
│   │   ├── inherit-appearance.ts
│   │   ├── write-episode.ts
│   │   ├── build-window.ts
│   │   └── types.ts
│   └── storage/
│       ├── daily-log.ts
│       ├── trace-log.ts
│       └── lock.ts
└── docs/
    ├── timeline-openclaw-architecture.md
    ├── timeline-openclaw-plugin-diagram.md
    └── timeline-resolve-interface.md
```

## 7. Tooling Strategy

### 7.1 Primary tool: `timeline_resolve`

This should be the single canonical entrypoint for temporal fact retrieval.

It should:
- accept a normalized or natural-language time request;
- run the full resolution pipeline;
- optionally write new canon entries;
- return structured JSON only.

### 7.2 Secondary tool: `timeline_status`

Useful for diagnostics. It can expose:
- last resolved date/window;
- last write timestamp;
- whether today's anchor exists;
- recent trace IDs.

### 7.3 Optional tool: `timeline_repair`

Use only for maintenance workflows such as:
- validating malformed daily log files;
- rebuilding derived indexes;
- reporting corruption without rewriting canon silently.

## 8. Hook Strategy

Hooks are recommended as support infrastructure, not as the main resolution entrypoint.

### 8.1 Pre-compaction flush hook

Trigger timeline reconciliation before compaction / reset boundaries when current state
should be persisted.

### 8.2 Session snapshot hook

At stable session lifecycle boundaries, write a lightweight snapshot to aid recovery,
 debugging, and evaluation.

### 8.3 Audit / trace hook

Record every timeline tool invocation with enough detail to answer:
- was `sessions_history` consulted?
- was `memory_get` consulted?
- was `memory_search` consulted?
- did fingerprint match?
- did appearance inherit or override?
- was a write performed?

## 9. Storage Model Recommendation

### 9.1 Near term

Keep the current Markdown daily log (`memory/YYYY-MM-DD.md`) as the canonical user-visible
store so deployment remains compatible with existing OpenClaw expectations.

### 9.2 Control point

Even if Markdown remains canonical, **timeline writes must pass through timeline-owned
code paths**. Canonical writes should not be treated as equivalent to generic file writes.

### 9.3 Long term option

If scale or reliability demands it, add a structured shadow store (JSONL / sqlite / index)
for validation, deduplication, and analytics, while still projecting to Markdown for the
human-readable daily log.

## 10. Single Writer Policy in Practice

Single writer must become a runtime property, not only a prompt promise.

Recommended enforcement order:

1. First, make `timeline_resolve` the only documented write path.
2. Next, route all canonical timeline writes through timeline-owned storage helpers.
3. Finally, if OpenClaw permissions allow it, restrict direct write access to the canonical
   timeline path for non-timeline components.

## 11. Observability Requirements

Every timeline run should emit a trace record containing at minimum:

- run ID;
- timestamp;
- trigger reason;
- requested window;
- actual window;
- data sources touched;
- resolution mode;
- confidence summary;
- writes attempted / succeeded;
- error or fallback notes.

Without this trace layer, prompt-level success can mask runtime-level failure.

## 12. Migration Plan

### Phase 1 — Toolization

- create plugin shell;
- register `timeline_resolve`;
- move existing TS logic under a runtime orchestrator;
- keep current skill, but simplify it to routing rules.

### Phase 2 — Hook integration

- add pre-compaction flush;
- add session snapshot trace;
- add audit logs.

### Phase 3 — Write hardening

- centralize canonical writing helpers;
- reduce or block direct writes to canonical timeline files where possible.

### Phase 4 — Optional deeper integration

Only if needed:
- structured shadow store;
- context-engine participation;
- richer reconciliation / repair workflows.

## 13. Final Recommendation

Adopt the following OpenClaw-native shape:

- **Execution core**: plugin-provided agent tool `timeline_resolve`
- **Routing layer**: bundled timeline skill plus slim SOUL / AGENTS rules
- **Lifecycle support**: hooks for pre-compaction flush, session snapshot, and audit
- **Storage model**: Markdown daily logs in the near term, with timeline-owned write paths
- **Deferred complexity**: do not begin with a memory plugin or context-engine plugin

This architecture preserves the current skill-based UX while moving timeline's critical
behavior into code paths that can actually be tested, logged, and trusted.
