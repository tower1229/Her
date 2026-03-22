# Timeline v2 Release Checklist

> Status: release gate checklist
> Purpose: define the minimum bar for calling the current plugin runtime a formal v2 release

## A. Platform alignment

- [ ] Plugin loads in a real OpenClaw runtime without local compatibility-only assumptions.
- [ ] `openclaw.plugin.json`, `package.json`, and `index.ts` agree on entrypoint and plugin identity.
- [ ] Tool registration is verified for both `timeline_resolve` and `timeline_status`.
- [ ] Hook registration is verified for pre-compaction flush, session snapshot, and audit trace.

## B. `timeline_resolve` contract

- [x] `natural_language` requests reject missing `query`.
- [x] `explicit` requests reject missing or invalid ranges.
- [x] Error responses return structured error codes and messages.
- [x] `trace=false` omits the trace payload from tool output.
- [x] `trace=true` persists a trace log through the timeline-owned trace sink.

## C. Operability

- [x] `timeline_status` exposes plugin registration metadata.
- [x] `timeline_status` exposes the last runtime snapshot (trace id, resolution mode, write outcome).
- [ ] `timeline_repair` exists for malformed daily log diagnostics.
- [ ] Maintainers can inspect recent trace failures without reading raw runtime internals.

## D. Generation / hardening

- [ ] Generated candidates use stronger duration and conflict reasoning.
- [ ] Single-writer guarantees are enforced beyond the timeline runtime code path.
- [ ] Trace schema captures enough detail to explain surprising runs without reproducing them locally.

## E. Release decision rule

Call the current codebase **Timeline v2 released** only when:

1. Section A is fully complete.
2. Section B is fully complete.
3. Section C has `timeline_status` and `timeline_repair` both complete.
4. Section D is complete enough that generated writes and trace review are operationally trustworthy.
