# Timeline Skill — [中文说明](README_ZH.md)

A factual anchor and timeline memory layer designed for OpenClaw agents. It answers one core question: **"Where am I, and what am I doing — right now, and over the past few days?"**

## Prerequisites

- **OpenClaw** gateway installed and running
- Optionally, `persona-skill` installed alongside for richer activity inference

## Installation

```bash
clawhub install timeline-skill
```

To install from source, copy the repo root into your agent's `skills/` directory:

```
~/.openclaw/workspace/skills/timeline-skill/SKILL.md
```

After installation, complete the two required configuration steps below. **Skipping either step will cause the skill to silently fail** — the agent will not know when to trigger it, and will not write memories in the correct format.

## Configuration

### 1. AGENTS.md — Memory Format Protocol

This step enforces the strict diary format that timeline-skill reads and writes. Without it, the agent may write free-form text that cannot be parsed.

Open `templates/AGENTS-protocol.template.md` from this skill directory, copy the entire `[MEMORY FORMAT PROTOCOL]` block, and paste it into the **core instruction zone** of your `AGENTS.md`.

> ⚠️ This is a system-level guardrail. Do **not** place it in `SOUL.md` — it will be overridden.

### 2. SOUL.md — Temporal Awareness

This step gives your agent the awareness to recognize when it needs to recall its own timeline.

Open `templates/SOUL-awareness.template.md`, copy the entire `[TEMPORAL AWARENESS & MEMORY RETRIEVAL]` block, and **append** it to the very end of your `SOUL.md`.

Once configured, whenever the user's intent involves time or current state ("what are you up to?", "what were you doing yesterday?"), the agent will automatically invoke timeline-skill to retrieve and anchor its facts before responding.

## Features

1. **Current State Inference & Persistence** — When asked about current activity, the agent reasons from session history (Hard Anchor), persona backstory, and system time to infer a logically consistent scene, then writes it to `memory/YYYY-MM-DD.md`.
2. **Duration Boundary Detection** — Solves the "repeated query" problem. A new activity is only generated when a sensible time gap exists. The model evaluates logical duration (drinking water ends in 2 min; playing basketball continues for 30+).
3. **Fact Retrieval** — Supports lookups over explicit past time ranges (e.g. "yesterday afternoon"), returning structured episode data.
4. **Hallucination Elimination** — Prevents the model from randomly fabricating context (e.g. "sipping coffee in New York" one minute, "on Mars" the next). All activity is constrained to a single, immutable timeline.
5. **Appearance Continuity** — Eliminates outfit hallucination drift within a single day. Appearance is inherited by default and only updated when the action logically implies a change (shower → bathrobe, gym → sportswear, shopping → trying on clothes, returning home → loungewear).

## Design Principles

- **Single Writer** — `timeline-skill` is the only authorized component that reads and writes diary-format memory entries. No other skill or prompt should append to `memory/*.md`.
- **LLM-Instruction Driven (not hardcoded RPC)** — The skill operates entirely as injected context. The model is instructed to fetch facts before answering, reason in context, then respond. No external server calls at runtime.
- **Fact / Expression Decoupling** — This skill is purely about "where" and "what". Tone, personality, and style are the responsibility of `persona-skill` and `SOUL.md`.

## Example

**User:** "Hey, what are you up to right now?"

**Model flow:**

1. Detects time-related intent.
2. Reads timeline-skill constraints — must fetch facts first.
3. Calls disk/session read tools — finds an existing entry at 14:30: `{Location: study desk, Action: organizing Obsidian notes}`.
4. Composes response using that fact as ground truth.

**Agent reply:** _(stretches)_ "Just been at my desk by the window going through my Obsidian notes for a while. A bit tired now — what's up?"

## Skill Ecosystem (Family)

Timeline-skill works standalone, but combining it with the following skills unlocks emergent pipeline behavior:

- **✨ persona-skill** — Provides the character backstory and MBTI profile that timeline-skill uses to infer plausible solo activities. Without persona, timeline inferences are generic. Without timeline, persona has no factual ground to stand on.
- **✨ stella-selfie** — The image generation skill. When generating a selfie without explicit user context, it pulls from timeline (scene + location) and persona (visual traits + mood) to produce a contextually accurate photo automatically.

## Project Structure

```
Her/
├── SKILL.md                          # Skill entrypoint & metadata
├── README.md                         # This file (English)
├── README_ZH.md                      # Chinese version
├── templates/
│   ├── AGENTS-protocol.template.md   # Copy → AGENTS.md
│   └── SOUL-awareness.template.md    # Append → SOUL.md
├── references/
│   ├── memory-format.md              # Disk entry format spec
│   ├── window-semantics.md           # Time window definitions
│   ├── json-schema.md                # TimelineWindow & Episode schemas
│   └── gotchas.md                    # Common pitfalls & hard rules
├── examples/
│   └── episode-sample.md             # Level A/B episode examples
├── scripts/
│   ├── types.ts                      # Shared TypeScript interfaces
│   ├── parse-memory.ts               # Markdown → ParsedEpisode parser
│   ├── fingerprint.ts                # Soft dedup fingerprinting
│   ├── inherit-appearance.ts         # Appearance continuity logic
│   ├── holidays.ts                   # Static public holiday table (CN/US)
│   ├── write-episode.ts              # Core write + validation entrypoint
│   ├── run-log.ts                    # Observability run log
│   └── release-clawhub.mjs          # ClawHub publish script
└── docs/
    └── timeline-skill-design.md      # Full architecture & design doc
```

## Development

```bash
npm install
npm test         # Run all unit tests (13 tests)
npm run build    # Compile TypeScript
npm run release:clawhub   # Publish to ClawHub
```

## License

MIT-0 — free to use, modify, and redistribute without attribution.
