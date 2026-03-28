import { LoadedPersonaContext } from './types';
import { normalizePersonaProfile } from './normalize_persona_profile';
import { projectPersonaContext } from './project_persona_context';
import { readLegacyCoreFiles } from './read_legacy_core_files';
import { readPersonaProfile } from './read_persona_profile';

export function loadTimelinePersonaContextFromWorkspace(workspaceDir: string): LoadedPersonaContext {
  const parsedProfile = readPersonaProfile(workspaceDir);
  const legacy = readLegacyCoreFiles(workspaceDir);
  const normalizedResult = normalizePersonaProfile(parsedProfile, legacy);
  const projected = projectPersonaContext(normalizedResult.normalized);

  return {
    normalized: normalizedResult.normalized,
    projected,
    trace: {
      source_kind: normalizedResult.normalized.source_kind,
      files_found: [
        parsedProfile.found ? 'persona/PERSONA_PROFILE.md' : '',
        legacy.found.soul ? 'SOUL.md' : '',
        legacy.found.memory ? 'MEMORY.md|memory.md' : '',
        legacy.found.identity ? 'IDENTITY.md|IDENTITY' : '',
      ].filter(Boolean),
      parse_warnings: parsedProfile.parse_warnings,
      defaults_applied: normalizedResult.defaults_applied,
      conflict_resolutions: normalizedResult.conflict_resolutions,
    },
  };
}
