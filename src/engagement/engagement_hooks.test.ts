import * as fs from 'fs';
import * as path from 'path';
import {
  handlePreprocessedInbound,
  handleSentOutbound,
  prepareProactiveGreetingHeartbeatContext,
} from './engagement_hooks';
import {
  loadEngagementState,
  resolveEngagementStatePath,
} from './engagement_state';

describe('engagement hooks', () => {
  const tmpDir = path.join(__dirname, '__engagement_hooks_tmp__');
  const params = {
    workspaceDir: tmpDir,
    pluginConfig: {
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
  };

  beforeEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(tmpDir, 'memory'), { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('records enriched inbound messages and opt-out/opt-in markers', async () => {
    await handlePreprocessedInbound(
      {
        sessionKey: 'telegram:main',
        timestamp: new Date('2026-04-03T12:00:00.000Z'),
        context: {
          channelId: 'telegram',
          conversationId: 'chat-1',
          from: 'user-1',
          messageId: 'msg-1',
          bodyForAgent: '别太频繁联系我',
        },
      },
      params,
    );

    let state = loadEngagementState(resolveEngagementStatePath(tmpDir));
    expect(state.last_user_message_at).toBe('2026-04-03T12:00:00.000Z');
    expect(state.proactive_opt_out).toBe(true);
    expect(state.primary_contact_fingerprint).toBeTruthy();
    expect(state.contact_scope_status).toBe('single');

    await handlePreprocessedInbound(
      {
        sessionKey: 'telegram:main',
        timestamp: new Date('2026-04-03T12:05:00.000Z'),
        context: {
          channelId: 'telegram',
          conversationId: 'chat-1',
          from: 'user-1',
          messageId: 'msg-2',
          transcript: '你可以主动联系我了',
        },
      },
      params,
    );

    state = loadEngagementState(resolveEngagementStatePath(tmpDir));
    expect(state.proactive_opt_out).toBe(false);
    expect(state.last_inbound_dedupe_key).toBe('msg:msg-2');
  });

  it('marks multi-contact conflicts when the fingerprint changes', async () => {
    await handlePreprocessedInbound(
      {
        sessionKey: 'telegram:main',
        timestamp: new Date('2026-04-03T12:00:00.000Z'),
        context: {
          channelId: 'telegram',
          conversationId: 'chat-1',
          from: 'user-1',
          bodyForAgent: '你好',
        },
      },
      params,
    );

    await handlePreprocessedInbound(
      {
        sessionKey: 'telegram:main',
        timestamp: new Date('2026-04-03T12:10:00.000Z'),
        context: {
          channelId: 'telegram',
          conversationId: 'chat-2',
          from: 'user-2',
          bodyForAgent: '你好',
        },
      },
      params,
    );

    const state = loadEngagementState(resolveEngagementStatePath(tmpDir));
    expect(state.contact_scope_status).toBe('conflict');
  });

  it('dedupes inbound events by fallback hash when messageId is missing', async () => {
    const event = {
      sessionKey: 'telegram:main',
      timestamp: new Date('2026-04-03T12:00:00.000Z'),
      context: {
        channelId: 'telegram',
        conversationId: 'chat-1',
        from: 'user-1',
        bodyForAgent: '你好',
      },
    };

    await handlePreprocessedInbound(event, params);
    await handlePreprocessedInbound(event, params);

    const state = loadEngagementState(resolveEngagementStatePath(tmpDir));
    expect(state.recent_inbound_dedupe_keys).toHaveLength(1);
    expect(state.last_inbound_dedupe_key).toBe(state.recent_inbound_dedupe_keys[0]);
  });

  it('prepares pending state for proactive heartbeat runs and closes it on successful send', async () => {
    const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60_000);
    await handlePreprocessedInbound(
      {
        sessionKey: 'telegram:main',
        timestamp: eightHoursAgo,
        context: {
          channelId: 'telegram',
          conversationId: 'chat-1',
          from: 'user-1',
          bodyForAgent: '早',
        },
      },
      params,
    );

    const heartbeatContext = await prepareProactiveGreetingHeartbeatContext(
      {
        prompt: 'Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. If nothing needs attention, reply HEARTBEAT_OK.',
        messages: [],
      },
      {
        workspaceDir: tmpDir,
        sessionKey: 'proactive-greeting',
        trigger: 'heartbeat',
      },
      params,
    );

    expect(heartbeatContext?.prependContext).toContain('send is allowed');

    let state = loadEngagementState(resolveEngagementStatePath(tmpDir));
    expect(state.pending_proactive_send).toBe(true);
    expect(state.last_proactive_decision_token).toBeTruthy();
    const pendingStartedAt = new Date(state.pending_proactive_send_started_at || Date.now());

    await handleSentOutbound(
      {
        sessionKey: 'proactive-greeting',
        timestamp: new Date(pendingStartedAt.getTime() + 10_000),
        context: {
          channelId: 'telegram',
          conversationId: 'chat-1',
          to: 'chat-1',
          content: '轻轻来问候你一下，今天还顺利吗？',
          success: true,
          messageId: 'out-1',
        },
      },
      params,
    );

    state = loadEngagementState(resolveEngagementStatePath(tmpDir));
    expect(state.pending_proactive_send).toBe(false);
    expect(state.last_outbound_reason).toBe('proactive_greeting');
    expect(state.last_successful_proactive_message_id).toBe('out-1');
    expect(state.unanswered_proactive_count).toBe(1);
  });

  it('clears stale pending sends on failed outbound delivery', async () => {
    const statePath = resolveEngagementStatePath(tmpDir);
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        schema_version: '1.0',
        state_revision: 1,
        user_timezone: 'UTC',
        last_user_message_at: '2026-04-03T03:00:00.000Z',
        last_proactive_checkin_at: null,
        last_non_social_outbound_at: null,
        last_outbound_reason: null,
        last_successful_proactive_message_id: null,
        last_inbound_dedupe_key: null,
        last_outbound_dedupe_key: null,
        recent_inbound_dedupe_keys: [],
        recent_outbound_dedupe_keys: [],
        last_proactive_decision_token: 'decision-1',
        pending_proactive_send: true,
        pending_proactive_send_started_at: '2026-04-03T11:50:00.000Z',
        proactive_greeting_enabled: true,
        idle_threshold_hours: 7,
        proactive_opt_out: false,
        unanswered_proactive_count: 0,
        last_heartbeat_checked_at: '2026-04-03T11:50:00.000Z',
        last_decision: null,
        last_error: null,
        primary_contact_fingerprint: 'fp-1',
        contact_scope_status: 'single',
      }, null, 2),
      'utf8',
    );

    await handleSentOutbound(
      {
        sessionKey: 'proactive-greeting',
        timestamp: new Date('2026-04-03T12:00:10.000Z'),
        context: {
          channelId: 'telegram',
          conversationId: 'chat-1',
          to: 'chat-1',
          content: 'hi',
          success: false,
          error: 'delivery failed',
        },
      },
      params,
    );

    const state = loadEngagementState(statePath);
    expect(state.pending_proactive_send).toBe(false);
    expect(state.last_error?.code).toBe('proactive_send_failed');
  });

  it('dedupes outbound events by fallback hash when messageId is missing', async () => {
    const statePath = resolveEngagementStatePath(tmpDir);
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        schema_version: '1.0',
        state_revision: 1,
        user_timezone: 'UTC',
        last_user_message_at: '2026-04-03T03:00:00.000Z',
        last_proactive_checkin_at: null,
        last_non_social_outbound_at: null,
        last_outbound_reason: null,
        last_successful_proactive_message_id: null,
        last_inbound_dedupe_key: null,
        last_outbound_dedupe_key: null,
        recent_inbound_dedupe_keys: [],
        recent_outbound_dedupe_keys: [],
        last_proactive_decision_token: 'decision-1',
        pending_proactive_send: true,
        pending_proactive_send_started_at: '2026-04-03T11:50:00.000Z',
        proactive_greeting_enabled: true,
        idle_threshold_hours: 7,
        proactive_opt_out: false,
        unanswered_proactive_count: 0,
        last_heartbeat_checked_at: '2026-04-03T11:50:00.000Z',
        last_decision: null,
        last_error: null,
        primary_contact_fingerprint: 'fp-1',
        contact_scope_status: 'single',
      }, null, 2),
      'utf8',
    );

    const event = {
      sessionKey: 'proactive-greeting',
      timestamp: new Date('2026-04-03T12:00:10.000Z'),
      context: {
        channelId: 'telegram',
        conversationId: 'chat-1',
        to: 'chat-1',
        content: 'hi',
        success: true,
      },
    };

    await handleSentOutbound(event, params);
    await handleSentOutbound(event, params);

    const state = loadEngagementState(statePath);
    expect(state.unanswered_proactive_count).toBe(1);
    expect(state.recent_outbound_dedupe_keys).toHaveLength(1);
  });
});
