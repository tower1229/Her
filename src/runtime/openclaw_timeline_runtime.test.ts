import * as fs from 'fs';
import * as path from 'path';
import {
  makeOpenClawTimelineResolveToolFactory,
  resetOpenClawPluginRuntimeModuleLoaderForTests,
  setOpenClawPluginRuntimeModuleLoaderForTests,
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
    resetOpenClawPluginRuntimeModuleLoaderForTests();
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    resetOpenClawPluginRuntimeModuleLoaderForTests();
  });

  it('injects workspace/session/pluginConfig into timeline_resolve through the real runtime factory', async () => {
    const today = formatLocalCalendarDate(new Date());

    fs.writeFileSync(
      path.join(canonicalRoot, `${today}.md`),
      `### [Episode]\n- Timestamp: ${today}T18:00:00+08:00\n- Location: 家里书房\n- Action: 继续整理今天的工作记录\n- Emotion_Tags: [专注, 平静]\n- Appearance: 宽松的家居服\n- Internal_Monologue: 再收一下尾就差不多了。\n她傍晚还在家里书房继续整理今天的工作记录。`,
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

  it('recovers the matching planner and reasoner JSON from mixed assistant transcripts', async () => {
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

    const payload = result.details as { ok: boolean; resolution_summary?: { mode: string }; result?: { episodes: any[] } };
    expect(payload.ok).toBe(true);
    expect(payload.resolution_summary?.mode).toBe('read_only_hit');
    expect(String(payload.result?.episodes?.[0]?.state_snapshot?.scene?.location_label || '')).toContain('书房');
  });

  it('falls back to heuristic planner and reasoner decisions when subagents time out', async () => {
    const today = formatLocalCalendarDate(new Date());

    fs.writeFileSync(
      path.join(canonicalRoot, `${today}.md`),
      `### [Episode]\n- Timestamp: ${today}T18:00:00+08:00\n- Location: 家里书房\n- Action: 继续整理今天的工作记录\n- Emotion_Tags: [专注, 平静]\n- Appearance: 宽松的家居服\n- Internal_Monologue: 再收一下尾就差不多了。\n她傍晚还在家里书房继续整理今天的工作记录。`,
      'utf8',
    );

    const pluginApi = {
      workspaceDir: tmpDir,
      pluginConfig: {
        canonicalMemoryRoot: 'timeline-memory',
      },
      runtime: {
        subagent: {
          run: async () => ({ runId: 'reasoner-run-timeout' }),
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
      query: '你在干嘛',
    });

    const payload = result.details as { ok: boolean; resolution_summary: { mode: string }; result?: { episodes: any[] } };
    expect(payload.ok).toBe(true);
    expect(payload.resolution_summary.mode).toBe('read_only_hit');
    expect(String(payload.result?.episodes?.[0]?.state_snapshot?.scene?.location_label || '')).toContain('书房');
  });

  it('recovers by late-binding the gateway subagent runtime when the injected runtime is unavailable', async () => {
    const today = formatLocalCalendarDate(new Date());

    fs.writeFileSync(
      path.join(canonicalRoot, `${today}.md`),
      `### [Episode]\n- Timestamp: ${today}T18:00:00+08:00\n- Location: 家里书房\n- Action: 继续整理今天的工作记录\n- Emotion_Tags: [专注, 平静]\n- Appearance: 宽松的家居服\n- Internal_Monologue: 再收一下尾就差不多了。\n她傍晚还在家里书房继续整理今天的工作记录。`,
      'utf8',
    );

    let latestReasonerRequestId = '';
    let latestPlannerRequestId = '';
    const unavailable = jest.fn(async () => {
      throw new Error('Plugin runtime subagent methods are only available during a gateway request.');
    });
    const lateBoundGetSessionMessages = jest.fn();

    setOpenClawPluginRuntimeModuleLoaderForTests(() => ({
      createPluginRuntime: () => ({
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
            return { runId: 'late-bound-run-1' };
          },
          waitForRun: async () => ({ status: 'ok' as const }),
          getSessionMessages: lateBoundGetSessionMessages,
          getSession: lateBoundGetSessionMessages,
          deleteSession: async () => undefined,
        },
      }),
    }));

    const pluginApi = {
      workspaceDir: tmpDir,
      pluginConfig: {
        canonicalMemoryRoot: 'timeline-memory',
      },
      runtime: {
        subagent: {
          run: unavailable,
          waitForRun: unavailable,
          getSessionMessages: unavailable,
          deleteSession: unavailable,
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
      sessionKey: 'telegram:chat-123',
    });

    lateBoundGetSessionMessages.mockImplementation(async ({ sessionKey }: { sessionKey: string }) => {
      if (sessionKey === 'telegram:chat-123') {
        return {
          messages: [
            { role: 'user', bodyText: '你现在在干嘛' },
            { role: 'assistant', bodyText: '我先确认一下现在的状态。' },
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
                canon_basis: [`canon:${today}:0`],
                persona_basis: [],
                constraint_basis: [],
              },
            }),
          },
        ],
      };
    });

    const result = await tool.execute('call-late-bound', {
      query: '你现在在干嘛',
    });

    const payload = result.details as { ok: boolean; resolution_summary: { mode: string }; result?: { episodes: unknown[] } };
    expect(payload.ok).toBe(true);
    expect(payload.resolution_summary.mode).toBe('read_only_hit');
    expect(payload.result?.episodes).toHaveLength(1);
    expect(unavailable).toHaveBeenCalled();
    expect(lateBoundGetSessionMessages).toHaveBeenCalledWith({
      sessionKey: 'telegram:chat-123',
      limit: 12,
    });
  });

});
