const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CANONICAL_ROOT_NAME = 'memory';
const AGENTS_SECTION_TITLE = '## Timeline Daily Log Contract';
const SOUL_SECTION_TITLE = '## Timeline';
const LEGACY_SOUL_SECTION_TITLE_V1 = '## 时间感知与回忆';
const LEGACY_SOUL_SECTION_TITLE_V2 = '## Temporal Awareness And Recall';
const templatesDir = path.resolve(__dirname, '..', 'templates');

const CURRENT_SOUL_MARKERS = [
  'Enter the timeline-skill skill at the start of every turn to check whether either of these applies:',
  'Do not let current-state knowledge block the transition tool call.',
];

function normalizeRootName(rootName) {
  const trimmed = String(rootName || DEFAULT_CANONICAL_ROOT_NAME).trim();
  if (!trimmed) return DEFAULT_CANONICAL_ROOT_NAME;
  return trimmed.replace(/[\\/]+/g, '/').replace(/^\/+|\/+$/g, '') || DEFAULT_CANONICAL_ROOT_NAME;
}

function readTemplate(fileName) {
  return fs.readFileSync(path.join(templatesDir, fileName), 'utf8').trim();
}

function buildAgentsContract() {
  return readTemplate('AGENTS.fragment.md');
}

function buildSoulContract() {
  return readTemplate('SOUL.fragment.md');
}

function detectAgentsContract(content) {
  return content.includes(AGENTS_SECTION_TITLE)
    || content.includes('## Timeline Daily Log 约定')
    || content.includes('Each daily-log memory should include these fields whenever possible:')
    || content.includes('daily log 中的单条时间记忆必须尽量包含以下字段');
}

function detectSoulContract(content) {
  return content.includes(SOUL_SECTION_TITLE)
    || content.includes(LEGACY_SOUL_SECTION_TITLE_V1)
    || content.includes(LEGACY_SOUL_SECTION_TITLE_V2)
    || content.includes('Only Timeline results are the final factual basis')
    || content.includes('只有 Timeline 返回的结果')
    || content.includes('You must not bypass the timeline skill by directly reading files under')
    || content.includes('You must not bypass the timeline-skill skill by directly reading files under');
}

function detectCurrentSoulContract(content) {
  return detectSoulContract(content)
    && CURRENT_SOUL_MARKERS.every((marker) => content.includes(marker));
}

function detectLegacySoulContract(content) {
  return detectSoulContract(content) && !detectCurrentSoulContract(content);
}

function resolveCanonicalRootPath(workspaceDir, rootName = DEFAULT_CANONICAL_ROOT_NAME) {
  const normalized = normalizeRootName(rootName);
  return path.resolve(workspaceDir, normalized);
}

module.exports = {
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
};
