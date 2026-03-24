# OpenClaw Timeline Plugin

Timeline gives OpenClaw something most agents still lack: a believable sense of time.

It is not just a memory helper. It is the layer that lets OpenClaw feel more like a real person in casual conversation by giving it:

- a sense of what it is doing now
- a way to recall what happened recently
- the ability to form and reuse timeline-shaped memories when needed
- a more believable real-world rhythm for meals, sleep, workdays, weekends, and holidays
- steadier same-day continuity in details like clothing, so small life scenes feel less random
- continuity without breaking your normal long-term memory system

The result is simple: chat feels warmer, more coherent, and more human.

## Why it matters

Human social connection depends on continuity.

When someone asks:

- "What are you doing right now?"
- "What did you do last night?"
- "What have you been up to lately?"

they are not asking for abstract facts. They are looking for presence, mood, context, and a sense that the other side has an ongoing life.

Timeline helps OpenClaw answer those questions with a stable, immersive personal reality instead of loose prompt improvisation.

## What it feels like

Without Timeline, answers to light social questions can drift, contradict each other, or feel empty.

With Timeline, OpenClaw can respond more like this:

> "I was still at home a while ago, sorting through a few work notes and trying to settle into the evening."

> "Last night I stayed in, ate a little late, and ended up watching something on the couch for a while."

> "These past few days have been pretty full. I've mostly been alternating between staying home, working through things, and going out once in a while to reset."

> "It's the weekend, so I moved a little slower this morning. I made something simple, stayed home for a bit, and only went out later in the afternoon."

> "I was at home earlier in something comfortable, but I changed before heading to the gym. Now I'm just back and winding down."

Those answers feel small and ordinary in exactly the right way. That is the point.

## What Timeline actually does

Timeline adds a dedicated time-awareness layer for OpenClaw so it can:

- answer "now", "recently", and past-time questions more naturally
- preserve continuity across casual chat
- keep generated memories aligned with ordinary real-world timing instead of random prompt improvisation
- keep small details like same-day appearance more stable, unless the scene itself implies a natural change
- write timeline memories only when appropriate
- keep normal durable memory and timeline memory from stepping on each other

It is built for immersive social chat first.

## Install

### 1. Install the plugin

```bash
openclaw plugins install stella-timeline-plugin --pin
openclaw plugins enable timeline-plugin
```

The npm package name is `stella-timeline-plugin`. The OpenClaw plugin id stays `timeline-plugin`.

### 2. Initialize your workspace

Recommended:

```bash
npm exec --package=stella-timeline-plugin openclaw-timeline-setup -- --workspace ~/.openclaw/workspace
```

If you prefer to edit the files yourself, copy:

- `templates/AGENTS.fragment.md` into `AGENTS.md`
- `templates/SOUL.fragment.md` into `SOUL.md`

Then make sure your canonical daily-log directory exists. The default is `memory/`.

### 3. Try it in chat

Ask things like:

- "What are you doing right now?"
- "What did you do last night?"
- "What have you been up to these past few days?"

## Optional check

```bash
npm exec --package=stella-timeline-plugin openclaw-timeline-doctor -- --workspace ~/.openclaw/workspace
```

## For maintainers

Release flow and publishing notes live in [docs/PUBLISHING.md](./docs/PUBLISHING.md).
