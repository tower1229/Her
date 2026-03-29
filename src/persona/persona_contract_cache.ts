import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PersonaContractV1 } from './persona_contract';

export interface PersonaContractCacheDescriptor {
  workspaceDir: string;
  cacheDirName?: string;
  sourceHash: string;
  contractVersion: string;
  extractorVersion: string;
  modelId: string;
  validatorVersion: string;
}

export interface PersonaContractCacheEntry {
  schema_version: '1.0';
  cache_key: string;
  metadata: {
    source_hash: string;
    contract_version: string;
    extractor_version: string;
    model_id: string;
    validator_version: string;
  };
  contract: PersonaContractV1;
}

function ensureCacheDir(workspaceDir: string, cacheDirName?: string): string {
  const root = path.join(workspaceDir, cacheDirName || '.timeline-cache/persona-contract');
  fs.mkdirSync(root, { recursive: true });
  return root;
}

export function computePersonaContractSourceHash(input: {
  soul: string;
  memory: string;
  identity: string;
}): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      soul: input.soul || '',
      memory: input.memory || '',
      identity: input.identity || '',
    }))
    .digest('hex');
}

export function computePersonaContractCacheKey(descriptor: PersonaContractCacheDescriptor): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      source_hash: descriptor.sourceHash,
      contract_version: descriptor.contractVersion,
      extractor_version: descriptor.extractorVersion,
      model_id: descriptor.modelId,
      validator_version: descriptor.validatorVersion,
    }))
    .digest('hex');
}

export function readPersonaContractCache(descriptor: PersonaContractCacheDescriptor): PersonaContractCacheEntry | null {
  try {
    const cacheKey = computePersonaContractCacheKey(descriptor);
    const filePath = path.join(ensureCacheDir(descriptor.workspaceDir, descriptor.cacheDirName), `${cacheKey}.json`);
    const rawText = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(rawText) as PersonaContractCacheEntry;
    if (!parsed || parsed.cache_key !== cacheKey || !parsed.contract) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePersonaContractCache(
  descriptor: PersonaContractCacheDescriptor,
  contract: PersonaContractV1,
): PersonaContractCacheEntry {
  const cacheKey = computePersonaContractCacheKey(descriptor);
  const entry: PersonaContractCacheEntry = {
    schema_version: '1.0',
    cache_key: cacheKey,
    metadata: {
      source_hash: descriptor.sourceHash,
      contract_version: descriptor.contractVersion,
      extractor_version: descriptor.extractorVersion,
      model_id: descriptor.modelId,
      validator_version: descriptor.validatorVersion,
    },
    contract,
  };
  const filePath = path.join(ensureCacheDir(descriptor.workspaceDir, descriptor.cacheDirName), `${cacheKey}.json`);
  fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf8');
  return entry;
}
