# PERSONA_PROFILE.md Specification

> Status: proposed
> Audience: persona skill maintainers, Timeline maintainers
> Goal: define a single structured persona file that can replace direct multi-file consumption of `SOUL.md`, `MEMORY.md`, and `IDENTITY.md` for Timeline memory synthesis, while preserving backward compatibility with existing OpenClaw workspaces.

## 1. Purpose

`persona/PERSONA_PROFILE.md` is the canonical structured persona file for Timeline-aware generation.

It exists to provide Timeline with a stable, machine-readable, and semantically rich persona source so Timeline can:

- generate persona-consistent temporal memories
- explain persona grounding and generation constraints
- maintain scene continuity and appearance continuity
- infer more plausible day-to-day life scenes

`PERSONA_PROFILE.md` is not a timeline fact store.

It must never be treated as evidence that a specific event happened at a specific time.

## 2. Scope

`persona/PERSONA_PROFILE.md` should replace the role currently played by the combined reading of:

- `SOUL.md`
- `MEMORY.md`
- `IDENTITY.md`

It should not replace:

- session hard facts
- timeline canon daily logs
- semantic memory search
- current conversation context
- Timeline internal world-rhythm inference

## 3. Design Boundary

`persona/PERSONA_PROFILE.md` provides stable persona inputs.

Timeline provides dynamic temporal reasoning.

### 3.1 PERSONA_PROFILE Is Responsible For

- stable identity anchors
- stable personality signals
- long-term habits and preferences
- durable commitments and constraints
- plausible life-scene anchors
- appearance tendencies and outfit-change rules
- negative constraints and implausible scene boundaries

### 3.2 Timeline Is Responsible For

- interpreting the user time query
- normalizing time windows
- deriving season from time plus geography
- deriving weekday, weekend, holiday, and time-band context
- deciding whether an activity is plausible now
- deciding whether same-day continuity applies
- deciding whether clothing should be inherited or changed for the generated event
- choosing between reuse, generation, and empty-window outcomes

### 3.3 Explicit Non-Goals For PERSONA_PROFILE

`persona/PERSONA_PROFILE.md` should not contain:

- current-time claims such as "it is spring now"
- event claims such as "last night she went to the gym"
- direct temporal answers such as "she is currently at home"
- precomputed season or holiday outputs
- generated daily-log entries

## 4. Architectural Requirement

Timeline should prefer `persona/PERSONA_PROFILE.md` when present.

If it is absent, Timeline should use an adapter layer that extracts as much information as possible from existing core files and fills the rest with safe defaults.

This architecture is recommended.

### 4.1 Required Rule

The adapter layer must normalize all persona inputs into one internal normalized contract before the collector builds downstream input.

Downstream layers should not know whether the source was:

- `persona/PERSONA_PROFILE.md`
- legacy `SOUL.md` + `MEMORY.md` + `IDENTITY.md`
- partial legacy files plus defaults

### 4.2 Why This Is The Right Boundary

This keeps compatibility logic at the ingestion edge and prevents downstream complexity from leaking into:

- collector output
- reasoner prompt construction
- guard logic
- output building
- trace and write behavior

### 4.3 Recommended Internal Model

Timeline may introduce an internal normalized structure such as:

```ts
interface NormalizedPersonaProfile {
  source_kind: 'persona_profile' | 'legacy_core_files' | 'mixed' | 'defaults_only';
  source_detail: string[];
  should_constrain_generation: boolean;
  identity: { ... };
  soul: { ... };
  memory: { ... };
  rhythm: { ... };
  appearance: { ... };
  scene_anchors: { ... };
  constraints: { ... };
  raw_text: {
    persona_profile?: string;
    soul?: string;
    memory?: string;
    identity?: string;
  };
}
```

The exact type may vary, but the normalization boundary should be stable.

## 5. File Discovery

Timeline should resolve persona input in this priority order:

1. `persona/PERSONA_PROFILE.md`
2. `SOUL.md` + `MEMORY.md` + `IDENTITY.md` or their available subset
3. defaults-only normalized persona profile

