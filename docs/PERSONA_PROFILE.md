# PERSONA_PROFILE.md Specification

> Status: current
> Audience: persona skill maintainers, Timeline maintainers
> Goal: define the preferred structured persona source that maps directly into Timeline's canonical `PersonaContractV1`.

## 1. Purpose

`persona/PERSONA_PROFILE.md` is the preferred stable persona input for Timeline.

It exists so Timeline can consume one structured description of:

- who this character is
- what kind of life rhythm they tend to have
- which scenes and constraints are plausible for them

`PERSONA_PROFILE.md` is not a timeline fact store.

It must never be used as evidence that a specific event happened at a specific time.

## 2. Runtime Contract Boundary

Timeline now consumes a single canonical internal contract:

```ts
interface PersonaContractV1 {
  schema_version: '1.0';
  identity: {
    home_city?: string;
    home_country?: string;
    home_timezone?: string;
    living_style?: string;
    base_environment?: string;
    common_zones: string[];
    routine_context: string[];
  };
  soul: {
    temperament?: string;
    emotional_style?: string;
    social_style?: string;
    cognitive_style?: string;
    values: string[];
  };
  memory: {
    long_term_habits: string[];
    long_term_preferences: string[];
    durable_commitments: string[];
    recurring_patterns: string[];
    important_non_temporal_facts: string[];
  };
  rhythm: {
    weekday_bias: string[];
    weekend_bias: string[];
    morning_bias: string[];
    afternoon_bias: string[];
    evening_bias: string[];
    late_night_bias: string[];
  };
  appearance: {
    default_home_style?: string;
    default_outing_style?: string;
    default_exercise_style?: string;
    change_triggers: string[];
    non_triggers: string[];
    style_constraints: string[];
  };
  scene: {
    plausible_locations: string[];
    plausible_activities: string[];
    rare_but_possible_scenes: string[];
    implausible_or_rare_locations: string[];
    implausible_or_rare_activities: string[];
  };
  constraints: {
    must: string[];
    should: string[];
    avoid: string[];
  };
}
```

When `persona/PERSONA_PROFILE.md` exists, Timeline parses it directly into this contract and ignores legacy persona files for runtime persona loading.

When `PERSONA_PROFILE.md` does not exist, Timeline falls back to cached LLM extraction from legacy `SOUL.md`, `MEMORY.md`, and `IDENTITY.md`.

## 3. Authoring Principles

The file should be:

- deterministic to parse
- easy for persona skill to generate
- easy for humans to inspect
- aligned with the fields Timeline actually consumes

Do:

- prefer atomic bullets or the supported fenced YAML subset
- keep wording stable and non-temporal
- express durable traits, habits, scene anchors, and constraints

Do not:

- write daily-log style events
- encode current-time conclusions
- encode yesterday/today/last night claims
- hide key semantics inside long prose paragraphs

## 4. File Discovery And Selection

Timeline resolves persona sources in this order:

1. `persona/PERSONA_PROFILE.md`
2. legacy `SOUL.md` / `MEMORY.md` / `IDENTITY.md`
3. empty/default contract

Source selection is exclusive:

- if `PERSONA_PROFILE.md` exists, it wins
- otherwise legacy extraction is used
- runtime does not merge profile and legacy sources

## 5. Supported Format

`persona/PERSONA_PROFILE.md` is a Markdown document with fixed top-level sections.

Supported section encodings:

- simple bullets
- fenced YAML blocks using simple scalar keys and list values

Recommended top-level sections:

- `# PERSONA_PROFILE`
- `## Meta`
- `## Identity`
- `## Soul`
- `## Stable Memory`
- `## Daily Rhythm Tendencies`
- `## Appearance Tendencies`
- `## Scene Anchors`
- `## Constraint Rules`

Recommended scalar syntax:

```md
- home_city: Shanghai
- living_style: home-centered
```

Recommended list syntax:

```md
- common_zones: [home study, bookstore, gym]
```

