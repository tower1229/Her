# `timeline_resolve` Plugin Interface Design

> Status: draft interface spec
> Scope: OpenClaw plugin agent tool contract

## 1. Purpose

`timeline_resolve` is the canonical runtime entrypoint for temporal fact retrieval and,
when allowed, append-only canon persistence.

It replaces prompt-only simulation with a deterministic tool contract.

## 2. Design Principles

1. **Single entrypoint** for temporal fact resolution.
2. **Deterministic read order**.
3. **Structured output only**.
4. **Explicit write policy**.
5. **Observable execution**.
6. **Safe degradation** when confidence is low.

## 3. Tool Name

```text
timeline_resolve
```

## 4. Input Schema

```json
{
  "target_time_range": "now_today | recent_3d | explicit | natural_language",
  "start": "optional ISO-8601 datetime",
  "end": "optional ISO-8601 datetime",
  "query": "optional natural-language temporal request",
  "mode": "read_only | allow_generate",
  "reason": "current_status | past_recall | compaction_flush | heartbeat | snapshot | debug",
  "timezone": "optional IANA timezone override",
  "trace": true
}
```

## 5. Input Field Semantics

### `target_time_range`

Primary selector for the requested temporal scope.

- `now_today`
- `recent_3d`
- `explicit`
- `natural_language`

When `natural_language` is used, `query` must be present.

### `start` / `end`

Required only for `explicit` ranges. They may also be populated by the tool after parsing
`query` in `natural_language` mode.

### `query`

Free-form user phrasing such as:
- "what are you doing right now"
- "where were you yesterday afternoon"
- "what have you been up to lately"

### `mode`

Controls whether the tool may create new canon.

- `read_only`
  - never writes;
  - useful for diagnostics, evaluation, or strict replay.
- `allow_generate`
  - may create a new episode if no read-only hit is found and generation is permitted.

### `reason`

Execution context for policy and logging.

Suggested values:
- `current_status`
- `past_recall`
- `compaction_flush`
- `heartbeat`
- `snapshot`
- `debug`

### `timezone`

Optional override. In normal operation the tool should prefer OpenClaw's injected current
 timezone and only use this field when an explicit runtime override is required.

### `trace`

If `true`, the tool should include trace metadata in the response and persist a run log.

## 6. Output Schema

### 6.1 Success response

```json
{
  "ok": true,
  "schema_version": "1.0",
  "trace_id": "uuid",
  "resolution_summary": {
    "mode": "read_only_hit | generated_new",
    "writes_attempted": 0,
    "writes_succeeded": 0,
    "sources": ["sessions_history", "memory_get", "memory_search"],
    "confidence_min": 0.5,
    "confidence_max": 1.0
  },
  "result": {
    "schema_version": "1.0",
    "document_type": "timeline.window",
    "anchor": {
      "now": "2026-03-22T14:30:00+08:00",
      "timezone": "Asia/Shanghai"
    },
    "window": {
      "calendar_date": "2026-03-22",
      "preset": "now_today",
      "start": "2026-03-22T00:00:00+08:00",
      "end": "2026-03-22T14:30:00+08:00",
      "idempotency_key": "runtime-only-hash"
    },
    "resolution": {
      "mode": "read_only_hit"
    },
    "episodes": []
  },
  "trace": {
    "requested_range": "now_today",
    "actual_range": "now_today",
    "reason": "current_status",
    "sources_touched": ["sessions_history", "memory_get"],
    "fingerprint": {
      "checked": true,
      "matched": true
    },
    "appearance": {
      "inherited": false,
      "reason": "not-needed"
    }
  }
}
```

### 6.2 Error response

```json
{
  "ok": false,
  "trace_id": "uuid",
  "error": {
    "code": "INVALID_RANGE | SOURCE_FAILURE | WRITE_BLOCKED | PARSE_ERROR | INTERNAL",
    "message": "human-readable summary"
  },
  "trace": {
    "requested_range": "explicit",
    "sources_touched": ["sessions_history"],
    "writes_attempted": 0
  }
}
```

## 7. Deterministic Execution Pipeline

The tool must execute the following stages in order.

1. **Normalize request**
   - resolve preset / explicit range / natural-language range;
   - determine anchor time and timezone.
2. **Read hard anchor**
   - query `sessions_history` first.
3. **Read deterministic disk state**
   - load target daily log(s) via `memory_get`.
4. **Read semantic context if needed**
   - call `memory_search` only as supporting context.
