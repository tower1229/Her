import * as fs from 'fs';
import * as path from 'path';
import { loadTimelinePersonaContractFromWorkspace } from './load_persona_contract';

describe('loadTimelinePersonaContractFromWorkspace', () => {
  const tmpDir = path.join(__dirname, '__persona_contract_tmp__');

  beforeEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('prefers PERSONA_PROFILE and ignores conflicting legacy files', async () => {
    fs.mkdirSync(path.join(tmpDir, 'persona'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'persona', 'PERSONA_PROFILE.md'),
      [
        '# PERSONA_PROFILE',
        '',
        '## Meta',
        '- home_city: Shanghai',
        '',
        '## Soul',
        '- temperament: reflective',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(path.join(tmpDir, 'IDENTITY.md'), 'She lives in Beijing.', 'utf8');

    const loaded = await loadTimelinePersonaContractFromWorkspace(tmpDir);
    expect(loaded.trace.source_kind).toBe('persona_profile');
    expect(loaded.contract.identity.home_city).toBe('Shanghai');
    expect(loaded.available_sources).toEqual(['persona_profile']);
  });

  it('fails closed on invalid PERSONA_PROFILE and does not fall back to legacy extraction', async () => {
    fs.mkdirSync(path.join(tmpDir, 'persona'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'persona', 'PERSONA_PROFILE.md'),
      [
        '# PERSONA_PROFILE',
        '',
        '## Meta',
        '- schema_version: 2.0',
        '- home_city: Shanghai',
        '',
        '## Stable Memory',
        '- long_term_preferences: [currently at home]',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(path.join(tmpDir, 'SOUL.md'), 'She is reflective.', 'utf8');

    const run = jest.fn(async () => ({
      schema_version: '1.0',
      soul: { temperament: 'reflective' },
    }));

    const loaded = await loadTimelinePersonaContractFromWorkspace(tmpDir, {
      extractLegacyPersonaContract: {
        extractorVersion: 'extractor-v1',
        modelId: 'mock-model',
        run,
      },
    });

    expect(run).not.toHaveBeenCalled();
    expect(loaded.trace.source_kind).toBe('defaults_only');
    expect(loaded.available_sources).toEqual([]);
    expect(loaded.trace.validation_failures.join(' ')).toContain('schema_version');
    expect(loaded.trace.validation_failures.join(' ')).toContain('temporal wording');
  });

  it('uses legacy extraction when PERSONA_PROFILE is absent', async () => {
    fs.writeFileSync(path.join(tmpDir, 'SOUL.md'), 'She is reflective.', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'IDENTITY.md'), 'She lives in Shanghai.', 'utf8');

    const loaded = await loadTimelinePersonaContractFromWorkspace(tmpDir, {
      extractLegacyPersonaContract: {
        extractorVersion: 'extractor-v1',
        modelId: 'mock-model',
        run: async () => ({
          schema_version: '1.0',
          identity: { home_city: 'Shanghai' },
          soul: { temperament: 'reflective' },
        }),
      },
      cacheDirName: '.timeline-cache/persona-contract',
      maxAttempts: 3,
    });

    expect(loaded.trace.source_kind).toBe('legacy_core_files');
    expect(loaded.contract.identity.home_city).toBe('Shanghai');
    expect(loaded.contract.soul.temperament).toBe('reflective');
    expect(loaded.available_sources).toEqual(['legacy_soul', 'legacy_identity']);
  });
});
