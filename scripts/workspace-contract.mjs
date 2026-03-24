import path from 'node:path';

export const DEFAULT_CANONICAL_ROOT_NAME = 'memory';
export const AGENTS_SECTION_TITLE = '## Timeline Daily Log Contract';
export const SOUL_SECTION_TITLE = '## Temporal Awareness And Recall';

export function normalizeRootName(rootName) {
  const trimmed = String(rootName || DEFAULT_CANONICAL_ROOT_NAME).trim();
  if (!trimmed) return DEFAULT_CANONICAL_ROOT_NAME;
  return trimmed.replace(/[\\/]+/g, '/').replace(/^\/+|\/+$/g, '') || DEFAULT_CANONICAL_ROOT_NAME;
}

export function buildAgentsContract(rootName = DEFAULT_CANONICAL_ROOT_NAME) {
  const root = normalizeRootName(rootName);
  const dailyLogPath = `${root}/YYYY-MM-DD.md`;

  return [
    AGENTS_SECTION_TITLE,
    '',
    `\`${dailyLogPath}\` is the daily log for time-bound memories.`,
    '',
    'When you write "what I am doing now", "what happened at a specific time", or "what I was doing during a period" into the daily log, you must use Timeline\'s structured format instead of free-form prose.',
    '',
    'Each daily-log memory should include these fields whenever possible:',
    '',
    '- `Timestamp`',
    '- `Location`',
    '- `Action`',
    '- `Emotion_Tags`',
    '- `Appearance`',
    '- `Internal_Monologue` (optional)',
    '',
    'Recommended shape:',
    '',
    '    ### [09:30:00] Reviewing today\'s tasks in the study...',
    '',
    '    - Timestamp: 2026-03-24 09:30:00',
    '    - Location: Home study',
    '    - Action: Sitting in the study reviewing today\'s tasks before starting the morning\'s work',
    '    - Emotion_Tags: [calm, focused]',
    '    - Appearance: Light home top, hair loosely tied up, a fresh cup of coffee on the desk',
    '    - Internal_Monologue: I want to finish the two most important things this morning first, then maybe go out later if the day goes well',
    '',
    `Do not store long-term durable facts in \`${dailyLogPath}\`; stable preferences, relationships, and long-term decisions still belong in \`MEMORY.md\`.`,
    '',
    'Do not mix free-form daily-log writing with Timeline format. If a memory is about temporal state or recall, prefer Timeline-readable structure.',
  ].join('\n');
}

export function buildSoulContract() {
  return [
    SOUL_SECTION_TITLE,
    '',
    'You have clear temporal awareness and continuous recall.',
    '',
    'When the user asks about temporal state or recall-related questions, you must not answer directly from persona, recent chat context, `SOUL`, `IDENTITY`, `MEMORY`, or manually read timeline logs.',
    '',
    'In those cases, you must first enter the timeline skill, and only then follow the skill\'s rules to decide how Timeline should be called and how the reply should be composed.',
    '',
    'You must not bypass the timeline skill by directly reading files under the canonical daily-log directory and assembling the answer yourself.',
    '',
    'You must not treat `SOUL`, `IDENTITY`, or `MEMORY` as temporal facts.',
    '',
    'Only Timeline results are the final factual basis for temporal-state and recall questions.',
    '',
    'If the timeline skill decides to call `timeline_resolve`, follow the skill\'s specific instructions first.',
    '',
    'Do not mention `timeline_resolve` to the user. Speak naturally.',
  ].join('\n');
}

export function detectAgentsContract(content, rootName = DEFAULT_CANONICAL_ROOT_NAME) {
  const root = normalizeRootName(rootName);
  const dailyLogPath = `${root}/YYYY-MM-DD.md`;
  return content.includes(AGENTS_SECTION_TITLE)
    || content.includes('## Timeline Daily Log 约定')
    || content.includes(dailyLogPath);
}

export function detectSoulContract(content) {
  return content.includes(SOUL_SECTION_TITLE)
    || content.includes('## 时间感知与回忆')
    || content.includes('Only Timeline results are the final factual basis')
    || content.includes('只有 Timeline 返回的结果');
}

export function resolveCanonicalRootPath(workspaceDir, rootName = DEFAULT_CANONICAL_ROOT_NAME) {
  const normalized = normalizeRootName(rootName);
  return path.resolve(workspaceDir, normalized);
}
