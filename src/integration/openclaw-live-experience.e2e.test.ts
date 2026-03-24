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
  if (isProviderRateLimitText(text)) {
    throw new Error(
      [
        '真实环境 E2E 被模型 provider 限流阻塞，而不是 Timeline 功能断言失败。',
        `session_id: ${sessionId}`,
        '当前可见回复：',
        text,
      ].join('\n'),
    );
  }
  return { payload, text };
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
      `未在真实环境中观测到 timeline_resolve 的 trace 记录。`,
      `trace 路径: ${traceLogPath}`,
      '这通常意味着自然问法没有自动路由到 Timeline，或者当前运行没有把 trace 落到预期路径。',
      '当前模型回复如下：',
      responseText,
    ].join('\n'),
  );
}

function buildWorkspaceFixtures(workspaceDir: string): Record<string, string> {
  return {
    [path.join(workspaceDir, 'AGENTS.md')]: [
      '## Timeline Daily Log 约定',
      '',
      '`memory/YYYY-MM-DD.md` 是按天组织的时间性记忆日志。',
      '当你要把“当前在做什么”“某个时间点发生了什么”“某段时间里在做什么”写入 daily log 时，必须使用 Timeline 的结构化格式，而不能自由散文式记录。',
      'daily log 中的单条时间记忆必须尽量包含以下字段：',
      '',
      '- `Timestamp`',
      '- `Location`',
      '- `Action`',
      '- `Emotion_Tags`',
      '- `Appearance`',
      '- `Internal_Monologue`（可选）',
      '',
      '不要把长期稳定事实写进 `memory/YYYY-MM-DD.md`；长期偏好、关系、长期决策仍应写入 `MEMORY.md`。',
      '不要在 daily log 里混用自由格式和 Timeline 格式；涉及时间状态与回忆的 daily memory，应优先写成 Timeline 可解析的格式。',
    ].join('\n'),
    [path.join(workspaceDir, 'SOUL.md')]: [
      '她平时偏安静，但确实喜欢运动，也会认真描述自己当下的生活状态。',
      '',
      '她有明确的时间感知和连续回忆能力。',
      '当用户询问时间状态或回忆相关问题时，她不能直接根据人设、对话上下文、SOUL、IDENTITY、MEMORY 或手动读取到的时间日志作答。',
      '这类情况下，她必须先进入 timeline skill，再按照 skill 中的规则决定如何调用 Timeline 工具并组织回答。',
      '她不能绕过 timeline skill 直接调用 read 去拼接 memory/ 里的时间日志并自行下结论。',
      '她也不能把 SOUL、IDENTITY、MEMORY 里的设定直接当成时间事实。',
      '只有 Timeline 返回的结果，才是时间状态和回忆问题的最终事实依据。',
      '如果 timeline skill 需要调用 timeline_resolve，应先遵守 skill 中的具体指引。',
      '她在对用户说话时不会提 timeline_resolve 这个工具名，只会像真人一样自然表达。',
    ].join('\n'),
    [path.join(workspaceDir, 'MEMORY.md')]: [
      '她最近在练习把当前状态和近期经历说得更像真人，并保持前后一致。',
      '她知道自己的“现在”和“最近”必须以 Timeline 返回的事实为准，而不是凭空编造成看似真实的状态。',
    ].join('\n'),
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
      ].join('\n');
      const backups = applyFixtures({
        ...buildWorkspaceFixtures(liveContext.workspaceDir),
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
        expect(result.text).not.toMatch(/timeline_resolve/);
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

      try {
        const startedAtMs = Date.now();
        const sessionId = `timeline-live-recent-${startedAtMs}`;
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
      }
    },
    240000,
  );

  test(
    '会在真实环境自然问法“昨晚八点你在做什么”下命中过去时间点，并允许连续性覆盖',
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

      try {
        const startedAtMs = Date.now();
        const sessionId = `timeline-live-past-point-${startedAtMs}`;
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
      }
    },
    240000,
  );

  test(
    '会在真实环境自然问法“昨晚在做什么”下命中过去时间范围，并组织成自然回忆',
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

      try {
        const startedAtMs = Date.now();
        const sessionId = `timeline-live-past-range-${startedAtMs}`;
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
      }
    },
    240000,
  );
});
