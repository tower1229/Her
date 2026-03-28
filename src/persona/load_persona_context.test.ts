import * as fs from 'fs';
import * as path from 'path';
import { loadTimelinePersonaContextFromWorkspace } from './load_persona_context';

describe('loadTimelinePersonaContextFromWorkspace', () => {
  const tmpDir = path.join(__dirname, '__persona_tmp__');

  beforeEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('prefers persona/PERSONA_PROFILE.md over conflicting legacy files', () => {
    fs.mkdirSync(path.join(tmpDir, 'persona'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'persona', 'PERSONA_PROFILE.md'),
      [
        '# PERSONA_PROFILE',
        '',
        '## Meta',
        '- schema_version: 1.0',
        '- home_city: Beijing',
        '- home_timezone: Asia/Shanghai',
        '',
        '## Identity',
        '- living_style: urban, independent',
        '- common_zones: [home study, bookstore]',
        '',
        '## Soul',
        '- temperament: reflective',
        '',
        '## Stable Memory',
        '- long_term_habits:',
        '  - often works quietly from home',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(path.join(tmpDir, 'IDENTITY.md'), 'She lives in Shanghai.', 'utf8');

    const loaded = loadTimelinePersonaContextFromWorkspace(tmpDir);

    expect(loaded.trace.source_kind).toBe('mixed');
    expect(loaded.projected.identity).toContain('Home city: Beijing');
    expect(loaded.projected.identity).not.toContain('Home city: Shanghai');
    expect(loaded.trace.conflict_resolutions).toContain('profile home_city "Beijing" kept over legacy "Shanghai"');
    expect(loaded.projected.available_sources).toEqual(['soul', 'memory', 'identity']);
    expect(loaded.projected.should_constrain_generation).toBe(true);
  });

  it('does not let legacy files reshape a dimension already provided by the profile', () => {
    fs.mkdirSync(path.join(tmpDir, 'persona'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'persona', 'PERSONA_PROFILE.md'),
      [
        '# PERSONA_PROFILE',
        '',
        '## Identity',
        '- living_style: urban, independent',
        '',
        '## Soul',
        '- temperament: reflective',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(path.join(tmpDir, 'SOUL.md'), 'She is warm with friends and socially active.', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'IDENTITY.md'), 'She often works from her home study in Shanghai.', 'utf8');

    const loaded = loadTimelinePersonaContextFromWorkspace(tmpDir);

    expect(loaded.projected.identity).toContain('Living style: urban, independent');
    expect(loaded.projected.identity).not.toContain('Routine context:');
    expect(loaded.projected.soul).toContain('Temperament: reflective');
    expect(loaded.projected.soul).not.toContain('Social style:');
  });

  it('falls back to legacy files and preserves meaningful persona constraints', () => {
    fs.writeFileSync(path.join(tmpDir, 'SOUL.md'), 'She is introspective, quiet, and reflective.', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'MEMORY.md'), 'She often works from her home study and likes exercise.', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'IDENTITY.md'), 'She lives in Shanghai.', 'utf8');

    const loaded = loadTimelinePersonaContextFromWorkspace(tmpDir);

    expect(loaded.trace.source_kind).toBe('legacy_core_files');
    expect(loaded.projected.identity).toContain('Home city: Shanghai');
    expect(loaded.projected.soul).toContain('Temperament: reflective');
    expect(loaded.projected.memory).toContain('Plausible activities: Exercise');
    expect(loaded.projected.should_constrain_generation).toBe(true);
  });

  it('supports legacy fallback filenames and partial legacy workspaces', () => {
    fs.writeFileSync(path.join(tmpDir, 'memory.md'), 'She often works from her home study and likes exercise.', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'IDENTITY'), 'She lives in Shanghai.', 'utf8');

    const loaded = loadTimelinePersonaContextFromWorkspace(tmpDir);

    expect(loaded.trace.source_kind).toBe('legacy_core_files');
    expect(loaded.projected.identity).toContain('Home city: Shanghai');
    expect(loaded.projected.memory).toContain('Long-term preferences: Exercise is a plausible recurring part of life.');
    expect(loaded.projected.available_sources).toEqual(['memory', 'identity']);
    expect(loaded.projected.should_constrain_generation).toBe(true);
  });

  it('returns sparse defaults when no persona files exist', () => {
    const loaded = loadTimelinePersonaContextFromWorkspace(tmpDir);

    expect(loaded.trace.source_kind).toBe('defaults_only');
    expect(loaded.projected.available_sources).toEqual([]);
    expect(loaded.projected.should_constrain_generation).toBe(false);
    expect(loaded.projected.soul).toBe('');
    expect(loaded.projected.memory).toBe('');
    expect(loaded.projected.identity).toBe('');
  });
});
