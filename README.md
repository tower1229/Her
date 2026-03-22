# Timeline Plugin for OpenClaw

[中文版 README](./README_ZH.md)

Timeline is an OpenClaw plugin project for one very specific job:
**help an agent answer time-related questions from a stable, inspectable, append-only memory model.**

If you want your agent to answer questions like:
- **What are you doing now?**
- **What have you been doing recently?**
- **What happened on a specific day?**
- **Can you check whether this timeline log is malformed?**

with more structure and less prompt drift, this repository is built for that use case.

---

## What Timeline is trying to achieve

Timeline is not mainly about “v2 vs v1”.
The underlying project goal is the same throughout:

> Give the agent a trustworthy temporal memory layer so that timeline answers come from a canonical runtime path, not from loose prompt improvisation.

In practice, that means Timeline is trying to provide:
- a **single canonical path** for temporal fact resolution;
- a **deterministic read flow** over timeline sources;
- **append-only memory writing** instead of arbitrary mutation;
- **diagnostics and traces** so maintainers can explain surprising answers;
- **operator tools** for status inspection and malformed-log repair.

The current repository implements that goal using a plugin-first OpenClaw architecture.

---

## Why this matters

Without a dedicated timeline runtime, agents often answer temporal questions by mixing:
- recent chat context;
- vague memory fragments;
- prompt conventions;
- and model guesses.

That tends to create familiar problems:
- “now” answers drift over time;
- location / action / appearance details become inconsistent;
- facts may be written back without enough guardrails;
- debugging a bad answer becomes difficult because there is no durable trace.

Timeline exists to reduce those failures by moving the important logic into code.

---

## Typical scenarios

### 1. Current-state grounding
Use Timeline when the agent should answer questions such as:
- “What are you doing right now?”
- “Where are you now?”
- “What have you been doing today?”

### 2. Recent activity recall
Use Timeline when you want a bounded summary of the recent past, while still preferring canonical memory over improvisation.

### 3. Safer memory writing
Use Timeline when timeline facts should only be written through a guarded append-only path instead of ad-hoc memory edits.

### 4. Timeline maintenance and debugging
Use Timeline when operators need to inspect registration state, recent runs, malformed day logs, or trace behavior.

---

## Core capabilities

### `timeline_resolve`
The canonical tool for timeline retrieval and, when allowed by policy, conservative append-only generation.

### `timeline_status`
A lightweight operator view of plugin metadata, registered tools/hooks, and the latest runtime snapshot.

### `timeline_repair`
A diagnostic tool for malformed daily logs, canonical-path validation, and recent run / trace inspection.

### Lifecycle helpers
The plugin also includes hook helpers for:
- pre-compaction flush;
- session snapshot;
- audit trace persistence.

---

## How Timeline works

At a high level, the runtime does this:

1. normalize a request into a time window;
2. read timeline-related sources in deterministic order;
3. parse Markdown day logs into structured episodes;
4. reuse canonical memory when possible;
5. generate conservatively only when policy allows;
6. write append-only through the timeline-owned path;
7. emit trace and runtime-status diagnostics.

The point is not just to answer a question once.
The point is to make the answer path **repeatable, inspectable, and safer to maintain**.

---

## Should you install this?

### Good fit
Install this project if you need:
- a dedicated timeline runtime for OpenClaw;
- more trustworthy answers to temporal questions;
- append-only timeline writing with path checks and lock protection;
- status / repair tooling for operators;
- a plugin that pushes timeline behavior into code instead of prompts alone.

### Probably not the right fit
This may not be the best fit if:
- you only need a general chat persona;
- you want free-form journaling rather than canonical timeline memory;
- you do not need diagnostic / traceability features;
- you need a fully finalized GA plugin immediately.

---

## Installation

> The project is currently best treated as a **draft local plugin / pilotable runtime slice**.
> The most realistic installation path today is local development or side-loading into an OpenClaw environment you control.

### Install from a local checkout

```bash
git clone https://github.com/tower1229/Her.git
cd Her
npm install
npm run build
openclaw plugins install -l .
```

### Plugin entrypoints

This repository exposes the plugin through:
- `openclaw.plugin.json`
- `package.json` → `openclaw.extensions`
- `index.ts`

### Draft config fields

The current manifest exposes:
- `enableTrace`
- `traceLogPath`
- `canonicalMemoryRoot`

---

## Quick start

After installation:

1. enable the plugin in your OpenClaw environment;
2. make sure it can access the canonical `memory/` directory you intend to use;
3. ask a clearly temporal question;
4. inspect `timeline_status` to confirm registration / recent runtime state;
5. run `timeline_repair` if a daily log looks malformed or a write path looks suspicious.

Example prompts:
- “What are you doing right now?”
- “What have you been doing recently?”
- “What happened on 2026-03-22?”
- “Check whether today’s timeline log is malformed.”

---

## Repository layout

- `openclaw.plugin.json` — plugin manifest
- `index.ts` — plugin entry wiring
- `skills/timeline/` — bundled routing skill
- `src/tools/` — runtime tools (`timeline_resolve`, `timeline_status`, `timeline_repair`)
- `src/core/` — deterministic timeline pipeline
- `src/hooks/` — lifecycle helpers
- `src/storage/` — write guards, trace logs, runtime status, run logs
- `src/lib/` — parsing / fingerprint / time / inheritance helpers
- `docs/` — interface, roadmap, migration, status, and release docs

---

## Current project status

The implementation has already moved beyond pure design notes: it includes a real plugin skeleton, canonical tools, deterministic read logic, guarded append-only writes, hooks, diagnostics, and tests.

But this is still **not yet a final GA release**.
The biggest remaining gaps are:
- real OpenClaw runtime validation;
- stronger write-path / single-writer guarantees;
- richer observability and operator tooling;
- higher-confidence generated-write behavior.

If you want to understand maturity and next steps, start with:
- `docs/timeline-v2-status.md`
- `docs/timeline-v2-release-checklist.md`
- `docs/timeline-v2-quickstart.md`
- `docs/timeline-v2-migration.md`
- `docs/timeline-v2-refactor-plan.md`
- `docs/timeline-resolve-interface.md`
- `CHANGELOG.md`

---

## Development

```bash
npm install
npm run build
npm test
```
