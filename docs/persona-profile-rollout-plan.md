# Timeline Persona Profile Rollout Plan

> Status: proposed
> Audience: Timeline maintainers
> Related:
> [PERSONA_PROFILE.md](/mnt/c/Workspace/tower1229/Her/docs/PERSONA_PROFILE.md)
> [persona-profile-adapter-contract.md](/mnt/c/Workspace/tower1229/Her/docs/persona-profile-adapter-contract.md)

## 1. Current Integration Points

Today, Timeline reads legacy persona files directly in two places:

- CLI/default dependency path: [src/tools/timeline_resolve.ts:93](/mnt/c/Workspace/tower1229/Her/src/tools/timeline_resolve.ts#L93)
- OpenClaw runtime factory path: [src/runtime/openclaw_timeline_runtime.ts:1159](/mnt/c/Workspace/tower1229/Her/src/runtime/openclaw_timeline_runtime.ts#L1159)

Both currently return the legacy downstream shape:

- `soul`
- `memory`
- `identity`
- `available_sources`
- `should_constrain_generation`

That downstream shape is declared in [src/core/collect_sources.ts:5](/mnt/c/Workspace/tower1229/Her/src/core/collect_sources.ts#L5) and consumed by the collector in [src/core/collect_timeline_request.ts:59](/mnt/c/Workspace/tower1229/Her/src/core/collect_timeline_request.ts#L59).

## 2. Rollout Goal

Introduce `persona/PERSONA_PROFILE.md` support with these properties:

- preferred when present
- backward compatible with legacy workspaces
- defaults-safe when no persona files exist
- no source-specific logic below the adapter boundary
- no immediate downstream contract break

## 3. Recommended Delivery Strategy

Use a two-phase rollout.

### Phase 1

Add new ingestion and normalization logic, but keep downstream `TimelineCoreContext` unchanged.

### Phase 2

Optionally expose richer structured persona data downstream after the adapter is stable in production.

Do not combine both phases.

## 4. Proposed Module Map

Suggested new files:

- `src/persona/types.ts`
- `src/persona/read_persona_profile.ts`
- `src/persona/read_legacy_core_files.ts`
- `src/persona/normalize_persona_profile.ts`
- `src/persona/project_persona_context.ts`
- `src/persona/load_persona_context.ts`

Suggested test files:

- `src/persona/read_persona_profile.test.ts`
- `src/persona/read_legacy_core_files.test.ts`
- `src/persona/normalize_persona_profile.test.ts`
- `src/persona/project_persona_context.test.ts`
- `src/persona/load_persona_context.test.ts`

## 5. Proposed Interfaces

### 5.1 Parser Input

```ts
export interface PersonaWorkspaceReader {
  readTextFile(filePath: string): string;
}
```

### 5.2 Legacy Raw Inputs

```ts
export interface LegacyCoreFiles {
  soul: string;
  memory: string;
  identity: string;
  found: {
    soul: boolean;
    memory: boolean;
    identity: boolean;
  };
}
```

### 5.3 Parsed Persona Profile

```ts
export interface ParsedPersonaProfile {
  found: boolean;
  raw_text: string;
  sections: {
    meta?: Record<string, string | string[]>;
    identity?: Record<string, string | string[]>;
    soul?: Record<string, string | string[]>;
    stable_memory?: Record<string, string | string[]>;
    daily_rhythm_tendencies?: Record<string, string | string[]>;
    appearance_tendencies?: Record<string, string | string[]>;
    scene_anchors?: Record<string, string | string[]>;
    constraint_rules?: Record<string, string | string[]>;
  };
  parse_warnings: string[];
}
```

### 5.4 Adapter Result

```ts
export interface LoadedPersonaContext {
  normalized: NormalizedPersonaProfile;
  projected: TimelineCoreContext;
  trace: {
    source_kind: 'persona_profile' | 'legacy_core_files' | 'mixed' | 'defaults_only';
    files_found: string[];
    parse_warnings: string[];
    defaults_applied: string[];
    conflict_resolutions: string[];
  };
}
```

## 6. Implementation Steps

### Step 1. Add Persona Types

Create `src/persona/types.ts`.

Put these in it:

- `ParsedPersonaProfile`
- `LegacyCoreFiles`
- `NormalizedPersonaProfile`
- `LoadedPersonaContext`

Keep these types internal to the adapter layer for now.

### Step 2. Add Persona Profile Reader

Create `src/persona/read_persona_profile.ts`.

Responsibilities:

- read `persona/PERSONA_PROFILE.md`
- return `found=false` if missing
- parse known sections only
- keep unknown sections ignored but non-fatal
- preserve raw text
- collect parse warnings instead of throwing on small formatting issues

Important rule:

Parser should be tolerant, not fragile.

If a section is malformed, keep partial structured extraction and continue.

### Step 3. Add Legacy Reader

Create `src/persona/read_legacy_core_files.ts`.

Responsibilities:

- read `SOUL.md`
- read `MEMORY.md` or `memory.md`
- read `IDENTITY.md` or `IDENTITY`
- report boolean presence
- do no semantic inference here

Important rule:

This module only reads files.

It should not try to normalize meaning.

### Step 4. Add Normalizer

Create `src/persona/normalize_persona_profile.ts`.

Responsibilities:

- apply source priority
- merge explicit profile data with safe legacy supplements
- perform weak inference from legacy prose
- fill conservative defaults
- set `should_constrain_generation`
- record provenance

Important rule:

This is the only module where semantic merging should happen.

### Step 5. Add Compatibility Projection

Create `src/persona/project_persona_context.ts`.

Responsibilities:

- synthesize `soul` compatibility text
- synthesize `memory` compatibility text
- synthesize `identity` compatibility text
- set `available_sources`
- set `should_constrain_generation`

Important rule:

Projection text should be compact, structured, and citation-friendly.

Do not dump the entire raw profile back into one large block.

### Step 6. Add Unified Loader

Create `src/persona/load_persona_context.ts`.

Responsibilities:

- coordinate readers
- call normalizer
- call projector
- return `LoadedPersonaContext`

This should become the only public entrypoint used by Timeline runtime wiring.

## 7. Wiring Changes

### 7.1 CLI Default Dependency Path

Replace direct file reads in [src/tools/timeline_resolve.ts:93](/mnt/c/Workspace/tower1229/Her/src/tools/timeline_resolve.ts#L93) with a call to the unified adapter loader.

Suggested direction:

```ts
coreFiles: async () => loadTimelinePersonaContextFromWorkspace(process.cwd()).projected
```

If trace support is later desired, the richer `LoadedPersonaContext` can be attached to debug logging, but do not change the dependency signature in phase 1 unless necessary.

### 7.2 OpenClaw Runtime Path

Replace direct workspace file reads in [src/runtime/openclaw_timeline_runtime.ts:1159](/mnt/c/Workspace/tower1229/Her/src/runtime/openclaw_timeline_runtime.ts#L1159) with the same adapter entrypoint.

Suggested direction:

```ts
coreFiles: async () => loadTimelinePersonaContextFromWorkspace(workspaceDir).projected
```

### 7.3 Collector Layer

Do not change [src/core/collect_sources.ts:5](/mnt/c/Workspace/tower1229/Her/src/core/collect_sources.ts#L5) in phase 1 unless needed for optional internal trace plumbing.

Do not change [src/core/collect_timeline_request.ts:59](/mnt/c/Workspace/tower1229/Her/src/core/collect_timeline_request.ts#L59) in phase 1.

This is the key compatibility decision.

## 8. Projection Format Guidance

The compatibility strings should preserve structure.

Recommended style:

### `identity`

```text
Home city: Shanghai
Timezone: Asia/Shanghai
Life stage: young adult
Living style: urban, independent
Common zones: home study; neighborhood cafe; bookstore; gym
Occupation style: flexible knowledge work with substantial time at home
```

### `soul`

```text
Temperament: quiet, reflective, emotionally real but restrained
Emotional style: processes feelings inward first, then expresses them carefully
Social style: warm in familiar settings, not noisy by default
Values: continuity; authenticity; small lived details
```

### `memory`

```text
Long-term habits: often works quietly from home; likes short reflective outings; exercise is recurring
Long-term preferences: prefers calm places over loud crowds; likes ordinary but textured scenes
Durable commitments: temporal answers must follow Timeline facts rather than free improvisation
Appearance tendencies: comfort first; coherence over novelty; exercise usually triggers outfit change
Constraint rules: preserve same-day clothing continuity unless the event naturally requires change
```

This gives the reasoner something more structured than prose, without changing the current contract shape.

## 9. Minimal Weak Inference Rules

The first implementation should keep weak inference intentionally small.

Recommended initial inference set:

- city or country mentions
- home-working patterns
- exercise preference
- quiet or social preference
- common place anchors like home, cafe, bookstore, gym

Avoid inferring:

- precise fashion style
- strong relationship topology
- exact profession
- nightlife habits
- rare-scene bans unless explicitly stated

## 10. Defaulting Matrix

When fields are missing:

- `common_zones`: `[]`
- `long_term_habits`: `[]`
- `weekday_bias`: `[]`
- `default_home_style`: undefined
- `change_triggers`: `[]`
- `constraints.must`: `[]`
- `constraints.should`: `[]`
- `constraints.avoid`: `[]`

Set `should_constrain_generation=false` only if almost everything is empty and defaulted.

If meaningful signals exist in any of:

- identity anchors
- soul traits
- long-term habits
- durable commitments
- appearance rules

then `should_constrain_generation=true`.

## 11. Testing Matrix

### Unit Tests

`read_persona_profile.test.ts`

- parses required sections
- tolerates optional missing sections
- reports warnings for malformed blocks
- preserves raw text

`read_legacy_core_files.test.ts`

- reads each legacy file correctly
- respects fallback file names
- reports missing files as absent rather than error

`normalize_persona_profile.test.ts`

- profile only wins
- legacy only normalizes correctly
- profile overrides conflicting legacy values
- weak inference remains conservative
- defaults-only mode stays sparse

`project_persona_context.test.ts`

- emits stable string buckets
- includes important identity anchors
- includes important constraint summaries
- does not explode into giant unstructured dumps

`load_persona_context.test.ts`

- exercises end-to-end source priority
- verifies `available_sources`
- verifies `should_constrain_generation`
- verifies trace metadata

### Integration Tests

Update or add Timeline generation tests for:

- `persona/PERSONA_PROFILE.md` only workspace
- legacy-only workspace
- mixed workspace with explicit profile precedence
- empty workspace fallback

## 12. Suggested Milestone Breakdown

### Milestone A

Land parser, legacy reader, normalizer, projector, and unit tests.

No runtime wiring yet.

### Milestone B

Wire the adapter into both runtime entrypoints.

Keep collector and reasoner unchanged.

### Milestone C

Add integration coverage for profile-only and mixed workspaces.

### Milestone D

Optionally add internal debug trace for adapter provenance.

### Milestone E

Only if needed, design a versioned richer downstream persona contract.

## 13. Review Checklist

Before merging the Timeline implementation, confirm:

- no direct `SOUL.md` / `MEMORY.md` / `IDENTITY.md` reads remain in runtime wiring paths
- `persona/PERSONA_PROFILE.md` is preferred when present
- legacy workspaces still behave correctly
- empty workspaces do not crash
- downstream collector contract remains unchanged
- no source branching leaks into reasoner or guard code

## 14. Final Recommendation

Implement the adapter as a strict boundary layer, not as scattered conditional logic.

If maintainers preserve that rule, Timeline can adopt `persona/PERSONA_PROFILE.md` quickly and safely while keeping the current downstream behavior stable.
