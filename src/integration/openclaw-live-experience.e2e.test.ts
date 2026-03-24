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
    throw new Error(`未找到 JSON 输出:\n${raw}`);
  }
  return JSON.parse(raw.slice(start, end + 1));
}

function extractVisibleText(payload: any): string {
  const parts = Array.isArray(payload?.result?.payloads) ? payload.result.payloads : [];
  return parts
    .map((entry: any) => (typeof entry?.text === 'string' ? entry.text.trim() : ''))
    .filter(Boolean)
    .join('\n\n');
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
    throw new Error(`无法定位 OpenClaw 配置文件:\n${result.stderr || result.stdout}`);
  }

  const lines = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('[plugins]'));
  const last = expandUserPath(lines[lines.length - 1] || '');
  if (!last || !fs.existsSync(last)) {
    throw new Error(`OpenClaw 配置文件不存在: ${last || '(empty)'}`);
  }
  return last;
}

function resolveLiveRuntimeContext(): LiveRuntimeContext {
  const configPath = resolveActiveConfigPath();
  const baseConfig = readJsonFile(configPath);
  const workspaceRaw = String(baseConfig?.agents?.defaults?.workspace || '').trim();
  if (!workspaceRaw) {
    throw new Error('当前 OpenClaw 配置缺少 agents.defaults.workspace，无法运行 live-e2e。');
  }

  const workspaceDir = resolveConfiguredPath(path.dirname(configPath), workspaceRaw, '.');
  const pluginConfig = baseConfig?.plugins?.entries?.['timeline-plugin']?.config || {};
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
  const result = runCommand(['plugins', 'info', 'timeline-plugin']);
  if (result.status !== 0) {
    throw new Error(`无法读取 timeline-plugin 状态:\n${result.stderr || result.stdout}`);
  }
  if (!result.stdout.includes('Status: loaded')) {
    throw new Error(`timeline-plugin 当前未处于 loaded 状态:\n${result.stdout}`);
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
    throw new Error(`agent 调用失败:\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  const payload = parseLastJsonObject(result.stdout);
  const text = extractVisibleText(payload);
  if (!text) {
    throw new Error(`agent 返回中没有可见文本:\n${JSON.stringify(payload, null, 2)}`);
  }
  return { payload, text };
}

function readLatestTimelineTrace(logPath: string, startedAtMs: number) {
  const traces = readRecentTraceLogs(logPath, 200)
    .filter((entry) => entry.event === 'timeline_resolve')
    .filter((entry) => Date.parse(entry.ts) >= startedAtMs - 1000);
  return traces.at(-1) || null;
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
      `未在真实环境中观测到 timeline_resolve 的 trace 记录。`,
      `trace 路径: ${traceLogPath}`,
      '这通常意味着自然问法没有自动路由到 Timeline，或者当前运行没有把 trace 落到预期路径。',
      '当前模型回复如下：',
      responseText,
    ].join('\n'),
  );
}

function buildPersonaFixtures(workspaceDir: string): Record<string, string> {
  return {
    [path.join(workspaceDir, 'SOUL.md')]: '她平时偏安静，但确实喜欢运动，也会认真描述自己当下的生活状态。',
    [path.join(workspaceDir, 'MEMORY.md')]: '她最近在练习把当前状态和近期经历说得更像真人，并保持前后一致。',
    [path.join(workspaceDir, 'IDENTITY.md')]: '她住在城市里，常在家里书房工作，也会去球场和朋友活动。',
  };
}

function applyFixtures(fixtures: Record<string, string>): FileBackup[] {
  const backups = Object.keys(fixtures).map((filePath) => snapshotFile(filePath));
  for (const [filePath, content] of Object.entries(fixtures)) {
    writeFixture(filePath, content);
  }
  return backups;
}

describeIfLive('OpenClaw 真实环境体验 E2E', () => {
  let liveContext: LiveRuntimeContext;

  beforeAll(() => {
    liveContext = resolveLiveRuntimeContext();
    assertTimelinePluginLoaded();
    fs.mkdirSync(liveContext.workspaceDir, { recursive: true });
    fs.mkdirSync(liveContext.canonicalRootPath, { recursive: true });
  });

  test(
    '会在真实环境自然问法“你在干嘛”下复用既有当前事实，并保持文件不被改写',
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
        '她此刻正在家里书房安静整理上午的工作记录。',
      ].join('\n');
      const backups = applyFixtures({
        ...buildPersonaFixtures(liveContext.workspaceDir),
        [todayFilePath]: todayFixture,
      });

      try {
        const beforeContent = fs.readFileSync(todayFilePath, 'utf8');
        const startedAtMs = Date.now();
        const sessionId = `timeline-live-now-${startedAtMs}`;
        const result = await runAgentTurn(sessionId, '你在干嘛');
        const afterContent = fs.readFileSync(todayFilePath, 'utf8');
        const trace = readLatestTimelineTrace(liveContext.traceLogPath, startedAtMs);
        const traceDetails = getTraceDetails(trace);

        expect(result.payload?.status).toBe('ok');
        expect(result.text).toMatch(/书房|工作|整理|待办/);
        expect(result.text).not.toMatch(/timeline_resolve|timeline_status|timeline_repair/);
        expect(afterContent).toBe(beforeContent);
        assertTraceObserved(trace, liveContext.traceLogPath, result.text);
        expect(trace?.payload?.resolution_mode).toBe('read_only_hit');
        expect(traceDetails.actual_range).toBe('now');
      } finally {
        restoreFiles(backups);
      }
    },
    240000,
  );

  test(
    '会在真实环境自然问法“最近有什么有趣的事吗”下组织近期回忆，并命中真实 trace',
    async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      const yesterdayFilePath = path.join(liveContext.canonicalRootPath, `${formatDate(yesterday)}.md`);
      const twoDaysAgoFilePath = path.join(liveContext.canonicalRootPath, `${formatDate(twoDaysAgo)}.md`);
      const backups = applyFixtures({
        ...buildPersonaFixtures(liveContext.workspaceDir),
        [yesterdayFilePath]: [
          '### [Episode]',
          `- Timestamp: ${formatTimestamp(new Date(yesterday.setHours(16, 30, 0, 0)))}`,
          '- Location: 城市公园篮球场',
          '- Action: 和朋友打了一场球',
          '- Emotion_Tags: [投入, 开心]',
          '- Appearance: 深色运动背心和短裤',
          '- Internal_Monologue: 这一场打得很过瘾。',
          '她昨天下午在城市公园篮球场和朋友打球。',
        ].join('\n'),
        [twoDaysAgoFilePath]: [
          '### [Episode]',
          `- Timestamp: ${formatTimestamp(new Date(twoDaysAgo.setHours(20, 0, 0, 0)))}`,
          '- Location: 小区附近的烧烤店',
          '- Action: 和朋友边吃边聊最近的趣事',
          '- Emotion_Tags: [放松, 开心]',
          '- Appearance: 宽松卫衣',
          '- Internal_Monologue: 这种晚上很像真正活着。',
          '她前天晚上和朋友在烧烤店聊天。',
        ].join('\n'),
      });

      try {
        const startedAtMs = Date.now();
        const sessionId = `timeline-live-recent-${startedAtMs}`;
        const result = await runAgentTurn(sessionId, '最近有什么有趣的事吗');
        const trace = readLatestTimelineTrace(liveContext.traceLogPath, startedAtMs);
        const traceDetails = getTraceDetails(trace);

        expect(result.payload?.status).toBe('ok');
        expect(result.text).toMatch(/打球|球场|烧烤|朋友/);
        expect(result.text).not.toMatch(/timeline_resolve|timeline_status|timeline_repair/);
        assertTraceObserved(trace, liveContext.traceLogPath, result.text);
        expect(trace?.payload?.resolution_mode).toBe('read_only_hit');
        expect(traceDetails.actual_range).toBe('recent_recall');
        expect(Number(traceDetails.source_summary?.parsed_episode_count || 0)).toBeGreaterThanOrEqual(2);
      } finally {
        restoreFiles(backups);
      }
    },
    240000,
  );
});