If both `persona/PERSONA_PROFILE.md` and legacy files exist, `persona/PERSONA_PROFILE.md` should be the primary semantic source.

Legacy files may still be retained for compatibility with non-Timeline systems, but Timeline should avoid mixing conflicting meanings unless an explicit merge policy is defined.

## 6. Authoring Principles

The file must be:

- structured enough for deterministic parsing
- readable enough for human maintainers
- granular enough for reasoner citation
- stable enough to support long-term evolution

The file should not be written as a single prose essay.

The file should prefer atomic entries over long free-form paragraphs.

## 7. Normative Format

`persona/PERSONA_PROFILE.md` is a Markdown document with fixed top-level sections.

Each section uses simple structured bullets or fenced YAML blocks.

The format should remain parse-friendly with low ambiguity.

### 7.1 Required Top-Level Sections

- `# PERSONA_PROFILE`
- `## Meta`
- `## Identity`
- `## Soul`
- `## Stable Memory`
- `## Daily Rhythm Tendencies`
- `## Appearance Tendencies`
- `## Scene Anchors`
- `## Constraint Rules`

### 7.2 Optional Top-Level Sections

- `## Relationship Signals`
- `## Language And Expression`
- `## Retrieval Units`
- `## Migration Notes`

### 7.3 Recommended Entry Shapes

The following forms are recommended:

- scalar bullet: `- home_city: Shanghai`
- list bullet: `- common_zones: [home study, neighborhood cafe, gym]`
- grouped subsection with bullets
- fenced YAML only when the section is inherently structured and multiline

Do not rely on tables as the primary storage format.

Do not hide critical semantics inside long unstructured prose.

## 8. Normative Semantics By Section

### 8.1 Meta

Purpose:

- versioning
- parser compatibility
- home geography anchor
- source ownership metadata

Required fields:

- `schema_version`
- `persona_id`
- `home_city`
- `home_country`
- `home_timezone`

Optional fields:

- `primary_language`
- `profile_version`
- `maintained_by`

Semantics:

- `home_city` is a geographic anchor, not a current location claim
- `home_timezone` is the preferred temporal anchor for current-state synthesis
- `schema_version` must be machine-readable and stable

### 8.2 Identity

Purpose:

- provide real-life grounding
- define the stable social and physical context of daily life

Recommended fields:

- `life_stage`
- `living_style`
- `base_environment`
- `common_zones`
- `mobility_radius`
- `occupation_style`
- `routine_context`

Semantics:

- identity fields describe what kind of life is normal for this persona
- they should make some scenes more plausible than others
- they should not be interpreted as guarantees that a scene happened

### 8.3 Soul

Purpose:

- define temperament and experiential style
- constrain emotional and narrative texture

Recommended fields:

- `temperament`
- `emotional_style`
- `social_style`
- `cognitive_style`
- `values`
- `aesthetic_bias`

Semantics:

- soul fields should affect how generated scenes feel
- soul fields should not override hard facts
- soul fields should be durable rather than situational

### 8.4 Stable Memory

Purpose:

- encode long-lived preferences, habits, commitments, and durable autobiographical context

Recommended fields:

- `long_term_habits`
- `long_term_preferences`
- `durable_commitments`
- `recurring_patterns`
- `important_non_temporal_facts`

Semantics:

- these are stable memory constraints, not dated events
- they should help reasoner explain why a generated event fits the person
- they should remain true across many different timeline queries

### 8.5 Daily Rhythm Tendencies

Purpose:

- provide high-level behavioral tendencies that Timeline can combine with dynamic time reasoning

Recommended fields:

- `weekday_bias`
- `weekend_bias`
- `morning_bias`
- `afternoon_bias`
- `evening_bias`
- `late_night_bias`

Semantics:

- these are tendencies, not schedules
- they should express what is usually plausible
- Timeline still decides the final scene using actual time context

### 8.6 Appearance Tendencies

Purpose:

- support same-day appearance continuity
- define default clothing logic and change triggers

Recommended fields:

- `default_home_style`
- `default_outing_style`
- `default_exercise_style`
- `appearance_priority`
- `change_triggers`
- `non_triggers`
- `style_constraints`

