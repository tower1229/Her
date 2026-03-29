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
});
