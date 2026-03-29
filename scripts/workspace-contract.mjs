import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_CANONICAL_ROOT_NAME = 'memory';
export const AGENTS_SECTION_TITLE = '## Timeline Daily Log Contract';
export const SOUL_SECTION_TITLE = '## Temporal Awareness And Recall';
export const LEGACY_SOUL_SECTION_TITLE = '## 时间感知与回忆';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.resolve(scriptDir, '..', 'templates');

const CURRENT_SOUL_MARKERS = [
  'Use a coarse and optimistic routing rule:',
  'The timeline skill owns the precise routing rules',
  'When unsure, prefer entering the timeline skill rather than answering from persona.',
];

export function normalizeRootName(rootName) {
  const trimmed = String(rootName || DEFAULT_CANONICAL_ROOT_NAME).trim();
  if (!trimmed) return DEFAULT_CANONICAL_ROOT_NAME;
  return trimmed.replace(/[\\/]+/g, '/').replace(/^\/+|\/+$/g, '') || DEFAULT_CANONICAL_ROOT_NAME;
}

function readTemplate(fileName) {
  return fs.readFileSync(path.join(templatesDir, fileName), 'utf8').trim();
}

export function buildAgentsContract() {
  return readTemplate('AGENTS.fragment.md');
}

export function buildSoulContract() {
  return readTemplate('SOUL.fragment.md');
}

export function detectAgentsContract(content) {
  return content.includes(AGENTS_SECTION_TITLE)
    || content.includes('## Timeline Daily Log 约定')
    || content.includes('Each daily-log memory should include these fields whenever possible:')
    || content.includes('daily log 中的单条时间记忆必须尽量包含以下字段');
}

export function detectSoulContract(content) {
  return content.includes(SOUL_SECTION_TITLE)
    || content.includes(LEGACY_SOUL_SECTION_TITLE)
    || content.includes('Only Timeline results are the final factual basis')
    || content.includes('只有 Timeline 返回的结果')
    || content.includes('You must not bypass the timeline skill by directly reading files under');
}

export function detectCurrentSoulContract(content) {
  return detectSoulContract(content)
    && CURRENT_SOUL_MARKERS.every((marker) => content.includes(marker));
}

export function detectLegacySoulContract(content) {
  return detectSoulContract(content) && !detectCurrentSoulContract(content);
}

export function resolveCanonicalRootPath(workspaceDir, rootName = DEFAULT_CANONICAL_ROOT_NAME) {
  const normalized = normalizeRootName(rootName);
  return path.resolve(workspaceDir, normalized);
}
