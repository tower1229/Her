import {
  EngagementDecisionSummary,
  EngagementStateV1,
  ResolvedHeartbeatActiveHours,
  ResolvedProactiveGreetingConfig,
} from './engagement_state';

export type IdleCheckinReasonCode =
  | 'allowed'
  | 'disabled'
  | 'missing_last_user_message'
  | 'quiet_hours'
  | 'min_interval_not_reached'
  | 'opted_out'
  | 'penalty_threshold_not_reached'
  | 'pending_send_inflight'
  | 'multi_contact_workspace';

export type IdleCheckinDecision = {
  ok: boolean;
  reason_code: IdleCheckinReasonCode;
  idle_hours: number;
  local_time: string;
  rule_snapshot: Record<string, unknown>;
};

function hoursSince(earlierIso: string | null, now: Date): number | null {
  if (!earlierIso) return null;
  const earlier = new Date(earlierIso);
  if (Number.isNaN(earlier.getTime())) return null;
  return (now.getTime() - earlier.getTime()) / 3_600_000;
}

function resolveTimeZone(
  state: EngagementStateV1,
  config: ResolvedProactiveGreetingConfig,
  activeHours?: ResolvedHeartbeatActiveHours,
): string {
  const preferred = activeHours?.timezone;
  if (!preferred || preferred === 'user') {
    return state.user_timezone || config.userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  }
  if (preferred === 'local') {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  }
  return preferred;
}

function resolveLocalClock(now: Date, timeZone: string): { label: string; minutes: number | null } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 'NaN');
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 'NaN');
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      return { label: 'unknown', minutes: null };
    }
    return {
      label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      minutes: hour * 60 + minute,
    };
  } catch {
    return resolveLocalClock(now, Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  }
}

function parseClockToMinutes(raw?: string): number | null {
  if (!raw) return null;
  const match = raw.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours === 24 && minutes === 0) return 1_440;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function isWithinActiveHours(
  localMinutes: number | null,
  activeHours?: ResolvedHeartbeatActiveHours,
): boolean {
  if (!activeHours?.start || !activeHours?.end) return true;
  if (localMinutes === null) return true;
  const start = parseClockToMinutes(activeHours.start);
  const end = parseClockToMinutes(activeHours.end);
  if (start === null || end === null) return true;
  if (start === end) return false;
  if (end > start) return localMinutes >= start && localMinutes < end;
  return localMinutes >= start || localMinutes < end;
}

function buildDecision(
  ok: boolean,
  reasonCode: IdleCheckinReasonCode,
  idleHours: number,
  localTime: string,
  snapshot: Record<string, unknown>,
): IdleCheckinDecision {
  return {
    ok,
    reason_code: reasonCode,
    idle_hours: idleHours,
    local_time: localTime,
    rule_snapshot: snapshot,
  };
}

export function shouldSendProactiveGreeting(
  state: EngagementStateV1,
  now: Date,
  config: ResolvedProactiveGreetingConfig,
): IdleCheckinDecision {
  const timeZone = resolveTimeZone(state, config, config.activeHours);
  const localClock = resolveLocalClock(now, timeZone);
  const idleHours = hoursSince(state.last_user_message_at, now) ?? 0;
  const sinceLastCheckin = hoursSince(state.last_proactive_checkin_at, now);
  const penaltyThresholdHours = state.unanswered_proactive_count >= config.unansweredPenaltyThreshold
    ? config.unansweredPenaltyIdleHours
    : config.idleThresholdHours;

  const snapshot: Record<string, unknown> = {
    configured_enabled: config.enabled,
    pending_proactive_send: state.pending_proactive_send,
    local_time: localClock.label,
    time_zone: timeZone,
    idle_threshold_hours: config.idleThresholdHours,
    effective_idle_threshold_hours: penaltyThresholdHours,
    min_hours_between_checkins: config.minHoursBetweenCheckins,
    unanswered_proactive_count: state.unanswered_proactive_count,
    contact_scope_status: state.contact_scope_status,
  };

  if (!config.enabled) {
    return buildDecision(false, 'disabled', idleHours, localClock.label, snapshot);
  }
  if (state.contact_scope_status === 'conflict') {
    return buildDecision(false, 'multi_contact_workspace', idleHours, localClock.label, snapshot);
  }
  if (state.pending_proactive_send) {
    return buildDecision(false, 'pending_send_inflight', idleHours, localClock.label, snapshot);
  }
  if (!state.last_user_message_at) {
    return buildDecision(false, 'missing_last_user_message', idleHours, localClock.label, snapshot);
  }
  if (state.proactive_opt_out) {
    return buildDecision(false, 'opted_out', idleHours, localClock.label, snapshot);
  }
  if (!isWithinActiveHours(localClock.minutes, config.activeHours)) {
    return buildDecision(false, 'quiet_hours', idleHours, localClock.label, snapshot);
  }
  if (state.unanswered_proactive_count >= config.unansweredPenaltyThreshold && idleHours < config.unansweredPenaltyIdleHours) {
    return buildDecision(false, 'penalty_threshold_not_reached', idleHours, localClock.label, snapshot);
  }
  if (idleHours < config.idleThresholdHours) {
    return buildDecision(false, 'min_interval_not_reached', idleHours, localClock.label, snapshot);
  }
  if (sinceLastCheckin !== null && sinceLastCheckin < config.minHoursBetweenCheckins) {
    return buildDecision(false, 'min_interval_not_reached', idleHours, localClock.label, snapshot);
  }
  return buildDecision(true, 'allowed', idleHours, localClock.label, snapshot);
}

export function toDecisionSummary(
  decision: IdleCheckinDecision,
  now: Date,
): EngagementDecisionSummary {
  return {
    ts: now.toISOString(),
    ok: decision.ok,
    reason_code: decision.reason_code,
    idle_hours: Number(decision.idle_hours.toFixed(3)),
    local_time: decision.local_time,
    rule_snapshot: decision.rule_snapshot,
  };
}