Semantics:

- this section defines stable clothing logic, not current clothing state
- it should help reasoner decide when outfit inheritance is appropriate
- it should reduce unjustified same-day appearance drift

### 8.7 Scene Anchors

Purpose:

- provide concrete life-scene priors so generation does not collapse into generic template scenes

Recommended fields:

- `plausible_locations`
- `plausible_activities`
- `rare_but_possible_scenes`
- `implausible_or_rare_locations`
- `implausible_or_rare_activities`

Semantics:

- scene anchors should make generation more concrete
- they should define the everyday world this persona actually inhabits
- they should not overfit the model into repeating the same scene every time

### 8.8 Constraint Rules

Purpose:

- provide direct support for `constraint_basis`
- separate hard restrictions from soft tendencies

Required subsections:

- `must`
- `should`
- `avoid`

Semantics:

- `must` means generation should not violate the rule unless existing hard facts already force a contradiction
- `should` means preferred guidance
- `avoid` means low-plausibility or undesirable directions

This section is one of the most important for Timeline generation quality.

## 9. Retrieval Units

If present, `## Retrieval Units` should contain atomic citation-ready entries.

This section is optional but strongly recommended.

Purpose:

- make reasoner grounding easier
- reduce dependence on long raw prose
- improve consistency of `persona_basis` and `constraint_basis`

Recommended shape:

```md
## Retrieval Units

### unit: identity.home_base
- type: identity
- priority: high
- summary: She lives in Shanghai and spends much of her ordinary life between home, nearby cafes, bookstores, and exercise spaces.

### unit: appearance.exercise_change
- type: constraint
- priority: high
- summary: Exercise is a strong change trigger and should usually switch clothing away from homewear.
```

## 10. Required Behavioral Guarantees

A valid `persona/PERSONA_PROFILE.md` should allow Timeline to do all of the following:

- generate concrete and persona-consistent `location`
- generate concrete and persona-consistent `action`
- generate fitting emotional texture
- generate plausible `appearance`
- justify continuity or change of appearance
- produce non-empty `persona_basis` when persona constraints exist
- produce non-empty `constraint_basis` when persona constraints exist
- avoid obviously generic scenes when stronger persona anchors are available

## 11. Missing Data And Default Completion

Timeline must support partial persona inputs.

Missing information should not break downstream behavior.

### 11.1 Defaulting Rules

If some fields are missing, the adapter may fill neutral defaults such as:

- no explicit appearance preference
- no explicit late-night bias
- no explicit implausible scene list

Defaults must be conservative.

Defaults must reduce overclaiming rather than inventing strong personality facts.

### 11.2 Safe Default Strategy

Use this order:

1. parse explicit structured profile data
2. infer weak signals from legacy files
3. fill only neutral fallback values

Do not invent strong autobiographical claims during normalization.

Do not convert ambiguous prose into overly specific hard constraints.

### 11.3 Constraint Flag

`should_constrain_generation` should be true whenever meaningful persona signals exist from either:

- `persona/PERSONA_PROFILE.md`
- legacy core files

If only defaults exist and no real persona signals were found, it may remain false.

## 12. Legacy Adapter Requirements

If `persona/PERSONA_PROFILE.md` is missing, the adapter should attempt to map existing files into the normalized contract.

### 12.1 Legacy Mapping Intent

- `SOUL.md` maps primarily into `Soul`
- `MEMORY.md` maps primarily into `Stable Memory`
- `IDENTITY.md` maps primarily into `Identity`

### 12.2 Legacy Extraction Rules

The adapter should prefer weak structured extraction over brittle over-interpretation.

Examples:

- a line about living in Shanghai can populate `home_city` or identity anchors
- a line about often working quietly from home can populate `recurring_patterns`
- a line about liking exercise can populate `long_term_preferences` or plausible activities

The adapter should not:

- transform a vague tone description into many specific rules
- invent detailed appearance logic that is not supported by the source text
- infer current events from legacy files

### 12.3 Provenance

