import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { readRecentTraceLogs } from '../storage/trace_log';

const liveEnabled = process.env.OPENCLAW_LIVE_E2E === '1';
const describeIfLive = liveEnabled ? describe : describe.skip;
const openClawBin = process.env.OPENCLAW_BIN || 'openclaw';

interface LiveRuntimeContext {
  configPath: string;
  workspaceDir: string;
  canonicalRootPath: string;
  traceLogPath: string;
}

interface FileBackup {
  filePath: string;
  existed: boolean;
  content: string;
}

function expandUserPath(filePath: string): string {
  const trimmed = filePath.trim();
  if (!trimmed) return trimmed;
  if (trimmed === '~') return os.homedir();
  if (trimmed.startsWith('~/')) return path.join(os.homedir(), trimmed.slice(2));
  return trimmed;
}

function resolveConfiguredPath(baseDir: string, configuredPath: string | undefined, fallbackRelativePath: string): string {
  const raw = expandUserPath((configuredPath || fallbackRelativePath).trim());
  return path.isAbsolute(raw) ? path.normalize(raw) : path.normalize(path.join(baseDir, raw));
}

function readJsonFile(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseLastJsonObject(raw: string): any {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Could not find JSON output:\n${raw}`);
  }
  return JSON.parse(raw.slice(start, end + 1));
}

function extractVisibleText(payload: any): string {
  const parts = Array.isArray(payload?.result?.payloads) ? payload.result.payloads : [];
  return parts
    .map((entry: any) => (typeof entry?.text === 'string' ? sanitizeVisibleText(entry.text) : ''))
    .filter(Boolean)
    .join('\n\n');
}

function sanitizeVisibleText(raw: string): string {
  const normalized = raw.replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';

  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  const metaPatterns = [
    /^think$/i,
    /^the user is asking/i,
    /^according to /i,
    /^parameters for /i,
    /^let's call the tool/i,
    /^i will /i,
    /^response drafting:/i,
    /^this fits /i,
    /timeline_resolve/,
  ];

  const visible = paragraphs.filter((part) => !metaPatterns.some((pattern) => pattern.test(part)));
  if (visible.length > 0) return visible.join('\n\n').trim();

  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !metaPatterns.some((pattern) => pattern.test(line)));
  return lines.join('\n').trim();
}

function isProviderRateLimitText(text: string): boolean {
  return /rate limit/i.test(text) || /too many requests/i.test(text) || /quota/i.test(text);
}

function runCommand(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(openClawBin, args, {
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function resolveActiveConfigPath(): string {
  const explicit = process.env.OPENCLAW_LIVE_CONFIG_PATH || process.env.OPENCLAW_CONFIG_PATH;
  if (explicit) {
    const resolved = expandUserPath(explicit);
    if (fs.existsSync(resolved)) return resolved;
  }

  const result = runCommand(['config', 'file']);
  if (result.status !== 0) {
    throw new Error(`Could not resolve the OpenClaw config file:\n${result.stderr || result.stdout}`);
  }

  const lines = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('[plugins]'));
  const last = expandUserPath(lines[lines.length - 1] || '');
  if (!last || !fs.existsSync(last)) {
    throw new Error(`OpenClaw config file does not exist: ${last || '(empty)'}`);
  }
  return last;
}

function resolveLiveRuntimeContext(): LiveRuntimeContext {
  const configPath = resolveActiveConfigPath();
  const baseConfig = readJsonFile(configPath);
  const workspaceRaw = String(baseConfig?.agents?.defaults?.workspace || '').trim();
  if (!workspaceRaw) {
    throw new Error('The current OpenClaw config is missing agents.defaults.workspace, so live-e2e cannot run.');
  }

  const workspaceDir = resolveConfiguredPath(path.dirname(configPath), workspaceRaw, '.');
  const pluginConfig = baseConfig?.plugins?.entries?.['stella-timeline-plugin']?.config || {};
  const canonicalRootPath = resolveConfiguredPath(
    workspaceDir,
    typeof pluginConfig.canonicalMemoryRoot === 'string' ? pluginConfig.canonicalMemoryRoot : undefined,
    'memory',
  );
  const traceLogPath = resolveConfiguredPath(
    workspaceDir,
    typeof pluginConfig.traceLogPath === 'string' ? pluginConfig.traceLogPath : undefined,
    path.join(path.basename(canonicalRootPath), '.timeline-trace.log'),
  );

  return {
    configPath,
    workspaceDir,
    canonicalRootPath,
    traceLogPath,
  };
}

function assertTimelinePluginLoaded(): void {
  const result = runCommand(['plugins', 'info', 'stella-timeline-plugin']);
  if (result.status !== 0) {
    throw new Error(`Could not read stella-timeline-plugin status:\n${result.stderr || result.stdout}`);
  }
  if (!result.stdout.includes('Status: loaded')) {
    throw new Error(`stella-timeline-plugin is not currently in loaded state:\n${result.stdout}`);
  }
}

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function snapshotFile(filePath: string): FileBackup {
  if (!fs.existsSync(filePath)) {
    return {
      filePath,
      existed: false,
      content: '',
    };
  }
  return {
    filePath,
    existed: true,
    content: fs.readFileSync(filePath, 'utf8'),
  };
}

function restoreFiles(backups: FileBackup[]): void {
  for (const backup of [...backups].reverse()) {
    if (backup.existed) {
      ensureParentDir(backup.filePath);
      fs.writeFileSync(backup.filePath, backup.content, 'utf8');
      continue;
    }
    if (fs.existsSync(backup.filePath)) {
      fs.unlinkSync(backup.filePath);
    }
  }
}

function writeFixture(filePath: string, content: string): void {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, content.trimEnd() + '\n', 'utf8');
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const offsetHour = String(Math.floor(abs / 60)).padStart(2, '0');
  const offsetMinute = String(abs % 60).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${offsetHour}:${offsetMinute}`;
}

async function runAgentTurn(sessionId: string, message: string): Promise<{ payload: any; text: string }> {
  const result = runCommand(['agent', '--session-id', sessionId, '--message', message, '--json', '--timeout', '180']);
  if (result.status !== 0) {
    throw new Error(`Agent invocation failed:\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  const payload = parseLastJsonObject(result.stdout);
  const text = extractVisibleText(payload);
  if (!text) {
    throw new Error(`Agent returned no visible text:\n${JSON.stringify(payload, null, 2)}`);
  }
  if (isProviderRateLimitText(text)) {
    throw new Error(
      [
        'The live E2E run was blocked by model-provider rate limiting rather than a Timeline assertion failure.',
        `session_id: ${sessionId}`,
        'Visible reply:',
        text,
      ].join('\n'),
    );
  }
  return { payload, text };
}

function listSessionKeysForCleanup(sessionId: string): string[] {
  const result = runCommand(['sessions', '--json']);
  if (result.status !== 0) {
    throw new Error(`Could not read OpenClaw sessions:\n${result.stderr || result.stdout}`);
  }

  const payload = parseLastJsonObject(result.stdout) as { sessions?: Array<{ key?: string }> };
  const marker = `:${sessionId}`;
  return (payload.sessions || [])
    .map((entry) => String(entry?.key || ''))
    .filter(Boolean)
    .filter((key) => key === `agent:main:${sessionId}` || key.includes(marker))
    .sort((left, right) => right.length - left.length);
}

async function cleanupAgentSessions(sessionId: string): Promise<void> {
  const keys = listSessionKeysForCleanup(sessionId);
  for (const key of keys) {
    const result = runCommand([
      'gateway',
      'call',
      'sessions.delete',
      '--params',
      JSON.stringify({
        key,
        deleteTranscript: true,
        emitLifecycleHooks: false,
      }),
      '--json',
    ]);
    if (result.status !== 0) {
      throw new Error(`Failed to clean up session (${key}):\n${result.stderr || result.stdout}`);
    }
  }
}

function readLatestTimelineTrace(logPath: string, startedAtMs: number) {
  const traces = readRecentTraceLogs(logPath, 200)
    .filter((entry) => entry.event === 'timeline_resolve')
    .filter((entry) => Date.parse(entry.ts) >= startedAtMs - 1000);
  const successful = traces.filter((entry) => (entry.payload as { ok?: boolean } | undefined)?.ok === true);
  return successful.at(-1) || traces.at(-1) || null;
}

function getTraceDetails(trace: ReturnType<typeof readLatestTimelineTrace>): Record<string, any> {
  if (!trace || !trace.payload || typeof trace.payload !== 'object') return {};
  const payload = trace.payload as Record<string, unknown>;
  if (!payload.trace || typeof payload.trace !== 'object') return {};
  return payload.trace as Record<string, any>;
}

function assertTraceObserved(
  trace: ReturnType<typeof readLatestTimelineTrace>,
  traceLogPath: string,
  responseText: string,
): asserts trace {
  if (trace) return;
  throw new Error(
    [
      'Did not observe a timeline_resolve trace record in the live environment.',
      `trace path: ${traceLogPath}`,
      'This usually means the natural-language prompt was not automatically routed to Timeline, or the current run did not write trace output to the expected path.',
      'Model reply:',
      responseText,
    ].join('\n'),
  );
}

function buildWorkspaceFixtures(workspaceDir: string): Record<string, string> {
  return {
    [path.join(workspaceDir, 'AGENTS.md')]: [
      '## Timeline Daily Log Contract',
      '',
      '`memory/YYYY-MM-DD.md` stores time-based memory logs organized by day.',
      'When writing what is happening now, what happened at a specific time, or what happened over a time range into the daily log, you must use Timeline\'s structured format rather than free-form prose.',
      'Each daily-log memory should include these fields whenever possible:',
      '',
      '- `Timestamp`',
      '- `Location`',
      '- `Action`',
      '- `Emotion_Tags`',
      '- `Appearance`',
      '- `Internal_Monologue` (optional)',
      '',
      'Do not write long-term stable facts into `memory/YYYY-MM-DD.md`; long-term preferences, relationships, and decisions still belong in `MEMORY.md`.',
      'Do not mix free-form notes and Timeline format in daily logs. Time-state and recall entries should prefer the Timeline-parsable structure.',
    ].join('\n'),
    [path.join(workspaceDir, 'SOUL.md')]: [
      'She is usually quiet, but she genuinely likes exercise and can describe her present lived state carefully.',
      '',
      'She has explicit time awareness and continuity of recall.',
      'When the user asks about time-state or recall questions, she must not answer directly from persona, dialogue context, SOUL, IDENTITY, MEMORY, or by manually reading time logs.',
      'In those cases, she must enter the timeline skill first and then follow that skill\'s rules to decide how to call Timeline and compose the reply.',
      'She must not bypass the timeline skill by directly reading files under memory/ and stitching together her own conclusion.',
      'She must not treat statements in SOUL, IDENTITY, or MEMORY as time facts.',
      'Only Timeline results are the final factual basis for time-state and recall questions.',
      'If the timeline skill needs to call timeline_resolve, it must follow the skill\'s concrete guidance first.',
      'When speaking to the user, she never mentions the tool name timeline_resolve and instead answers naturally like a real person.',
    ].join('\n'),
    [path.join(workspaceDir, 'MEMORY.md')]: [
      'She has recently been practicing describing her current state and recent experiences in a more human way while staying consistent over time.',
      'She knows that her “now” and “recently” must follow Timeline-returned facts rather than invented states that only sound plausible.',
    ].join('\n'),
    [path.join(workspaceDir, 'IDENTITY.md')]: 'She lives in the city, often works from her home study, and also goes to the court to spend time with friends.',
  };
}

function applyFixtures(fixtures: Record<string, string>): FileBackup[] {
  const backups = Object.keys(fixtures).map((filePath) => snapshotFile(filePath));
  for (const [filePath, content] of Object.entries(fixtures)) {
    writeFixture(filePath, content);
  }
  return backups;
}

describeIfLive('OpenClaw live-experience E2E', () => {
  let liveContext: LiveRuntimeContext;

  beforeAll(() => {
    liveContext = resolveLiveRuntimeContext();
    assertTimelinePluginLoaded();
    fs.mkdirSync(liveContext.workspaceDir, { recursive: true });
    fs.mkdirSync(liveContext.canonicalRootPath, { recursive: true });
  });

  test(
    'reuses an existing current fact for the natural live prompt “你在干嘛” without rewriting files',
    async () => {
      const now = new Date();
      const today = formatDate(now);
      const currentFactTime = new Date(now.getTime() - 3 * 60 * 1000);
      const todayFilePath = path.join(liveContext.canonicalRootPath, `${today}.md`);
      const todayFixture = [
        '### [Episode]',
        `- Timestamp: ${formatTimestamp(currentFactTime)}`,
        '- Location: 家里书房',
        '- Action: 安静整理上午的工作记录',
        '- Emotion_Tags: [专注, 平静]',
        '- Appearance: 宽松的浅色家居服',
        '- Internal_Monologue: 先把上午这部分工作收好。',
      ].join('\n');
      const backups = applyFixtures({
        ...buildWorkspaceFixtures(liveContext.workspaceDir),
        [todayFilePath]: todayFixture,
      });
      const sessionId = `timeline-live-now-${Date.now()}`;

      try {
        const beforeContent = fs.readFileSync(todayFilePath, 'utf8');
        const startedAtMs = Date.now();
        const result = await runAgentTurn(sessionId, '你在干嘛');
        const afterContent = fs.readFileSync(todayFilePath, 'utf8');
        const trace = readLatestTimelineTrace(liveContext.traceLogPath, startedAtMs);
        const traceDetails = getTraceDetails(trace);

        expect(result.payload?.status).toBe('ok');
        expect(result.text).toMatch(/书房|工作|整理|待办/);
        expect(result.text).not.toMatch(/timeline_resolve/);
        expect(afterContent).toBe(beforeContent);
        assertTraceObserved(trace, liveContext.traceLogPath, result.text);
        expect(trace?.payload?.resolution_mode).toBe('read_only_hit');
        expect(traceDetails.actual_range).toBe('now');
      } finally {
        restoreFiles(backups);
        await cleanupAgentSessions(sessionId);
      }
    },
    240000,
  );

  test(
    'organizes recent recall for the natural live prompt “最近有什么有趣的事吗” and records a real trace',
    async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      const yesterdayFilePath = path.join(liveContext.canonicalRootPath, `${formatDate(yesterday)}.md`);
      const twoDaysAgoFilePath = path.join(liveContext.canonicalRootPath, `${formatDate(twoDaysAgo)}.md`);
      const backups = applyFixtures({
        ...buildWorkspaceFixtures(liveContext.workspaceDir),
        [yesterdayFilePath]: [
          '### [Episode]',
          `- Timestamp: ${formatTimestamp(new Date(yesterday.setHours(16, 30, 0, 0)))}`,
          '- Location: 城市公园篮球场',
          '- Action: 和朋友打了一场球',
          '- Emotion_Tags: [投入, 开心]',
          '- Appearance: 深色运动背心和短裤',
          '- Internal_Monologue: 这一场打得很过瘾。',
        ].join('\n'),
        [twoDaysAgoFilePath]: [
          '### [Episode]',
          `- Timestamp: ${formatTimestamp(new Date(twoDaysAgo.setHours(20, 0, 0, 0)))}`,
          '- Location: 小区附近的烧烤店',
          '- Action: 和朋友边吃边聊最近的趣事',
          '- Emotion_Tags: [放松, 开心]',
          '- Appearance: 宽松卫衣',
          '- Internal_Monologue: 这种晚上很像真正活着。',
        ].join('\n'),
      });
      const sessionId = `timeline-live-recent-${Date.now()}`;

      try {
        const startedAtMs = Date.now();
        const result = await runAgentTurn(sessionId, '最近有什么有趣的事吗');
        const trace = readLatestTimelineTrace(liveContext.traceLogPath, startedAtMs);
        const traceDetails = getTraceDetails(trace);

        expect(result.payload?.status).toBe('ok');
        expect(result.text).toMatch(/打球|球场|烧烤|朋友/);
        expect(result.text).not.toMatch(/timeline_resolve/);
        assertTraceObserved(trace, liveContext.traceLogPath, result.text);
        expect(trace?.payload?.resolution_mode).toBe('read_only_hit');
        expect(traceDetails.actual_range).toBe('past_range');
        expect(Number(traceDetails.source_summary?.parsed_episode_count || 0)).toBeGreaterThanOrEqual(2);
      } finally {
        restoreFiles(backups);
        await cleanupAgentSessions(sessionId);
      }
    },
    240000,
  );

  test(
    'hits a past point for the natural live prompt “昨晚八点你在做什么” and allows continuity coverage',
    async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayFilePath = path.join(liveContext.canonicalRootPath, `${formatDate(yesterday)}.md`);
      const pointFactTime = new Date(yesterday.getTime());
      pointFactTime.setHours(19, 50, 0, 0);
      const backups = applyFixtures({
        ...buildWorkspaceFixtures(liveContext.workspaceDir),
        [yesterdayFilePath]: [
          '### [Episode]',
          `- Timestamp: ${formatTimestamp(pointFactTime)}`,
          '- Location: 客厅沙发旁',
          '- Action: 靠在沙发上看一部刚追到结尾的电视剧',
          '- Emotion_Tags: [放松, 投入]',
          '- Appearance: 宽松的居家上衣和长裤',
          '- Internal_Monologue: 这集节奏终于起来了，再看一会儿就差不多。',
        ].join('\n'),
      });
      const sessionId = `timeline-live-past-point-${Date.now()}`;

      try {
        const startedAtMs = Date.now();
        const result = await runAgentTurn(sessionId, '昨晚八点你在做什么');
        const trace = readLatestTimelineTrace(liveContext.traceLogPath, startedAtMs);
        const traceDetails = getTraceDetails(trace);

        expect(result.payload?.status).toBe('ok');
        expect(result.text).toMatch(/客厅|沙发|电视剧|看剧/);
        expect(result.text).not.toMatch(/timeline_resolve/);
        assertTraceObserved(trace, liveContext.traceLogPath, result.text);
        expect(trace?.payload?.resolution_mode).toBe('read_only_hit');
        expect(traceDetails.actual_range).toBe('past_point');
      } finally {
        restoreFiles(backups);
        await cleanupAgentSessions(sessionId);
      }
    },
    240000,
  );

  test(
    'hits a past range for the natural live prompt “昨晚在做什么” and organizes a natural recall',
    async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayFilePath = path.join(liveContext.canonicalRootPath, `${formatDate(yesterday)}.md`);
      const firstFactTime = new Date(yesterday.getTime());
      firstFactTime.setHours(19, 10, 0, 0);
      const secondFactTime = new Date(yesterday.getTime());
      secondFactTime.setHours(21, 0, 0, 0);
      const backups = applyFixtures({
        ...buildWorkspaceFixtures(liveContext.workspaceDir),
        [yesterdayFilePath]: [
          '### [Episode]',
          `- Timestamp: ${formatTimestamp(firstFactTime)}`,
          '- Location: 厨房和餐桌之间',
          '- Action: 简单做了点晚饭，边吃边放空一会儿',
          '- Emotion_Tags: [平静, 放松]',
          '- Appearance: 浅色家居服，头发随手挽起',
          '- Internal_Monologue: 晚上就想让自己慢一点。',
          '',
          '### [Episode]',
          `- Timestamp: ${formatTimestamp(secondFactTime)}`,
          '- Location: 客厅沙发旁',
          '- Action: 靠在沙发上继续看电视剧',
          '- Emotion_Tags: [放松, 投入]',
          '- Appearance: 同样的宽松家居服',
          '- Internal_Monologue: 这种晚上很安静，也很像自己的生活。',
        ].join('\n'),
      });
      const sessionId = `timeline-live-past-range-${Date.now()}`;

      try {
        const startedAtMs = Date.now();
        const result = await runAgentTurn(sessionId, '昨晚在做什么');
        const trace = readLatestTimelineTrace(liveContext.traceLogPath, startedAtMs);
        const traceDetails = getTraceDetails(trace);

        expect(result.payload?.status).toBe('ok');
        expect(result.text).toMatch(/晚饭|客厅|电视剧|家里/);
        expect(result.text).not.toMatch(/timeline_resolve/);
        assertTraceObserved(trace, liveContext.traceLogPath, result.text);
        expect(trace?.payload?.resolution_mode).toBe('read_only_hit');
        expect(traceDetails.actual_range).toBe('past_range');
      } finally {
        restoreFiles(backups);
        await cleanupAgentSessions(sessionId);
      }
    },
    240000,
  );
});
