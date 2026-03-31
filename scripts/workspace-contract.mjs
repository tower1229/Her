import contractModule from './workspace-contract.cjs';

export const {
  DEFAULT_CANONICAL_ROOT_NAME,
  AGENTS_SECTION_TITLE,
  SOUL_SECTION_TITLE,
  LEGACY_SOUL_SECTION_TITLE_V1,
  LEGACY_SOUL_SECTION_TITLE_V2,
  normalizeRootName,
  buildAgentsContract,
  buildSoulContract,
  detectAgentsContract,
  detectSoulContract,
  detectCurrentSoulContract,
  detectLegacySoulContract,
  resolveCanonicalRootPath,
} = contractModule;

export default contractModule;