The normalized profile should retain source provenance so maintainers can inspect where each signal came from if needed.

Recommended provenance levels:

- explicit profile
- legacy explicit
- inferred weakly
- defaulted

## 13. Downstream Compatibility Rule

The collector and downstream runtime should continue exposing the existing stable persona-facing surface unless and until a deliberate contract migration is made.

That means Timeline may internally normalize to a richer structure, but the compatibility layer should preserve the effective behavior expected by downstream consumers.

In practical terms:

- ingestion may change
- normalization may change
- fallback logic may change
- collector output shape should remain stable unless intentionally versioned

## 14. Quality Bar

A high-quality `persona/PERSONA_PROFILE.md` should make generated memory feel:

- grounded
- ordinary in the right way
- city- and life-consistent
- appearance-consistent
- not overdramatic
- not generic

If a generated memory could plausibly belong to almost anyone, the profile is probably underspecified.

If a generated memory becomes rigid and repetitive, the profile is probably overspecified.

## 15. Example Skeleton

```md
# PERSONA_PROFILE

## Meta
- schema_version: 1.0
- persona_id: her
- home_city: Shanghai
- home_country: China
- home_timezone: Asia/Shanghai
- primary_language: zh-CN

## Identity
- life_stage: young adult
- living_style: urban, independent
- base_environment: city apartment
- common_zones: [home study, neighborhood cafe, bookstore, gym]
- occupation_style: flexible knowledge work with substantial time at home

## Soul
- temperament: quiet, reflective, emotionally real but restrained
- emotional_style: processes feelings inward first, then expresses them carefully
- social_style: warm in familiar settings, not noisy by default
- values: continuity, authenticity, small lived details

## Stable Memory
- long_term_habits:
  - often works quietly from home
  - likes short reflective outings
  - exercise is a real recurring part of life
- long_term_preferences:
  - prefers calm places over loud crowds
  - likes scenes that feel ordinary but textured
- durable_commitments:
  - temporal answers must follow Timeline facts rather than free improvisation

## Daily Rhythm Tendencies
- weekday_bias:
  - daytime often leans toward focused work or study
- weekend_bias:
  - mornings are slower and more unhurried
- evening_bias:
  - may decompress through exercise, a short outing, or quiet time
- late_night_bias:
  - prefers winding down, rest, or sleep over high-energy social scenes

## Appearance Tendencies
- default_home_style: soft casual homewear
- default_outing_style: neat casual outfit with light coordination
- default_exercise_style: functional sportswear
- appearance_priority:
  - comfort first
  - coherence over novelty
- change_triggers:
  - exercise
  - bathing
  - formal outing
  - weather shift
- non_triggers:
  - same-room continuation
  - short uninterrupted home activity

## Scene Anchors
- plausible_locations:
  - home study
  - neighborhood cafe corner
  - bookstore window seat
  - residential gym
- plausible_activities:
  - quiet focused work
  - reading
  - reflective walking
  - exercise
- implausible_or_rare_locations:
  - nightclub
  - luxury formal venue

## Constraint Rules
- must:
  - do not contradict established canon facts
  - do not fabricate scenes outside ordinary city-life plausibility without support
- should:
  - keep current-state scenes grounded and lived-in
  - preserve same-day clothing continuity unless the event naturally requires change
- avoid:
  - generic template scenes
  - random dramatic social events without support
  - seasonally absurd clothing without justification
```

## 16. Migration Guidance

For persona skill maintainers:

- generate `persona/PERSONA_PROFILE.md` directly from the richer persona source of truth
- prefer explicit fields over prose whenever possible
- keep the file stable across updates
- preserve human readability

For Timeline maintainers:

- implement `persona/PERSONA_PROFILE.md` as the preferred source
- add a legacy adapter for existing workspaces
- normalize before collector output is built
- keep the downstream contract unchanged during the migration phase

## 17. Final Rule

`persona/PERSONA_PROFILE.md` should be treated as a persona-generation contract, not as a temporal fact source.

If this rule is preserved, Timeline can safely use the file to generate richer and more coherent memories without collapsing persona data into fake history.
