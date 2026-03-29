import { buildPersonaContractFromProfile } from './build_persona_contract_from_profile';
import { extractLegacyPersonaContract, LegacyPersonaContractExtractor } from './extract_legacy_persona_contract';
import { LoadedPersonaContract, emptyPersonaContract, hasPersonaConstraints } from './persona_contract';
import { readLegacyCoreFiles } from './read_legacy_core_files';
import { readPersonaProfile } from './read_persona_profile';

interface LoadPersonaContractOptions {
  extractLegacyPersonaContract?: LegacyPersonaContractExtractor;
  cacheDirName?: string;
  maxAttempts?: number;
}

export async function loadTimelinePersonaContractFromWorkspace(
  workspaceDir: string,
  options: LoadPersonaContractOptions = {},
): Promise<LoadedPersonaContract> {
  const parsedProfile = readPersonaProfile(workspaceDir);
  const legacy = readLegacyCoreFiles(workspaceDir);
  const filesFound = [
    parsedProfile.found ? 'persona/PERSONA_PROFILE.md' : '',
    legacy.found.soul ? 'SOUL.md' : '',
    legacy.found.memory ? 'MEMORY.md|memory.md' : '',
    legacy.found.identity ? 'IDENTITY.md|IDENTITY' : '',
  ].filter(Boolean);

  if (parsedProfile.found) {
    const contract = buildPersonaContractFromProfile(parsedProfile);
    return {
      contract,
      available_sources: ['persona_profile'],
      should_constrain_generation: hasPersonaConstraints(contract),
      trace: {
        source_kind: 'persona_profile',
        files_found: filesFound,
        parse_warnings: parsedProfile.parse_warnings,
        cache_status: 'not_applicable',
        extraction_attempts: 0,
        validation_failures: [],
      },
    };
  }

  if (legacy.found.soul || legacy.found.memory || legacy.found.identity) {
    return extractLegacyPersonaContract({
      workspaceDir,
      legacy,
      extractor: options.extractLegacyPersonaContract,
      cacheDirName: options.cacheDirName,
      maxAttempts: options.maxAttempts,
    });
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
      cache_status: 'not_applicable',
      extraction_attempts: 0,
      validation_failures: [],
    },
  };
}
