# Changelog

## Unreleased / 2.0.0-draft

### Added
- OpenClaw-native plugin skeleton with `openclaw.plugin.json` and `index.ts`.
- Canonical tools: `timeline_resolve`, `timeline_status`, `timeline_repair`.
- Deterministic runtime pipeline under `src/core/` and supporting helpers under `src/lib/` and `src/storage/`.
- Lifecycle hooks for pre-compaction flush, session snapshot, and audit trace.
- English and Chinese READMEs rewritten around install decision, use cases, and quick start.
- Release checklist, quickstart, and migration docs for evaluating the draft plugin.

### Changed
- Repository layout now reflects a plugin-first runtime rather than prompt-era templates.
- Timeline generation is more conservative for non-`now_today` ranges.
- Trace output now carries richer decision and write-guard metadata.

### Notes
- The project remains in `2.0.0-draft` status.
- The biggest remaining GA gaps are real OpenClaw runtime validation, stronger write-path guarantees, richer operability/observability, and higher-confidence generated writes.
- See `docs/timeline-v2-release-checklist.md` and `docs/timeline-v2-status.md` before treating the plugin as production-ready.
