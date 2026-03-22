# Timeline Plugin v2 for OpenClaw

[中文版 README](./README_ZH.md)

A v2 OpenClaw-native timeline runtime that moves temporal fact resolution out of
prompt-only behavior and into a canonical `timeline_resolve` tool with hook support,
append-only writes, trace logging, and bundled skill routing.

This repository follows the native OpenClaw plugin shape:
- `openclaw.plugin.json` provides discovery + config validation metadata;
- `index.ts` exports the runtime plugin entry and registers tools/hooks;
- `package.json` exposes the runtime entry through `openclaw.extensions`.

## What is in this repository

- `openclaw.plugin.json` — draft OpenClaw plugin manifest
- `index.ts` — plugin entry wiring
- `skills/timeline/` — bundled routing skill for temporal intent
- `src/tools/` — canonical tool entrypoints (`timeline_resolve`, `timeline_status`, `timeline_repair`)
- `src/core/` — deterministic timeline runtime pipeline
- `src/hooks/` — lifecycle hook helpers (flush / snapshot / audit)
- `src/storage/` — canonical write-path hardening and trace storage
- `src/lib/` — shared parsing, fingerprinting, inheritance, holiday, and time helpers
- `docs/` — v2 architecture, interface, refactor, and status memos

## Current status

This repository is intentionally focused on the v2 shape only.
Legacy v1 prompt-era templates, reference docs, and old root skill files have been
removed so the repo reflects the current plugin-first direction.

See:
- `docs/timeline-v2-refactor-plan.md`
- `docs/timeline-v2-status.md`
- `docs/timeline-v2-release-checklist.md`
- `docs/timeline-resolve-interface.md`

## Development

```bash
npm install
npm run build
npm test
```
