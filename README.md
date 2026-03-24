# OpenClaw Timeline Plugin

Timeline gives OpenClaw a canonical time-aware memory layer for questions like:

- What are you doing now?
- What happened last night?
- What have you been up to recently?

Instead of answering those from loose prompt conventions, Timeline routes them through a structured runtime that can reuse existing daily-log facts, reason over a time window, and append guarded new entries when policy allows it.

## What it ships

- `timeline_resolve` as the canonical timeline tool
- append-only daily-log writes with path and lock guards
- bundled Timeline skill routing
- trace logging for runtime diagnosis
- smoke and unit test coverage for the plugin runtime

## Install

### Install from npm

```bash
openclaw plugins install stella-timeline-plugin --pin
openclaw plugins enable timeline-plugin
```

The npm package name is `stella-timeline-plugin`. The OpenClaw plugin id remains `timeline-plugin`.

### Install from a local checkout

```bash
git clone https://github.com/tower1229/Her.git
cd Her
npm install
npm run build
openclaw plugins install -l .
openclaw plugins enable timeline-plugin
```

## Required workspace setup

Timeline needs contract text in the OpenClaw workspace so the agent writes and consumes daily logs consistently.

Run:

```bash
npm exec --package=stella-timeline-plugin openclaw-timeline-setup -- --workspace ~/.openclaw/workspace
```

If you are working from a local checkout, you can also run:

```bash
npm run setup:workspace -- --workspace ~/.openclaw/workspace
```

That command idempotently updates:

- `AGENTS.md`
- `SOUL.md`
- the canonical daily-log root, defaulting to `memory/`

## Workspace doctor

To verify the install:

```bash
npm exec --package=stella-timeline-plugin openclaw-timeline-doctor -- --workspace ~/.openclaw/workspace
```

From a local checkout:

```bash
npm run doctor:workspace -- --workspace ~/.openclaw/workspace
```

## Migrating existing daily logs

If you already have `memory/YYYY-MM-DD.md` files, run:

```bash
npm run migrate:memory
```

The migration script only rewrites files it can safely recognize as Timeline-style daily logs, keeps `.bak` backups, and leaves mostly free-form prose files untouched.

## Configuration

The plugin manifest exposes:

- `enableTrace`
- `traceLogPath`
- `canonicalMemoryRoot`
- `reasonerTimeoutMs`
- `reasonerSessionPrefix`
- `reasonerMessageLimit`
- `sessionHistoryLimit`
- `memorySearchMaxResults`

## Operations notes

- Treat the plugin as trusted in-process code inside OpenClaw.
- Keep the canonical memory root under versioned backup if the timeline matters to you.
- Leave `enableTrace` on while integrating; disable it only if you have another observability path.
- If you want Timeline data isolated from older free-form logs, point `canonicalMemoryRoot` at a dedicated directory.

## Development

```bash
npm run verify
npm run test:smoke
```

Optional live experience test:

```bash
npm run test:live-experience
```

## Publishing

Use the release script after setting `name` and `version` in `package.json`:

```bash
npm run release -- --push
```

See [docs/PUBLISHING.md](./docs/PUBLISHING.md) for the local maintainer release flow.

## Further reading

- [README_ZH.md](./README_ZH.md)
- [docs/timeline-north-star.md](./docs/timeline-north-star.md)
- [docs/timeline-llm-runtime-boundary.md](./docs/timeline-llm-runtime-boundary.md)
- [docs/timeline-collector-reasoner-interface.md](./docs/timeline-collector-reasoner-interface.md)
- [docs/timeline-query-semantics.md](./docs/timeline-query-semantics.md)
- [docs/timeline-consumption-protocol.md](./docs/timeline-consumption-protocol.md)
