# Timeline Plugin v2 for OpenClaw

[中文版 README](./README_ZH.md)

A draft OpenClaw-native timeline plugin that turns temporal fact resolution into a
canonical runtime capability instead of a prompt convention.

If you want an agent to answer questions like **“what are you doing now?”**,
**“what have you been doing recently?”**, or **“what happened on this date?”**
with structured, auditable, append-only memory behavior, this repository is built
for that use case.

---

## Should you install this?

### Install this plugin if you need
- a **single canonical tool** for timeline queries instead of prompt-only memory behavior;
- **append-only day-log writes** with canonical path checks and file locking;
- **diagnostics and repair tooling** for timeline memory (`timeline_status`, `timeline_repair`);
- **traceable temporal resolution** so surprising results can be inspected later;
- a bundled skill that routes temporal user questions toward a deterministic runtime.

### This may not be the right fit if you only need
- a generic chat persona without structured timeline memory;
- free-form journaling without canonical write rules;
- a finished GA plugin today — the repo is still explicitly in **`2.0.0-draft`** status.

---

## What problem this plugin solves

Prompt-only timeline memories tend to drift:
- the model answers “now” questions from loose context instead of a canonical source;
- appearance / location / action details become inconsistent across turns;
- generated facts get written back without enough guardrails;
- debugging a bad timeline answer is hard because there is no durable trace.

Timeline Plugin v2 moves that logic into runtime code so the plugin, not the prompt,
owns:
- temporal window resolution;
- source ordering;
- Markdown daily-log parsing;
- fingerprint-based reuse vs generation;
- append-only writes;
- repair and status diagnostics;
- lifecycle traceability.

---

## Core capabilities

### `timeline_resolve`
The canonical runtime entrypoint for temporal fact retrieval and, when policy allows,
append-only canon generation.

### `timeline_status`
A lightweight operational view into plugin registration metadata and the most recent
runtime snapshot.

### `timeline_repair`
A maintenance tool for malformed daily logs, canonical path diagnostics, and recent
run/trace inspection.

### Lifecycle hooks
The plugin also includes hook helpers for:
- pre-compaction flush;
- session snapshot;
- audit trace persistence.

---

## Typical usage scenarios

### 1. Current status grounding
Use this when the agent should answer:
- “what are you doing right now?”
- “where are you now?”
- “what have you been up to today?”

### 2. Recent recall
Use this when the agent should summarize recent activity over a bounded window,
while reusing canonical memory where possible.

### 3. Safe append-only memory writing
Use this when you want timeline facts to be written through a guarded path instead
of ad-hoc memory mutations.

### 4. Timeline debugging / repair
Use `timeline_status` and `timeline_repair` when you need to inspect trace behavior,
malformed day logs, or write-path health.

---

## How it works

At a high level, the runtime does this:

1. normalize the requested time window;
2. collect sources in deterministic order (`sessions_history -> memory_get -> memory_search`);
3. parse daily-log Markdown into structured episodes;
4. reuse canon via fingerprint matching when possible;
5. only generate conservatively when policy allows;
6. write append-only through the timeline-owned storage path;
7. emit trace and runtime diagnostics.

---

## Installation

> This repository is currently positioned as a **draft plugin project / local plugin**.
> The most realistic installation path today is local development or side-loading into
> an OpenClaw setup you control.

### Option A — Install from a local checkout

Clone the repository and install it into OpenClaw as a local plugin:

```bash
git clone https://github.com/tower1229/Her.git
cd Her
npm install
npm run build
openclaw plugins install -l .
```

### Option B — Point OpenClaw at the plugin entry manually

This repository exposes its runtime entry through:
- `openclaw.plugin.json`
- `package.json` → `openclaw.extensions`
- `index.ts`

If your OpenClaw environment uses direct local plugin paths, point it at this repo and
ensure the runtime can resolve the built plugin entry.

### Configuration

The draft manifest currently exposes these plugin config fields:
- `enableTrace`
- `traceLogPath`
- `canonicalMemoryRoot`

Those fields live under the plugin entry for `timeline-plugin` in your OpenClaw plugin config.

---

## Quick start

After installation:

1. enable the plugin in your OpenClaw environment;
2. ensure the plugin can access the canonical `memory/` directory you expect to use;
3. ask a temporal question that should be routed to the timeline skill;
4. inspect `timeline_status` if you want to confirm registration / recent runtime state;
5. inspect `timeline_repair` if a daily log looks malformed or a write path seems wrong.

Useful example prompts:
- “What are you doing right now?”
- “What have you been doing recently?”
- “What happened on 2026-03-22?”
- “Check whether today’s timeline log is malformed.”

---

## Repository layout

- `openclaw.plugin.json` — plugin manifest
- `index.ts` — plugin entry wiring
- `skills/timeline/` — bundled routing skill
- `src/tools/` — canonical tools (`timeline_resolve`, `timeline_status`, `timeline_repair`)
- `src/core/` — deterministic runtime pipeline
- `src/hooks/` — lifecycle hooks
- `src/storage/` — write guards, trace logs, runtime status, run logs
- `src/lib/` — parsing / fingerprint / time / inheritance helpers
- `docs/` — design, interface, roadmap, status, and release checklist docs

---

## Current status

This repo is intentionally focused on the v2 plugin shape only.
It is already useful as a deterministic local runtime slice, but it is still not a final
GA release. The main remaining gaps are real OpenClaw runtime validation, stronger
write-path guarantees, richer operability/observability, and better generated-write
quality.

Start here if you want to understand maturity and roadmap:
- `docs/timeline-v2-refactor-plan.md`
- `docs/timeline-v2-status.md` (includes a refreshed GA gap inventory)
- `docs/timeline-v2-release-checklist.md`
- `docs/timeline-v2-quickstart.md`
- `docs/timeline-v2-migration.md`
- `docs/timeline-resolve-interface.md`
- `CHANGELOG.md`

---

## Development

```bash
npm install
npm run build
npm test
```
