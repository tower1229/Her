import { LoadedPersonaContract, PersonaAvailableSource } from './persona_contract';
import { PersonaContractV1, emptyPersonaContract, hasPersonaConstraints } from './persona_contract';
import { LegacyCoreFiles } from './persona_source_types';
import {
  PersonaContractCacheDescriptor,
  computePersonaContractSourceHash,
  readPersonaContractCache,
  writePersonaContractCache,
} from './persona_contract_cache';
import {
  normalizeCandidatePersonaContract,
  validateCandidatePersonaContractPayload,
  validatePersonaContract,
} from './persona_contract_validator';

export interface LegacyPersonaContractExtractor {
  extractorVersion: string;
  modelId: string;
  run: (input: {
    soul: string;
    memory: string;
    identity: string;
    contractVersion: string;
    validationFeedback?: string[];
  }) => Promise<PersonaContractV1 | Record<string, unknown>>;
}

interface ExtractLegacyPersonaContractOptions {
  workspaceDir: string;
  legacy: LegacyCoreFiles;
  extractor?: LegacyPersonaContractExtractor;
  cacheDirName?: string;
  maxAttempts?: number;
}

const CONTRACT_VERSION = '1.0';
const VALIDATOR_VERSION = '2';

function deriveLegacyAvailableSources(legacy: LegacyCoreFiles): PersonaAvailableSource[] {
  return [
    legacy.found.soul ? 'legacy_soul' : null,
    legacy.found.memory ? 'legacy_memory' : null,
    legacy.found.identity ? 'legacy_identity' : null,
  ].filter(Boolean) as PersonaAvailableSource[];
}

export async function extractLegacyPersonaContract(
  options: ExtractLegacyPersonaContractOptions,
): Promise<LoadedPersonaContract> {
  const filesFound = [
    options.legacy.found.soul ? 'SOUL.md' : '',
    options.legacy.found.memory ? 'MEMORY.md|memory.md' : '',
    options.legacy.found.identity ? 'IDENTITY.md|IDENTITY' : '',
  ].filter(Boolean);
  const availableSources = deriveLegacyAvailableSources(options.legacy);
  const sourceHash = computePersonaContractSourceHash(options.legacy);

  if (!options.extractor) {
    const contract = emptyPersonaContract();
    return {
      contract,
      available_sources: [],
      should_constrain_generation: hasPersonaConstraints(contract),
      trace: {
        source_kind: 'defaults_only',
        files_found: filesFound,
        parse_warnings: [],
        cache_status: 'not_applicable',
        extraction_attempts: 0,
        validation_failures: [],
      },
    };
  }

  const cacheDescriptor: PersonaContractCacheDescriptor = {
    workspaceDir: options.workspaceDir,
    cacheDirName: options.cacheDirName,
    sourceHash,
    contractVersion: CONTRACT_VERSION,
    extractorVersion: options.extractor.extractorVersion,
    modelId: options.extractor.modelId,
    validatorVersion: VALIDATOR_VERSION,
  };

  const cached = readPersonaContractCache(cacheDescriptor);
  if (cached) {
      return {
        contract: cached.contract,
        available_sources: availableSources,
        should_constrain_generation: hasPersonaConstraints(cached.contract),
        trace: {
        source_kind: 'legacy_core_files',
        files_found: filesFound,
        parse_warnings: [],
        cache_status: 'hit',
        extraction_attempts: 0,
        validation_failures: [],
      },
    };
  }

  const validationFailures: string[] = [];
  const maxAttempts = Math.max(1, options.maxAttempts || 3);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const candidate = await options.extractor.run({
      soul: options.legacy.soul,
      memory: options.legacy.memory,
      identity: options.legacy.identity,
      contractVersion: CONTRACT_VERSION,
      validationFeedback: validationFailures,
    });
    const payloadValidation = validateCandidatePersonaContractPayload(candidate, CONTRACT_VERSION);
    if (!payloadValidation.ok) {
      validationFailures.push(...payloadValidation.issues);
      continue;
    }
    const normalized = normalizeCandidatePersonaContract(candidate);
    const validation = validatePersonaContract(normalized);
    if (validation.ok) {
      writePersonaContractCache(cacheDescriptor, normalized);
      return {
        contract: normalized,
        available_sources: availableSources,
        should_constrain_generation: hasPersonaConstraints(normalized),
        trace: {
          source_kind: 'legacy_core_files',
          files_found: filesFound,
          parse_warnings: [],
          cache_status: 'written',
          extraction_attempts: attempt,
          validation_failures: validationFailures,
        },
      };
    }
    validationFailures.push(...validation.issues);
  }

  const contract = emptyPersonaContract();
  return {
    contract,
    available_sources: [],
    should_constrain_generation: hasPersonaConstraints(contract),
    trace: {
      source_kind: 'defaults_only',
      files_found: filesFound,
      parse_warnings: [],
      cache_status: 'miss',
      extraction_attempts: maxAttempts,
      validation_failures: validationFailures,
    },
  };
}
