import * as fs from 'fs';
import * as path from 'path';
import { extractLegacyPersonaContract } from './extract_legacy_persona_contract';
import { computePersonaContractCacheKey, computePersonaContractSourceHash } from './persona_contract_cache';
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
        schema_version: '1.0',
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
    expect(loaded.available_sources).toEqual(['legacy_soul', 'legacy_memory', 'legacy_identity']);
    expect(loaded.trace.cache_status).toBe('written');
    expect(fs.existsSync(path.join(tmpDir, '.timeline-cache', 'persona-contract'))).toBe(true);
  });

  it('uses a valid cache hit without calling the extractor again', async () => {
    const legacy: LegacyCoreFiles = {
      soul: 'She is reflective.',
      memory: 'She likes quiet desk work.',
      identity: 'She lives in Shanghai.',
      found: { soul: true, memory: true, identity: true },
    };

    const run = jest.fn(async () => ({
      schema_version: '1.0',
      identity: { home_city: 'Shanghai' },
      soul: { temperament: 'reflective' },
    }));

    await extractLegacyPersonaContract({
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

    expect(run).toHaveBeenCalledTimes(1);
    expect(loaded.trace.cache_status).toBe('hit');
    expect(loaded.contract.identity.home_city).toBe('Shanghai');
  });

  it('rejects invalid cache entries and re-runs extraction', async () => {
    const legacy: LegacyCoreFiles = {
      soul: 'She is reflective.',
      memory: 'She likes quiet desk work.',
      identity: 'She lives in Shanghai.',
      found: { soul: true, memory: true, identity: true },
    };

    const cacheDir = path.join(tmpDir, '.timeline-cache', 'persona-contract');
    fs.mkdirSync(cacheDir, { recursive: true });
    const sourceHash = computePersonaContractSourceHash(legacy);
    const descriptor = {
      workspaceDir: tmpDir,
      cacheDirName: '.timeline-cache/persona-contract',
      sourceHash,
      contractVersion: '1.0',
      extractorVersion: 'extractor-v1',
      modelId: 'mock-model',
      validatorVersion: '1',
    };
    const cacheKey = computePersonaContractCacheKey(descriptor);
    fs.writeFileSync(
      path.join(cacheDir, `${cacheKey}.json`),
      JSON.stringify({
        schema_version: '1.0',
        cache_key: cacheKey,
        metadata: {
          source_hash: sourceHash,
          contract_version: '1.0',
          extractor_version: 'extractor-v1',
          model_id: 'mock-model',
          validator_version: '1',
        },
        contract: {
          identity: { home_city: 'today in Shanghai' },
        },
      }),
      'utf8',
    );

    const run = jest.fn(async () => ({
      schema_version: '1.0',
      identity: { home_city: 'Shanghai' },
      soul: { temperament: 'reflective' },
    }));

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

    expect(run).toHaveBeenCalledTimes(1);
    expect(loaded.trace.cache_status).toBe('written');
    expect(loaded.contract.identity.home_city).toBe('Shanghai');
  });
});
