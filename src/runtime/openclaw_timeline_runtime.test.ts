import * as fs from 'fs';
import * as path from 'path';
import { createDefaultEngagementState, resolveEngagementStatePath } from '../engagement/engagement_state';
import {
  makeOpenClawTimelineBeforePromptBuildHook,
  makeOpenClawTimelineHeartbeatHook,
  makeOpenClawTimelineMessagePreprocessedHook,
  makeOpenClawTimelineResolveToolFactory,
} from './openclaw_timeline_runtime';

function formatLocalCalendarDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatLocalTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absOffset / 60)).padStart(2, '0');
  const offsetRemainder = String(absOffset % 60).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetRemainder}`;
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

  it.each([false, true])('only records admitted enriched inbound messages (reversed notification order: %s)', async reversed => {
    const hook = makeOpenClawTimelineMessagePreprocessedHook({ workspaceDir: tmpDir, pluginConfig: { canonicalMemoryRoot: 'timeline-memory' } });
    const statePath = path.join(canonicalRoot, 'engagement_state.json');
    const base = { sessionKey: 'agent:main:custom', timestamp: new Date('2026-11-01T12:00:00Z'), context: { channelId: 'webchat', from: 'operator', messageId: 'human-1', body: '[voice]', transcript: '别主动联系我' } };
    const notifications = ['received', 'preprocessed'];
    if (reversed) notifications.reverse();
    await hook({ ...base, action: notifications[0] });
    expect(fs.existsSync(statePath)).toBe(false);
    await hook({ ...base, action: notifications[1] });
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    expect(state.proactive_opt_out).toBe(true);
    expect(state.last_user_message_at).toBe('2026-11-01T12:00:00.000Z');
    const saved = fs.readFileSync(statePath, 'utf8');
    // Internal turns can use the same sender and custom session as the user.
    await hook({ ...base, action: 'preprocessed', context: { ...base.context, messageId: undefined, body: 'heartbeat', transcript: undefined } });
    await hook({ ...base, action: 'preprocessed', context: { ...base.context, messageId: 'internal-only' } });
    expect(fs.readFileSync(statePath, 'utf8')).toBe(saved);
  });

  it('records admitted messages without an ID once and ignores their internal preprocessing', async () => {
    const hook = makeOpenClawTimelineMessagePreprocessedHook({ workspaceDir: tmpDir, pluginConfig: { canonicalMemoryRoot: 'timeline-memory' } });
    const event = { sessionKey: 'agent:main:custom', context: { from: 'operator', content: '别主动联系我' } };
    await hook({ ...event, action: 'received' });
    const statePath = path.join(canonicalRoot, 'engagement_state.json');
    const saved = fs.readFileSync(statePath, 'utf8');
    expect(JSON.parse(saved).proactive_opt_out).toBe(true);
    await hook({ ...event, action: 'preprocessed', context: { ...event.context, body: 'heartbeat' } });
    expect(fs.readFileSync(statePath, 'utf8')).toBe(saved);
  });

  it('injects workspace/session/pluginConfig into timeline_resolve through the real runtime factory', async () => {
    const now = new Date();
    const today = formatLocalCalendarDate(now);
    const thirtyMinutesAgo = formatLocalTimestamp(new Date(now.getTime() - 30 * 60_000));

    fs.writeFileSync(
      path.join(canonicalRoot, `${today}.md`),
      `### [Episode]\n- Timestamp: ${thirtyMinutesAgo}\n- Location: 家里书房\n- Action: 继续整理今天的工作记录\n- Emotion_Tags: [专注, 平静]\n- Appearance: 宽松的家居服\n- Estimated_Duration: 120\n- Internal_Monologue: 再收一下尾就差不多了。\n她傍晚还在家里书房继续整理今天的工作记录。`,
      'utf8',
    );

    let latestReasonerRequestId = '';
    let latestPlannerRequestId = '';
    let sawUpdatedReasonerPrompt = false;

    const getSessionMessages = jest.fn();

    const pluginApi = {
      workspaceDir: tmpDir,
      pluginConfig: {
        canonicalMemoryRoot: 'timeline-memory',
      },
      runtime: {
        subagent: {
          run: async ({ message, extraSystemPrompt }: { message: string; extraSystemPrompt?: string }) => {
            const marker = '"request_id": "';
            const start = message.indexOf(marker);
            if (start !== -1) {
              const rest = message.slice(start + marker.length);
              const requestId = rest.slice(0, rest.indexOf('"'));
              if (message.includes('"target_time_range": "now | past_point | past_range"')) {
                latestPlannerRequestId = requestId;
              } else {
                latestReasonerRequestId = requestId;
                if (
                  extraSystemPrompt?.includes('prefer generate_new_fact by default')
                  && extraSystemPrompt?.includes('memory blankness/forgetfulness')
                  && extraSystemPrompt?.includes('collector.request.recovery_hint')
                ) {
                  sawUpdatedReasonerPrompt = true;
                }
              }
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
      if (sessionKey.includes(':planner:')) {
        return {
          messages: [
            {
              role: 'assistant',
              bodyText: JSON.stringify({
                schema_version: '1.0',
                request_id: latestPlannerRequestId,
                target_time_range: 'now',
                summary: 'Normalized the request into a current-state query.',
              }),
            },
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
                reason: 'The current activity is still continuing.',
              },
              rationale: {
                summary: 'Reused the existing canon fact that still covers the current moment.',
                hard_fact_basis: ['user: 你现在在干嘛'],
                canon_basis: ['canon:2026-03-22:0'],
                persona_basis: [],
                constraint_basis: [],
              },
            }),
          },
        ],
      };
    });

    const result = await tool.execute('call-1', {
      query: '你在干嘛',
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
    expect(sawUpdatedReasonerPrompt).toBe(true);
  });

  it('prefers persona/PERSONA_PROFILE.md over legacy core files in the runtime factory path', async () => {
    const now = new Date();
    const today = formatLocalCalendarDate(now);
    const thirtyMinutesAgo = formatLocalTimestamp(new Date(now.getTime() - 30 * 60_000));
    let latestReasonerRequestId = '';
    let latestPlannerRequestId = '';
    let latestReasonerMessage = '';
    const getSessionMessages = jest.fn();

    fs.mkdirSync(path.join(tmpDir, 'persona'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'persona', 'PERSONA_PROFILE.md'),
      [
        '# PERSONA_PROFILE',
        '',
        '## Meta',
        '- schema_version: 1.0',
        '- home_city: Shanghai',
        '- home_timezone: Asia/Shanghai',
        '',
        '## Identity',
        '- common_zones: [home study, bookstore]',
        '',
        '## Soul',
        '- temperament: reflective',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(path.join(tmpDir, 'IDENTITY.md'), 'She lives in Beijing.', 'utf8');
    fs.writeFileSync(
      path.join(canonicalRoot, `${today}.md`),
      `### [Episode]\n- Timestamp: ${thirtyMinutesAgo}\n- Location: 家里书房\n- Action: 继续整理今天的工作记录\n- Emotion_Tags: [专注, 平静]\n- Appearance: 宽松的家居服\n- Estimated_Duration: 120\n- Internal_Monologue: 再收一下尾就差不多了。\n她傍晚还在家里书房继续整理今天的工作记录。`,
      'utf8',
    );

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
              const requestId = rest.slice(0, rest.indexOf('"'));
              if (message.includes('"target_time_range": "now | past_point | past_range"')) {
                latestPlannerRequestId = requestId;
              } else {
                latestReasonerRequestId = requestId;
                latestReasonerMessage = message;
              }
            }
            return { runId: 'reasoner-run-profile' };
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
      sessionKey: 'session-profile',
    });

    getSessionMessages.mockImplementation(async ({ sessionKey }: { sessionKey: string }) => {
      if (sessionKey === 'session-profile') {
        return {
          messages: [
            { role: 'user', bodyText: '你现在在干嘛' },
            { role: 'assistant', bodyText: '让我先确认一下当前状态。' },
          ],
        };
      }
      if (sessionKey.includes(':planner:')) {
        return {
          messages: [
            {
              role: 'assistant',
              bodyText: JSON.stringify({
                schema_version: '1.0',
                request_id: latestPlannerRequestId,
                target_time_range: 'now',
                summary: 'Normalized the request into a current-state query.',
              }),
            },
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
                reason: 'The current activity is still continuing.',
              },
              rationale: {
                summary: 'Reused the existing canon fact that still covers the current moment.',
                hard_fact_basis: ['user: 你现在在干嘛'],
                canon_basis: ['canon:2026-03-22:0'],
                persona_basis: [],
                constraint_basis: [],
              },
            }),
          },
        ],
      };
    });

    const result = await tool.execute('call-profile', {
      query: '你在干嘛',
    });

    const payload = result.details as { ok: boolean; resolution_summary: { mode: string } };
    expect(payload.ok).toBe(true);
    expect(payload.resolution_summary.mode).toBe('read_only_hit');
    expect(latestReasonerMessage).toContain('"persona_context"');
    expect(latestReasonerMessage).toContain('"home_city": "Shanghai"');
    expect(latestReasonerMessage).toContain('"temperament": "reflective"');
    expect(latestReasonerMessage).not.toContain('"home_city": "Beijing"');
    expect(latestReasonerMessage).toContain('top-level request_id exactly:');
    expect(latestReasonerMessage).toContain(JSON.stringify(latestReasonerRequestId));
  });

  it('recovers the matching planner and reasoner JSON from mixed assistant transcripts', async () => {
    const now = new Date();
    const today = formatLocalCalendarDate(now);
    const thirtyMinutesAgo = formatLocalTimestamp(new Date(now.getTime() - 30 * 60_000));

    fs.writeFileSync(
      path.join(canonicalRoot, `${today}.md`),
      `### [Episode]\n- Timestamp: ${thirtyMinutesAgo}\n- Location: 家里书房\n- Action: 继续整理今天的工作记录\n- Emotion_Tags: [专注, 平静]\n- Appearance: 宽松的家居服\n- Estimated_Duration: 120\n- Internal_Monologue: 再收一下尾就差不多了。\n她傍晚还在家里书房继续整理今天的工作记录。`,
      'utf8',
    );

    let latestReasonerRequestId = '';
    let latestPlannerRequestId = '';

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
              const requestId = rest.slice(0, rest.indexOf('"'));
              if (message.includes('"target_time_range": "now | past_point | past_range"')) {
                latestPlannerRequestId = requestId;
              } else {
                latestReasonerRequestId = requestId;
              }
            }
            return { runId: 'reasoner-run-mixed' };
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
      if (sessionKey.includes(':planner:')) {
        return {
          messages: [
            {
              message: {
                role: 'assistant',
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      schema_version: '1.0',
                      request_id: latestPlannerRequestId,
                      target_time_range: 'now',
                      summary: 'Normalized the request into a current-state query.',
                    }),
                  },
                ],
              },
            },
            { role: 'assistant', bodyText: '先把时间语义收一下。' },
          ],
        };
      }
      return {
        messages: [
          {
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
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
                      reason: 'The current activity is still continuing.',
                    },
                    rationale: {
                      summary: 'Reused the existing canon fact that still covers the current moment.',
                      hard_fact_basis: ['user: 你现在在干嘛'],
                      canon_basis: [`canon:${today}:0`],
                      persona_basis: [],
                      constraint_basis: [],
                    },
                  }),
                },
              ],
            },
          },
          {
            role: 'assistant',
            bodyText: JSON.stringify({
              schema_version: '1.0',
              request_id: 'timeline-request-stale',
              request_type: 'now',
              decision: {
                action: 'return_empty',
                should_write_canon: false,
              },
              continuity: {
                judged: true,
                reason: 'stale result',
              },
              rationale: {
                summary: 'stale result',
                hard_fact_basis: [],
                canon_basis: [],
                persona_basis: [],
                constraint_basis: [],
              },
            }),
          },
          { role: 'assistant', bodyText: '我先想一下当前最贴近的状态。' },
        ],
      };
    });

    const result = await tool.execute('call-mixed', {
      query: '你在干嘛',
    });

    const payload = result.details as { ok: boolean; resolution_summary: { mode: string }; result?: { episodes: unknown[] } };
    expect(payload.ok).toBe(true);
    expect(payload.resolution_summary.mode).toBe('read_only_hit');
    expect(payload.result?.episodes).toHaveLength(1);
  });

  it('falls back when the transcript only contains a mismatched request id', async () => {
    const today = formatLocalCalendarDate(new Date());

    fs.writeFileSync(
      path.join(canonicalRoot, `${today}.md`),
      `### [Episode]\n- Timestamp: ${today}T18:00:00+08:00\n- Location: 家里书房\n- Action: 继续整理今天的工作记录\n- Emotion_Tags: [专注, 平静]\n- Appearance: 宽松的家居服\n- Internal_Monologue: 再收一下尾就差不多了。\n她傍晚还在家里书房继续整理今天的工作记录。`,
      'utf8',
    );

    let latestReasonerRequestId = '';
    let latestPlannerRequestId = '';

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
              const requestId = rest.slice(0, rest.indexOf('"'));
              if (message.includes('"target_time_range": "now | past_point | past_range"')) {
                latestPlannerRequestId = requestId;
              } else {
                latestReasonerRequestId = requestId;
              }
            }
            return { runId: 'reasoner-run-mismatch' };
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
          messages: [{ role: 'user', bodyText: '你现在在干嘛' }],
        };
      }
      if (sessionKey.includes(':planner:')) {
        return {
          messages: [
            {
              role: 'assistant',
              bodyText: JSON.stringify({
                schema_version: '1.0',
                request_id: latestPlannerRequestId,
                target_time_range: 'now',
                summary: 'Normalized the request into a current-state query.',
              }),
            },
          ],
        };
      }
      return {
        messages: [
          {
            role: 'assistant',
            bodyText: JSON.stringify({
              schema_version: '1.0',
              request_id: `${latestReasonerRequestId}-stale`,
              request_type: 'now',
              decision: {
                action: 'return_empty',
                should_write_canon: false,
              },
              continuity: {
                judged: true,
                reason: 'stale result',
              },
              rationale: {
                summary: 'stale result',
                hard_fact_basis: [],
                canon_basis: [],
                persona_basis: [],
                constraint_basis: [],
              },
            }),
          },
        ],
      };
    });

    const result = await tool.execute('call-mismatch', {
      query: '你在干嘛',
    });

    const payload = result.details as { ok: boolean; resolution_summary?: { mode: string }; result?: { episodes: unknown[]; consumption?: { fact?: { status?: string } } } };
    expect(payload.ok).toBe(true);
    expect(payload.resolution_summary?.mode).toBe('empty_window');
    expect(payload.result?.consumption?.fact?.status).toBe('empty');
  });

  it('falls back to empty_window when subagents time out instead of keyword-picking canon', async () => {
    const today = formatLocalCalendarDate(new Date());
    const yesterday = formatLocalCalendarDate(new Date(Date.now() - 24 * 60 * 60_000));

    fs.writeFileSync(
      path.join(canonicalRoot, `${yesterday}.md`),
      `### [Episode]\n- Timestamp: ${yesterday}T19:00:00+08:00\n- Location: 公园\n- Action: 和朋友烧烤聊天\n- Emotion_Tags: [开心, 有趣]\n- Appearance: 休闲外套\n- Internal_Monologue: 今晚挺好玩的。\n昨晚和朋友在公园烧烤。`,
      'utf8',
    );
    fs.writeFileSync(
      path.join(canonicalRoot, `${today}.md`),
      `### [Episode]\n- Timestamp: ${today}T18:00:00+08:00\n- Location: 家里书房\n- Action: 继续整理今天的工作记录\n- Emotion_Tags: [专注, 平静]\n- Appearance: 宽松的家居服\n- Internal_Monologue: 再收一下尾就差不多了。\n她傍晚还在家里书房继续整理今天的工作记录。`,
      'utf8',
    );

    const reasonerSessionKeys: string[] = [];
    const pluginApi = {
      workspaceDir: tmpDir,
      pluginConfig: {
        canonicalMemoryRoot: 'timeline-memory',
      },
      runtime: {
        subagent: {
          run: async (input: { sessionKey?: string }) => {
            if (typeof input.sessionKey === 'string') reasonerSessionKeys.push(input.sessionKey);
            return { runId: `reasoner-run-timeout-${reasonerSessionKeys.length}` };
          },
          waitForRun: async () => ({ status: 'timeout' }),
          getSessionMessages: async () => ({ messages: [] }),
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

    const result = await tool.execute('call-timeout', {
      query: '昨晚有什么有趣的事',
      trace: true,
    });

    const payload = result.details as {
      ok: boolean;
      resolution_summary: { mode: string };
      trace?: { decision?: { error_code?: string } };
      result?: { episodes: unknown[]; consumption?: { fact?: { status?: string } } };
    };
    expect(payload.ok).toBe(true);
    expect(payload.resolution_summary.mode).toBe('empty_window');
    expect(payload.result?.consumption?.fact?.status).toBe('empty');
    expect(payload.result?.episodes ?? []).toEqual([]);
    expect(payload.trace?.decision?.error_code).toBe('REASONER_UNAVAILABLE');
    expect(reasonerSessionKeys.filter((key) => key.includes('timeline-reasoner:') && !key.includes(':planner:'))).toHaveLength(1);
  });

  it('injects active_instant prompt context through before_prompt_build', async () => {
    const now = new Date();
    const today = formatLocalCalendarDate(now);
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60_000);

    fs.writeFileSync(
      path.join(canonicalRoot, `${today}.md`),
      [
        '### [Prompt Context]',
        `- Timestamp: ${formatLocalTimestamp(thirtyMinutesAgo).replace('T', ' ')}`,
        '- Location: 家里书房',
        '- Action: 继续整理刚才的工作笔记',
        '- Emotion_Tags: [专注, 平静]',
        '- Appearance: 宽松的家居服',
        '- Estimated_Duration: 120',
      ].join('\n'),
      'utf8',
    );

    const handler = makeOpenClawTimelineBeforePromptBuildHook({
      workspaceDir: tmpDir,
      pluginConfig: {
        canonicalMemoryRoot: 'timeline-memory',
      },
      config: {},
      runtime: {},
      logger: {},
    });

    const result = await handler(
      {
        prompt: '你现在在干嘛',
        messages: [{ role: 'user', bodyText: '你现在在干嘛' }],
      },
      {
        workspaceDir: tmpDir,
        sessionKey: 'session-main',
      },
    );

    expect(result).toBeTruthy();
    expect((result as any).prependSystemContext).toContain('Timeline prompt context may be injected');
    expect((result as any).prependContext).toContain('status: active_instant');
    expect((result as any).prependContext).toContain('direct_current_state_answers_allowed: yes');
  });

  it('uses explicit heartbeat trigger metadata instead of prompt text heuristics for proactive preflight', async () => {
    const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60_000);
    const state = {
      ...createDefaultEngagementState(),
      user_timezone: 'UTC',
      last_user_message_at: eightHoursAgo.toISOString(),
      proactive_greeting_enabled: true,
      contact_scope_status: 'single' as const,
    };
    fs.writeFileSync(
      resolveEngagementStatePath(tmpDir, 'timeline-memory'),
      `${JSON.stringify(state, null, 2)}\n`,
      'utf8',
    );

    const handler = makeOpenClawTimelineHeartbeatHook({
      workspaceDir: tmpDir,
      pluginConfig: {
        canonicalMemoryRoot: 'timeline-memory',
        enablePromptTimelineContext: false,
        proactiveGreeting: {
          enabled: true,
          sessionKey: 'proactive-greeting',
        },
      },
      config: {
        agents: {
          defaults: {
            userTimezone: 'UTC',
            heartbeat: {
              activeHours: {
                start: '00:00',
                end: '24:00',
                timezone: 'UTC',
              },
            },
          },
        },
      },
      runtime: {},
      logger: {},
    });

    const result = await handler(
      {
        sessionKey: 'proactive-greeting',
      },
      {
        workspaceDir: tmpDir,
        sessionKey: 'proactive-greeting',
        trigger: 'heartbeat',
      },
    );

    expect(result).toBeTruthy();
    expect((result as any).prependContext).toContain('Proactive greeting preflight: send is allowed');
  });

  it('injects active_macro_background prompt context from lookback facts', async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60_000);
    const yesterdayDate = formatLocalCalendarDate(yesterday);
    const yesterdayMorning = new Date(yesterday.getTime());
    yesterdayMorning.setHours(8, 0, 0, 0);

    fs.writeFileSync(
      path.join(canonicalRoot, `${yesterdayDate}.md`),
      [
        '### [Prompt Context]',
        `- Timestamp: ${formatLocalTimestamp(yesterdayMorning).replace('T', ' ')}`,
        '- Location: 从上海搬去大理的路上',
        '- Action: 整段搬家行程仍在持续',
        '- Emotion_Tags: [专注]',
        '- Appearance: 适合出行的休闲装',
        '- Estimated_Duration: 2880',
        '- Event_Id: evt-move-1',
      ].join('\n'),
      'utf8',
    );

    const handler = makeOpenClawTimelineBeforePromptBuildHook({
      workspaceDir: tmpDir,
      pluginConfig: {
        canonicalMemoryRoot: 'timeline-memory',
        promptTimelineLookbackDays: 7,
        promptTimelineMacroThresholdMinutes: 120,
      },
      config: {},
      runtime: {},
      logger: {},
    });

    const result = await handler(
      {
        prompt: '随便聊聊',
        messages: [{ role: 'user', bodyText: '随便聊聊' }],
      },
      {
        workspaceDir: tmpDir,
        sessionKey: 'session-main',
      },
    );

    expect(result).toBeTruthy();
    expect((result as any).prependContext).toContain('status: active_macro_background');
    expect((result as any).prependContext).toContain('current_state_resolution_required: yes');
  });

  it('respects promptTimelineDirectCurrentStateAnswers=false in both system guidance and injected context', async () => {
    const now = new Date();
    const today = formatLocalCalendarDate(now);
    const twentyMinutesAgo = new Date(now.getTime() - 20 * 60_000);

    fs.writeFileSync(
      path.join(canonicalRoot, `${today}.md`),
      [
        '### [Prompt Context]',
        `- Timestamp: ${formatLocalTimestamp(twentyMinutesAgo).replace('T', ' ')}`,
        '- Location: 家里书房',
        '- Action: 继续整理刚才的工作笔记',
        '- Emotion_Tags: [专注, 平静]',
        '- Appearance: 宽松的家居服',
        '- Estimated_Duration: 120',
      ].join('\n'),
      'utf8',
    );

    const handler = makeOpenClawTimelineBeforePromptBuildHook({
      workspaceDir: tmpDir,
      pluginConfig: {
        canonicalMemoryRoot: 'timeline-memory',
        promptTimelineDirectCurrentStateAnswers: false,
      },
      config: {},
      runtime: {},
      logger: {},
    });

    const result = await handler(
      {
        prompt: '你现在在干嘛',
        messages: [{ role: 'user', bodyText: '你现在在干嘛' }],
      },
      {
        workspaceDir: tmpDir,
        sessionKey: 'session-main',
      },
    );

    expect(result).toBeTruthy();
    expect((result as any).prependSystemContext).toContain('must not be used for direct current-state answers');
    expect((result as any).prependContext).toContain('status: active_instant');
    expect((result as any).prependContext).toContain('direct_current_state_answers_allowed: no');
  });

  it('returns no prompt mutation when prompt timeline context is disabled', async () => {
    const handler = makeOpenClawTimelineBeforePromptBuildHook({
      workspaceDir: tmpDir,
      pluginConfig: {
        canonicalMemoryRoot: 'timeline-memory',
        enablePromptTimelineContext: false,
      },
      config: {},
      runtime: {},
      logger: {},
    });

    const result = await handler(
      { prompt: '你好', messages: [] },
      { workspaceDir: tmpDir, sessionKey: 'session-main' },
    );

    expect(result).toBeUndefined();
  });

  it('returns no prompt mutation when allowPromptInjection is disabled by policy', async () => {
    const handler = makeOpenClawTimelineBeforePromptBuildHook({
      workspaceDir: tmpDir,
      pluginConfig: {
        canonicalMemoryRoot: 'timeline-memory',
      },
      config: {
        plugins: {
          entries: {
            'stella-timeline-plugin': {
              hooks: {
                allowPromptInjection: false,
              },
            },
          },
        },
      },
      runtime: {},
      logger: {},
    });

    const result = await handler(
      { prompt: '你好', messages: [] },
      { workspaceDir: tmpDir, sessionKey: 'session-main' },
    );

    expect(result).toBeUndefined();
  });

  it('degrades prompt context when the hook cannot resolve workspace dependencies', async () => {
    const handler = makeOpenClawTimelineBeforePromptBuildHook({
      pluginConfig: {
        canonicalMemoryRoot: 'timeline-memory',
      },
      config: {},
      runtime: {},
      logger: {},
      resolvePath: () => {
        throw new Error('workspace resolution failed');
      },
    });

    const result = await handler(
      { prompt: '你好', messages: [] },
      { sessionKey: 'session-main' },
    );

    expect(result).toBeTruthy();
    expect((result as any).prependContext).toContain('status: degraded');
    expect((result as any).prependContext).toContain('reason: resolver_unavailable');
  });

});
