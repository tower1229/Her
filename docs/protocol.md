# timeline-skill Protocol (v1)

This document defines the final input/output contract of `timeline-skill`.
It is the implementation-facing protocol extracted from `timeline-skill-design.md`.

## Skill Role

`timeline-skill` is the factual timeline layer:

- Read hard facts from chat/session history and memory files
- Generate or reuse current/past episode facts
- Persist canonical daily memory entries (append-only)
- Return structured timeline state for downstream skills

## Input

### Explicit Input

- `target_time_range` (required)
  - Natural language or normalized window descriptor
  - Examples: `now_today`, `recent_3d`, explicit start/end

### Internal Auto-Collected Inputs

- `sessions_history` (highest-priority hard anchor)
- `memory_get` on `memory/YYYY-MM-DD.md` (deterministic daily state)
- `memory_search` (semantic supplementary recall)
- `SOUL.md`
- `MEMORY.md`
- OpenClaw current time + timezone context

## Output

### Primary Output: `TimelineWindow`

```json
{
  "schema_version": "1.0",
  "document_type": "timeline.window",
  "anchor": {
    "now": "2026-03-20T14:30:00+08:00",
    "timezone": "Asia/Shanghai"
  },
  "window": {
    "calendar_date": "2026-03-20",
    "preset": "now_today | recent_3d | explicit",
    "start": "2026-03-20T00:00:00+08:00",
    "end": "2026-03-20T14:30:00+08:00",
    "idempotency_key": "runtime-only soft-fingerprint hash"
  },
  "resolution": {
    "mode": "read_only_hit | generated_new",
    "notes": "optional"
  },
  "episodes": []
}
```

- Multi-day queries return `days: TimelineWindow[]` ordered by date.

### Episode Shape (consumer-facing view)

`episodes[]` entries are mapped from markdown memory entries by script.

Required fields for downstream consumption:

- `temporal.start`
- `state_snapshot.scene.location_label`
- `state_snapshot.scene.activity`
- `state_snapshot.scene.time_of_day`
- `state_snapshot.emotion.primary`
- `state_snapshot.appearance.outfit_style`
- `provenance.confidence`

## Persistence Output (Disk Write)

When `resolution.mode = generated_new`, append a memory paragraph to:

- `memory/YYYY-MM-DD.md`

Format (flat, human-readable):

```markdown
### [HH:MM:SS] {Short Event Title}

- Timestamp: YYYY-MM-DD HH:MM:SS
- Location: {short location phrase}
- Action: {one-sentence description}
- Emotion_Tags: [tag1, tag2]
- Appearance: {outfit or visible state}
- Internal_Monologue: {one short sentence}
```

No special machine-only markers are required in disk content.

## Idempotency Rule

- Use soft fingerprint (runtime only):
  - `normalize(date) + normalize(location) + normalize(action) + time_bucket`
- If matched in same day -> `read_only_hit` and do not write.
- If not matched -> `generated_new` and append.

## Hard-Anchor Priority

Must enforce this read order:

1. `sessions_history`
2. `memory_get`
3. `memory_search`

Session hard facts cannot be overridden by semantic recall.

## Natural Inference Rule

When direct hard facts are missing, `timeline-skill` may infer plausible details from:

- `MEMORY.md` (persona biography)
- `IDENTITY` base attributes (e.g. gender, age)
- `SOUL` personality traits

Constraints:

- Never conflict with `sessions_history` or already persisted daily memory facts.
- Keep low-confidence inference conservative and expose confidence via `provenance.confidence`.

## Flush Boundary

- `timeline-skill` is the single writer for memory persistence.
- During pre-compaction flush, `timeline-skill` performs final append check/write.
- Other skills may trigger flush behavior but must not write canonical timeline entries directly.
