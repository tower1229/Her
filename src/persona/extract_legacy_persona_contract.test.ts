import * as fs from 'fs';
import * as path from 'path';
import { extractLegacyPersonaContract } from './extract_legacy_persona_contract';
import { LegacyCoreFiles } from './persona_source_types';

describe('extractLegacyPersonaContract', () => {
  const tmpDir = path.join(__dirname, '__legacy_extract_tmp__');

  beforeEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('retries invalid extractor output and caches the accepted contract', async () => {
    const legacy: LegacyCoreFiles = {
      soul: 'She is reflective.',
      memory: 'She likes quiet desk work.',
      identity: 'She lives in Shanghai.',
      found: { soul: true, memory: true, identity: true },
    };

    const run = jest.fn(async ({ validationFeedback }: { validationFeedback?: string[] }) => {
      if (!validationFeedback || validationFeedback.length === 0) {
        return {
          identity: { home_city: 'today in Shanghai' },
        };
      }
      return {
        identity: { home_city: 'Shanghai' },
        soul: { temperament: 'reflective' },
        memory: { long_term_habits: ['quiet desk work'] },
      };
    });

    const loaded = await extractLegacyPersonaContract({
      workspaceDir: tmpDir,
      legacy,
      extractor: {
        extractorVersion: 'extractor-v1',
        modelId: 'mock-model',
        run,
      },
      cacheDirName: '.timeline-cache/persona-contract',
      maxAttempts: 3,
    });

    expect(run).toHaveBeenCalledTimes(2);
    expect(loaded.contract.identity.home_city).toBe('Shanghai');
    expect(loaded.trace.cache_status).toBe('written');
    expect(fs.existsSync(path.join(tmpDir, '.timeline-cache', 'persona-contract'))).toBe(true);
  });
});