5. **Parse daily log**
   - convert Markdown entries into `ParsedEpisode[]`.
6. **Check read-only hit**
   - run soft fingerprint matching.
7. **Generate if allowed and needed**
   - only when no hit exists and `mode=allow_generate`.
8. **Apply appearance inheritance**
   - inherit from day anchor unless override signals are present.
9. **Map to `Episode` / `TimelineWindow`**
   - produce the structured result.
10. **Write append-only canon if needed**
    - use timeline-owned write helpers only.
11. **Persist trace**
    - write run log / audit metadata.
12. **Return structured response**
    - no natural-language prose from the tool itself.

## 7.1 Compatibility note vs prompt-era behavior

The current plugin contract should be read as a **runtime contract**, not a guarantee of prompt-era output parity.

Two practical implications matter most:
- **Empty-memory generation should preserve the old design goal.** When canon is blank, the runtime should still generate a plausible autobiographical memory by grounding itself in `SOUL`, `MEMORY`, `IDENTITY`, recent conversational anchors, and real-world time context instead of returning an empty shell.
- **The structured response envelope is stronger than before, but the consumer-facing core should remain the timeline payload.** The tool returns a runtime contract with `ok`, `trace_id`, `resolution_summary`, `notes`, and optional `trace` / `error`, while the main payload remains a `timeline.window` structure for downstream consumers.

## 8. Behavioral Rules

### 8.1 Hard-anchor rule

If `sessions_history` conflicts with disk or semantic memory, the tool must prefer
`sessions_history`.

### 8.2 Read-only hit rule

If fingerprint matching hits existing canon, the tool must:
- set `resolution.mode = read_only_hit`;
- avoid writing;
- return the mapped existing entry.

### 8.3 Generation rule

If no hit exists and generation is allowed:
- produce a conservative fact candidate;
- expose confidence clearly;
- write only through append-only helpers.

### 8.4 No-empty-result rule

The tool should prefer conservative low-information states over empty factual shells,
while keeping confidence honest.

## 9. Trace Requirements

Each invocation should emit a trace entry with these fields:

```json
{
  "trace_id": "uuid",
  "ts": "ISO datetime",
  "reason": "current_status",
  "requested_range": "now_today",
  "actual_window": {
    "start": "...",
    "end": "..."
  },
  "sources_touched": ["sessions_history", "memory_get"],
  "fingerprint_checked": true,
  "fingerprint_matched": false,
  "appearance_inherited": true,
  "resolution_mode": "generated_new",
  "writes_attempted": 1,
  "writes_succeeded": 1,
  "confidence_min": 0.6,
  "confidence_max": 1.0,
  "notes": []
}
```

## 10. Hook Integration Contract

### Pre-compaction flush hook

Call:

```json
{
  "target_time_range": "now_today",
  "mode": "allow_generate",
  "reason": "compaction_flush",
  "trace": true
}
```

### Session snapshot hook

Call either:
- `timeline_resolve(... reason="snapshot")`, or
- a lighter helper that records only trace/snapshot metadata.

### Audit hook

Consume the emitted `trace_id` and trace payload, then store or forward it to the chosen
observability sink.

## 10.5 AGENTS / SOUL Integration Guidance

`timeline_resolve` is designed to reduce manual prompt maintenance.

Recommended guidance:

- **AGENTS.md** should not be required to carry the full memory format protocol once the
  tool owns validation and writing. If any AGENTS text remains, keep it short and policy-
  level only (for example: do not write canonical daily log entries directly; use timeline
  tooling).
- **SOUL.md** may keep a compact routing reminder for temporal questions, but the tool
  contract should remain correct even if SOUL details are minimal.
- Bundled timeline skills should be the primary routing surface; manual AGENTS / SOUL
  edits should be treated as compatibility aids, not core installation requirements.

## 11. Recommended Guardrails

1. The bundled skill should instruct the model to call `timeline_resolve`, not to emulate
   timeline behavior directly.
2. The tool should reject malformed explicit ranges.
3. The tool should surface `WRITE_BLOCKED` when runtime policy forbids writing.
4. The tool should keep `trace=true` by default in development builds.
5. The tool should never return free-form assistant prose.

## 12. Future Extension Points

Possible compatible extensions:
- `days: TimelineWindow[]` for multi-day windows;
- `timeline_status` tool for diagnostics;
- `timeline_repair` for maintenance;
- optional structured shadow store;
- optional context-engine participation later.