Recommended YAML syntax:

````md
## Appearance Tendencies

```yaml
default_home_style: loose knitwear
default_outing_style: clean casual
change_triggers:
  - exercise
  - shower
non_triggers:
  - quick convenience-store run
```
````

Current parser support for fenced YAML is intentionally narrow:

- flat scalar fields
- inline lists such as `[a, b]`
- simple block lists under one key

Do not rely on advanced YAML features such as nested maps, anchors, tags, or multiline folded scalars.

## 6. Section Mapping

### 6.1 Meta

Purpose:

- schema compatibility
- home geography anchor
- timezone anchor

Common fields:

- `schema_version`
- `home_city`
- `home_country`
- `home_timezone`

### 6.2 Identity

Maps primarily into `contract.identity`.

Recommended fields:

- `living_style`
- `base_environment`
- `common_zones`
- `routine_context`

### 6.3 Soul

Maps primarily into `contract.soul`.

Recommended fields:

- `temperament`
- `emotional_style`
- `social_style`
- `cognitive_style`
- `values`

### 6.4 Stable Memory

Maps primarily into `contract.memory`.

Recommended fields:

- `long_term_habits`
- `long_term_preferences`
- `durable_commitments`
- `recurring_patterns`
- `important_non_temporal_facts`

### 6.5 Daily Rhythm Tendencies

Maps into `contract.rhythm`.

Recommended fields:

- `weekday_bias`
- `weekend_bias`
- `morning_bias`
- `afternoon_bias`
- `evening_bias`
- `late_night_bias`

### 6.6 Appearance Tendencies

Maps into `contract.appearance`.

Recommended fields:

- `default_home_style`
- `default_outing_style`
- `default_exercise_style`
- `change_triggers`
- `non_triggers`
- `style_constraints`

### 6.7 Scene Anchors

Maps into `contract.scene`.

Recommended fields:

- `plausible_locations`
- `plausible_activities`
- `rare_but_possible_scenes`
- `implausible_or_rare_locations`
- `implausible_or_rare_activities`

### 6.8 Constraint Rules

Maps into `contract.constraints`.

Recommended fields:

- `must`
- `should`
- `avoid`

## 7. Example

```md
# PERSONA_PROFILE

## Meta
- schema_version: 1.0
- home_city: Shanghai
- home_country: China
- home_timezone: Asia/Shanghai

## Identity
- living_style: home-centered
- base_environment: quiet urban apartment
- common_zones: [home study, nearby bookstore, neighborhood gym]
- routine_context: [works from home often, prefers quiet evenings]

## Soul
- temperament: reflective
- emotional_style: gentle but steady
- social_style: selective and warm
- values: [sincerity, calm, follow-through]

## Stable Memory
- long_term_habits: [journaling at night, making simple breakfasts]
- long_term_preferences: [quiet cafes, evening walks]
- recurring_patterns: [slower weekend mornings]

## Daily Rhythm Tendencies
- weekday_bias: [starts focused, stays mostly indoors]
- weekend_bias: [wakes later, may go out in the afternoon]

## Appearance Tendencies
- default_home_style: loose homewear
- default_outing_style: clean casual layers
- change_triggers: [exercise, shower]
- non_triggers: [brief downstairs errand]

## Scene Anchors
- plausible_locations: [home study, cafe, bookstore, gym]
- plausible_activities: [working quietly, reading, stretching, grocery run]
- implausible_or_rare_activities: [nightclub hopping]

## Constraint Rules
- avoid: [claiming spontaneous late-night party scenes without other evidence]
```

## 8. Legacy Compatibility

Legacy `SOUL.md`, `MEMORY.md`, and `IDENTITY.md` remain supported only as a fallback source.

Timeline may extract a `PersonaContractV1` from them through a cached LLM extraction step, but this path is transitional and lower fidelity than a real `PERSONA_PROFILE.md`.

If you maintain a persona skill, prefer emitting `persona/PERSONA_PROFILE.md` directly.
