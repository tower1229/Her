# OpenClaw Timeline Plugin Architecture Diagram

```mermaid
flowchart TD
    U[User temporal query] --> M[OpenClaw model]
    M --> S[Bundled timeline skill\n(SKILL.md routing rules)]
    S --> T[timeline_resolve tool]

    subgraph Plugin[Timeline OpenClaw Plugin]
      T --> W[resolve-window]
      W --> SH[sessions_history]
      W --> MG[memory_get]
      W --> MS[memory_search optional]
      MG --> P[parse-memory]
      P --> F[fingerprint]
      F --> A[inherit-appearance]
      A --> B[build TimelineWindow / Episode]
      B --> C{resolution.mode}
      C -->|read_only_hit| R[return structured JSON]
      C -->|generated_new| WE[write-episode append-only]
      WE --> DL[memory/YYYY-MM-DD.md]
      WE --> TL[trace / run log]
      WE --> R
    end

    subgraph Hooks[Lifecycle Hooks]
      H1[pre-compaction flush] --> T
      H2[session snapshot] --> TL
      H3[audit hook] --> TL
    end

    R --> M
    M --> O[Grounded natural-language reply\nor downstream skill consumption]
```

## Reading Guide

- The **skill** is only the routing and behavior layer.
- The **tool** is the sole timeline execution core.
- **Hooks** reuse the same runtime entrypoints or trace sinks.
- Markdown daily logs remain user-visible, but canonical writes are mediated by timeline code.
