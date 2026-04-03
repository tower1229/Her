import { createDefaultEngagementState, ResolvedProactiveGreetingConfig } from './engagement_state';
import { shouldSendProactiveGreeting } from './should_send_proactive_greeting';

function baseConfig(): ResolvedProactiveGreetingConfig {
  return {
    enabled: true,
    idleThresholdHours: 7,
    minHoursBetweenCheckins: 24,
    minHoursSinceNonSocialOutbound: 6,
    unansweredPenaltyThreshold: 2,
    unansweredPenaltyIdleHours: 72,
    sessionKey: 'proactive-greeting',
    pendingSendTimeoutMinutes: 20,
    singleUserGuard: true,
    canonicalMemoryRoot: 'memory',
    activeHours: {
      start: '09:00',
      end: '21:30',
      timezone: 'UTC',
    },
    userTimezone: 'UTC',
  };
}

describe('shouldSendProactiveGreeting', () => {
  const now = new Date('2026-04-03T12:00:00.000Z');

  it('allows a greeting when all conditions pass', () => {
    const state = {
      ...createDefaultEngagementState(),
      user_timezone: 'UTC',
      last_user_message_at: '2026-04-03T04:00:00.000Z',
      contact_scope_status: 'single' as const,
    };

    const decision = shouldSendProactiveGreeting(state, now, baseConfig());
    expect(decision.ok).toBe(true);
    expect(decision.reason_code).toBe('allowed');
  });

  it('blocks when pending send is already inflight', () => {
    const state = {
      ...createDefaultEngagementState(),
      user_timezone: 'UTC',
      last_user_message_at: '2026-04-03T04:00:00.000Z',
      pending_proactive_send: true,
    };

    const decision = shouldSendProactiveGreeting(state, now, baseConfig());
    expect(decision.ok).toBe(false);
    expect(decision.reason_code).toBe('pending_send_inflight');
  });

  it('blocks under quiet hours', () => {
    const state = {
      ...createDefaultEngagementState(),
      user_timezone: 'UTC',
      last_user_message_at: '2026-04-03T00:00:00.000Z',
    };

    const decision = shouldSendProactiveGreeting(state, new Date('2026-04-03T22:00:00.000Z'), baseConfig());
    expect(decision.ok).toBe(false);
    expect(decision.reason_code).toBe('quiet_hours');
  });

  it('applies the unanswered penalty threshold', () => {
    const state = {
      ...createDefaultEngagementState(),
      user_timezone: 'UTC',
      last_user_message_at: '2026-04-01T12:00:00.000Z',
      unanswered_proactive_count: 2,
    };

    const decision = shouldSendProactiveGreeting(state, now, baseConfig());
    expect(decision.ok).toBe(false);
    expect(decision.reason_code).toBe('penalty_threshold_not_reached');
  });

  it('blocks when a recent proactive greeting exists', () => {
    const state = {
      ...createDefaultEngagementState(),
      user_timezone: 'UTC',
      last_user_message_at: '2026-04-03T00:00:00.000Z',
      last_proactive_checkin_at: '2026-04-03T02:00:00.000Z',
    };

    const decision = shouldSendProactiveGreeting(state, now, baseConfig());
    expect(decision.reason_code).toBe('min_interval_not_reached');
  });

  it('blocks multi-contact workspaces when the guard is active', () => {
    const state = {
      ...createDefaultEngagementState(),
      user_timezone: 'UTC',
      last_user_message_at: '2026-04-03T00:00:00.000Z',
      contact_scope_status: 'conflict' as const,
    };

    const decision = shouldSendProactiveGreeting(state, now, baseConfig());
    expect(decision.ok).toBe(false);
    expect(decision.reason_code).toBe('multi_contact_workspace');
  });
});
