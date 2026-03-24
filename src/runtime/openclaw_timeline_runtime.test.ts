import * as fs from 'fs';
import * as path from 'path';
import {
  makeOpenClawTimelineRepairToolFactory,
  makeOpenClawTimelineResolveToolFactory,
} from './openclaw_timeline_runtime';

function formatLocalCalendarDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

describe('openclaw timeline runtime factories', () => {
  const tmpDir = path.join(__dirname, '__runtime_tmp__');
  const canonicalRoot = path.join(tmpDir, 'timeline-memory');

  beforeEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(canonicalRoot, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('injects workspace/session/pluginConfig into timeline_resolve through the real runtime factory', async () => {
    const today = formatLocalCalendarDate(new Date());

    fs.writeFileSync(
      path.join(canonicalRoot, `${today}.md`),
      `### [Episode]\n- Timestamp: ${today}T18:00:00+08:00\n- Location: 家里书房\n- Action: 继续整理今天的工作记录\n- Emotion_Tags: [专注, 平静]\n- Appearance: 宽松的家居服\n- Internal_Monologue: 再收一下尾就差不多了。\n她傍晚还在家里书房继续整理今天的工作记录。`,
      'utf8',
    );

    let latestReasonerRequestId = '';

    const getSessionMessages = jest.fn();

    const pluginApi = {
      workspaceDir: tmpDir,
      pluginConfig: {
        canonicalMemoryRoot: 'timeline-memory',
      },
      runtime: {
        subagent: {
          run: async ({ message }: { message: string }) => {
            const marker = '"request_id": "';
            const start = message.indexOf(marker);
            if (start !== -1) {
              const rest = message.slice(start + marker.length);
              latestReasonerRequestId = rest.slice(0, rest.indexOf('"'));
            }
            return { runId: 'reasoner-run-1' };
          },
          waitForRun: async () => ({ status: 'ok' }),
          getSessionMessages,
          deleteSession: async () => undefined,
        },
        tools: {
          createMemorySearchTool: () => ({
            name: 'memory_search',
            description: 'memory search',
            parameters: {},
            execute: async () => ({
              content: [{ type: 'text' as const, text: '{}' }],
              details: { results: [] },
            }),
          }),
        },
      },
      logger: {},
    };

    const factory = makeOpenClawTimelineResolveToolFactory(pluginApi);
    const tool = factory({
      workspaceDir: tmpDir,
      sessionKey: 'session-main',
    });

    getSessionMessages.mockImplementation(async ({ sessionKey }: { sessionKey: string }) => {
      if (sessionKey === 'session-main') {
        return {
          messages: [
            { role: 'user', bodyText: '你现在在干嘛' },
            { role: 'assistant', bodyText: '让我先确认一下当前状态。' },
          ],
        };
      }
      return {
        messages: [
          {
            role: 'assistant',
            bodyText: JSON.stringify({
              schema_version: '1.0',
              request_id: latestReasonerRequestId,
              request_type: 'now',
              decision: {
                action: 'reuse_existing_fact',
                selected_fact_id: `canon:${today}:0`,
                should_write_canon: false,
              },
              continuity: {
                judged: true,
                is_continuing: true,
                reason: '当前活动仍然在持续。',
              },
              rationale: {
                summary: '复用了当天已存在且仍然覆盖当前时刻的 canon 事实。',
                hard_fact_basis: ['user: 你现在在干嘛'],
                canon_basis: ['canon:2026-03-22:0'],
                persona_basis: [],
              },
            }),
          },
        ],
      };
    });

    const result = await tool.execute('call-1', {
      target_time_range: 'now',
      mode: 'allow_generate',
      reason: 'current_status',
      trace: true,
    });

    const payload = result.details as { ok: boolean; resolution_summary: { mode: string }; result?: { episodes: unknown[] } };
    expect(payload.ok).toBe(true);
    expect(payload.resolution_summary.mode).toBe('read_only_hit');
    expect(payload.result?.episodes).toHaveLength(1);
    expect(getSessionMessages).toHaveBeenCalledWith({ sessionKey: 'session-main', limit: 12 });
    expect(getSessionMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: expect.stringContaining('timeline-reasoner'),
      }),
    );
  });

  it('routes timeline_repair through the configured canonical memory root', async () => {
    fs.writeFileSync(path.join(canonicalRoot, '2026-03-22.md'), '', 'utf8');

    const factory = makeOpenClawTimelineRepairToolFactory({
      workspaceDir: tmpDir,
      pluginConfig: {
        canonicalMemoryRoot: 'timeline-memory',
      },
    });
    const tool = factory({ workspaceDir: tmpDir });
    const result = await tool.execute('call-2', {
      calendar_date: '2026-03-22',
    });

    const payload = result.details as { target: { file_path: string; canonical: boolean } };
    expect(payload.target.file_path).toBe(path.join(canonicalRoot, '2026-03-22.md'));
    expect(payload.target.canonical).toBe(true);
  });
});
