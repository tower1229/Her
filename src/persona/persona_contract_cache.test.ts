import * as fs from 'fs';
import * as path from 'path';
import {
  computePersonaContractCacheKey,
  computePersonaContractSourceHash,
  readPersonaContractCache,
  writePersonaContractCache,
} from './persona_contract_cache';
import { emptyPersonaContract } from './persona_contract';

describe('persona_contract_cache', () => {
  const tmpDir = path.join(__dirname, '__persona_cache_tmp__');

  beforeEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes and re-reads cache entries by the full cache key', () => {
    const descriptor = {
      workspaceDir: tmpDir,
      cacheDirName: '.timeline-cache/persona-contract',
      sourceHash: computePersonaContractSourceHash({ soul: 'a', memory: 'b', identity: 'c' }),
      contractVersion: '1.0',
      extractorVersion: 'extractor-v1',
      modelId: 'mock-model',
      validatorVersion: 'validator-v1',
    };

    writePersonaContractCache(descriptor, {
      ...emptyPersonaContract(),
      identity: {
        ...emptyPersonaContract().identity,
        home_city: 'Shanghai',
      },
    });

    const loaded = readPersonaContractCache(descriptor);
    expect(loaded?.cache_key).toBe(computePersonaContractCacheKey(descriptor));
    expect(loaded?.contract.identity.home_city).toBe('Shanghai');
  });

  it('invalidates cache reads when any cache-key component changes', () => {
    const descriptor = {
      workspaceDir: tmpDir,
      cacheDirName: '.timeline-cache/persona-contract',
      sourceHash: computePersonaContractSourceHash({ soul: 'a', memory: 'b', identity: 'c' }),
      contractVersion: '1.0',
      extractorVersion: 'extractor-v1',
      modelId: 'mock-model',
      validatorVersion: 'validator-v1',
    };

    writePersonaContractCache(descriptor, {
      ...emptyPersonaContract(),
      identity: {
        ...emptyPersonaContract().identity,
        home_city: 'Shanghai',
      },
    });

    expect(readPersonaContractCache({ ...descriptor, contractVersion: '2.0' })).toBeNull();
    expect(readPersonaContractCache({ ...descriptor, extractorVersion: 'extractor-v2' })).toBeNull();
    expect(readPersonaContractCache({ ...descriptor, modelId: 'mock-model-2' })).toBeNull();
    expect(readPersonaContractCache({ ...descriptor, validatorVersion: 'validator-v2' })).toBeNull();
  });

  it('rejects invalid cached contract payloads', () => {
    const descriptor = {
      workspaceDir: tmpDir,
      cacheDirName: '.timeline-cache/persona-contract',
      sourceHash: computePersonaContractSourceHash({ soul: 'a', memory: 'b', identity: 'c' }),
      contractVersion: '1.0',
      extractorVersion: 'extractor-v1',
      modelId: 'mock-model',
      validatorVersion: 'validator-v1',
    };
    const cacheKey = computePersonaContractCacheKey(descriptor);
    const cacheDir = path.join(tmpDir, '.timeline-cache', 'persona-contract');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, `${cacheKey}.json`),
      JSON.stringify({
        schema_version: '1.0',
        cache_key: cacheKey,
        metadata: {
          source_hash: descriptor.sourceHash,
          contract_version: descriptor.contractVersion,
          extractor_version: descriptor.extractorVersion,
          model_id: descriptor.modelId,
          validator_version: descriptor.validatorVersion,
        },
        contract: {
          ...emptyPersonaContract(),
          memory: {
            ...emptyPersonaContract().memory,
            long_term_preferences: ['currently at home'],
          },
        },
      }),
      'utf8',
    );

    expect(readPersonaContractCache(descriptor)).toBeNull();
  });
});
