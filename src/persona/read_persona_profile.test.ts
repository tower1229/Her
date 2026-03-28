import { parsePersonaProfileMarkdown } from './read_persona_profile';

describe('parsePersonaProfileMarkdown', () => {
  it('parses known sections, inline lists, nested lists, and retrieval units', () => {
    const parsed = parsePersonaProfileMarkdown(`
# PERSONA_PROFILE

## Meta
- schema_version: 1.0
- home_city: Shanghai
- home_timezone: Asia/Shanghai

## Soul
- temperament: quiet
- values: [continuity, authenticity]

## Stable Memory
- long_term_habits:
  - often works quietly from home
  - likes short reflective outings

## Retrieval Units
### unit: identity.home_base
- type: identity
- priority: high
- summary: She lives in Shanghai and spends much of her ordinary life around home.
`);

    expect(parsed.found).toBe(true);
    expect(parsed.sections.meta?.home_city).toBe('Shanghai');
    expect(parsed.sections.meta?.home_timezone).toBe('Asia/Shanghai');
    expect(parsed.sections.soul?.values).toEqual(['continuity', 'authenticity']);
    expect(parsed.sections.stable_memory?.long_term_habits).toEqual([
      'often works quietly from home',
      'likes short reflective outings',
    ]);
    expect(parsed.retrieval_units).toEqual([
      {
        id: 'identity.home_base',
        type: 'identity',
        priority: 'high',
        summary: 'She lives in Shanghai and spends much of her ordinary life around home.',
      },
    ]);
  });

  it('tolerates fenced blocks and reports parse warnings instead of failing', () => {
    const parsed = parsePersonaProfileMarkdown([
      '# PERSONA_PROFILE',
      '',
      '## Meta',
      '```yaml',
      'home_city: Shanghai',
      '```',
      '',
      '## Identity',
      '- life_stage: young adult',
    ].join('\n'));

    expect(parsed.found).toBe(true);
    expect(parsed.sections.identity?.life_stage).toBe('young adult');
    expect(parsed.parse_warnings).toContain('Ignored fenced block while parsing section "meta".');
  });

  it('reports malformed non-empty lines as parse warnings', () => {
    const parsed = parsePersonaProfileMarkdown([
      '# PERSONA_PROFILE',
      '',
      '## Soul',
      'This prose line should not be silently swallowed.',
      '- temperament: quiet',
    ].join('\n'));

    expect(parsed.sections.soul?.temperament).toBe('quiet');
    expect(parsed.parse_warnings).toContain(
      'Ignored malformed line in section "soul": This prose line should not be silently swallowed.',
    );
  });
});
