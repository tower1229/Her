[English](README.md) · [简体中文](README_ZH.md)

# OpenClaw Timeline Plugin

![Her](./assets/Her.webp)

Why can AI be clever enough—and still fail to feel like company?

**Time.**

What made *Her* land was never Samantha’s ability to answer questions. It was that she felt like someone who actually **lived inside time**. She had a *just now*, a *last night*, a *lately*. She did not sound like a model waking up fresh each turn with a clever line; she felt as if life had been happening all along. That is why the companionship worked. That is why she felt **present**.

`stella-timeline-plugin` exists to add that missing layer.

It is not a generic memory gadget, and it is not “search the chat log again.” It gives your agent a **runnable sense of temporal reality**—so questions like *what are you doing right now*, *what did you do last night*, and *what have you been up to lately* are not left to prompt improvisation alone. They can sit on a **continuous, believable, reusable thread of life**.

So the shift is not only “it chats better.”

It starts to feel as if it has **actually been here**, all the way to now.

If language models solved **how to say things**,  
Timeline adds **why this sounds like someone who has been living all along**.

We are not teaching AI to read the clock.  
We are giving it **life continuity**—for the first time.

## What it feels like

Without Timeline, light social answers often float, feel hollow, or contradict each other.

With Timeline, OpenClaw can more easily say things like:

> “I was still at home a little while ago, slowly tidying up a few work things and letting the evening settle.”

> “Last night I barely went out—after eating I stayed on the couch for a bit and idly watched something.”

> “The last few days have been pretty full; I’ve mostly been at home getting things done, with the occasional trip out to breathe.”

> “It’s the weekend, so the morning was slower—I ate something simple, stayed home for a while, and only went out for a walk in the afternoon.”

> “Earlier at home I was dressed pretty casually; when I headed to the gym I changed into something light and sporty. I’m just back now, easing down a little.”

These replies are everyday and light on purpose. It is exactly that small, natural **sense of life** that makes them feel human.

## What Timeline actually solves

Timeline adds a dedicated layer of **time awareness and recall** for OpenClaw, so it can:

- answer questions about **now**, **recently**, and **specific past moments** more naturally
- keep a **coherent through-line of life** across casual chat
- shape memories that follow **ordinary real-world timing**, instead of random stitched fragments
- keep small details like **what someone is wearing** consistent, changing only when the scene calls for it—exercise, shower, sleep, going out, and the like
- **write timeline memories only when it makes sense**
- keep **durable long-term memory** and **timeline memory** in their own lanes, without cross-contaminating

First and foremost, it is built for **chat that feels like a real person**.

## Timeline Plugin × Persona Skill

If you use the [Persona Skill](https://clawhub.ai/tower1229/persona-skill), it produces a structured `persona/PERSONA_PROFILE.md` in your OpenClaw workspace. Timeline treats that file as the **preferred persona input**.

The pairing works because `PERSONA_PROFILE.md` maps directly into Timeline's canonical `PersonaContractV1`, while Timeline owns the **dynamic** side—*what is plausible at a given moment*, and *what everyday life should feel like*.

The flow is straightforward:

1. Persona Skill generates `persona/PERSONA_PROFILE.md`.
2. Timeline parses that file directly into its runtime persona contract.
3. If the file is missing, Timeline falls back to cached structured extraction from `SOUL.md`, `MEMORY.md`, and `IDENTITY.md`.
4. When it fills in “just now,” “last night,” or “the last few days,” outputs **stay closer to your Persona Skill setup** instead of sliding into generic agent improv.

Why that matters:

- `PERSONA_PROFILE.md` matches Timeline's canonical contract shape, so runtime persona grounding is more stable and more testable.
- The file is **easy to read from scripts**—unlike piping SOUL + MEMORY + IDENTITY through an extra LLM parse—so it is **faster and cheaper** when it exists.
- Power users sometimes worry that `PERSONA_PROFILE.md` will not track day-to-day companion evolution the way live runtime files do. Persona Skill already covers that: **`PERSONA_PROFILE.md` can stay aligned with SOUL + MEMORY + IDENTITY automatically**. You do not have to babysit it.

## Install

### 1. Install the plugin

```bash
openclaw plugins install stella-timeline-plugin
openclaw plugins enable stella-timeline-plugin
```

### 2. Initialize your workspace

Recommended:

```bash
npm exec --package=stella-timeline-plugin openclaw-timeline-setup -- --workspace ~/.openclaw/workspace
```

If you prefer to edit by hand, copy:

- `templates/AGENTS.fragment.md` → `AGENTS.md`
- `templates/SOUL.fragment.md` → `SOUL.md`

Then ensure your canonical daily-log directory exists. The default is `memory/`.

If you already have `persona/PERSONA_PROFILE.md`, place it under the workspace root `persona/` directory. Timeline will prefer it automatically. Legacy extraction cache files live under `.timeline-cache/persona-contract/`.

### 3. Start chatting

Try asking:

- “What are you doing right now?”
- “What did you do last night?”
- “What have you been up to these past few days?”

## Optional health check

```bash
npm exec --package=stella-timeline-plugin openclaw-timeline-doctor -- --workspace ~/.openclaw/workspace
```

## Local Quick Sync

If you are iterating in this repo and want to push the latest code into your local WSL OpenClaw environment for real testing, run:

```bash
npm run sync:local-openclaw
```

It will:

- build the latest `dist/`
- sync into `~/.openclaw/extensions/stella-timeline-plugin`
- refresh `~/.openclaw/workspace/skills/timeline`
- rerun workspace setup so `SOUL.md` stays upgraded
- tighten permissions so OpenClaw does not reject the plugin for being too broadly writable

## Documentation

Core references:

- [Architecture](./docs/architecture.md)
- [Timeline consumption protocol](./docs/timeline-consumption-protocol.md)
- [LLM vs runtime responsibilities](./docs/timeline-llm-runtime-boundary.md)
- [PERSONA_PROFILE.md specification](./docs/PERSONA_PROFILE.md)

## For maintainers

- [Publishing & release](./docs/PUBLISHING.md)
