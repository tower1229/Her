## Timeline Daily Log Contract

`memory/YYYY-MM-DD.md` is the daily log for time-bound memories.

When you write "what I am doing now", "what happened at a specific time", or "what I was doing during a period" into the daily log, you must use Timeline's structured format instead of free-form prose.

Each daily-log memory should include these fields whenever possible:

- `Timestamp`
- `Location`
- `Action`
- `Emotion_Tags`
- `Appearance`
- `Internal_Monologue` (optional)
- `Estimated_Duration` (optional, integer minutes)
- `Event_Id` (auto-generated, deterministic identifier for this entry, format `evt-YYYYMMDD-HHmmss`)
- `Parent_Event` (optional, references the `Event_Id` of the parent macro event)
- `Parent_Event_Phase` (optional, short label for the current phase)
- `Parent_Event_Progress` (optional, float 0.0-1.0)

Recommended shape:

    ### [09:30:00]

    - Timestamp: 2026-03-24 09:30:00
    - Location: Home study
    - Action: Sitting in the study reviewing today's tasks before starting the morning's work
    - Emotion_Tags: [calm, focused]
    - Appearance: Light home top, hair loosely tied up, a fresh cup of coffee on the desk
    - Internal_Monologue: I want to finish the two most important things this morning first, then maybe go out later if the day goes well
    - Estimated_Duration: 120
    - Event_Id: evt-20260324-093000

Do not mix free-form daily-log writing with Timeline format. If a memory is about temporal state or recall, prefer Timeline-readable structure.
