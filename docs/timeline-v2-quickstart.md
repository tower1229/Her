# Timeline Plugin v2 Quickstart

> Status: operator quickstart
> Audience: people deciding whether to install the plugin and how to validate it quickly

## 1. What you get

After installation, the plugin gives OpenClaw three timeline-oriented tools:
- `timeline_resolve` — canonical temporal fact retrieval / guarded generation;
- `timeline_status` — runtime registration + last-run inspection;
- `timeline_repair` — malformed log / path / recent trace diagnostics.

## 2. Prerequisites

- an OpenClaw environment where local plugins are supported;
- Node.js 22+;
- access to the timeline `memory/` directory you want the plugin to use;
- a place to persist trace logs if you enable tracing.

## 3. Install from a local checkout

```bash
git clone https://github.com/tower1229/Her.git
cd Her
npm install
npm run build
openclaw plugins install -l .
```

## 4. Recommended first configuration

At minimum, decide:
- whether `enableTrace` should be on by default;
- where `traceLogPath` should live;
- what canonical memory root the plugin should treat as authoritative.

## 5. First validation flow

1. Ask a direct temporal question such as “What are you doing right now?”
2. Confirm the request routes to `timeline_resolve`.
3. Inspect `timeline_status` to verify the plugin registered correctly and captured a last-run snapshot.
4. If the target daily log looks malformed, run `timeline_repair` against the relevant date/file.
5. Check that trace output exists if tracing is enabled.

## 6. Recommended evaluation questions

Use these to decide whether the plugin fits your environment:
- Does the agent need deterministic temporal recall instead of prompt-only memory behavior?
- Do you want append-only day-log writes with canonical path rules?
- Will operators need to inspect or repair timeline logs after bad runs?
- Is a draft-but-structured local plugin acceptable, or do you need a fully stable GA plugin today?

## 7. When not to install yet

You may want to wait if:
- your deployment cannot side-load local plugins;
- you need a finished GA release rather than a `2.0.0-draft` plugin;
- your use case does not require timeline-specific diagnostics or canonical writes.
