import { computeFingerprint } from '../lib/fingerprint';
import { resolveAppearance } from '../lib/inherit-appearance';
import { mapToEpisode, parseMemoryFile } from '../lib/parse-memory';
import { ParsedEpisode } from '../lib/types';
import { dayOfWeek, formatDate, parseTimestampParts } from '../lib/time-utils';
import { getHoliday } from '../lib/holidays';
import { CollectedSources } from './collect_sources';
import { ResolvedWindow } from './resolve_window';
import { TimelineGeneratedDraft } from './timeline_reasoner_contract';

export interface GeneratedCandidateResult {
  parsed: ParsedEpisode;
  episode: ReturnType<typeof mapToEpisode>;
  idempotencyKey: string;
  notes: string[];
  generationReason: string;
  appearance: {
    inherited: boolean;
    reason: string;
    source_episode_timestamp?: string;
  };
}

function assertNonEmptyString(value: unknown, field: string): string {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`Generated draft missing required field: ${field}`);
  }
  return normalized;
}

function normalizeGeneratedDraft(draft: TimelineGeneratedDraft): TimelineGeneratedDraft {
  const emotionTags = (draft.emotionTags || []).map((tag) => String(tag).trim()).filter(Boolean);
  if (emotionTags.length === 0) {
    throw new Error('Generated draft missing required field: emotionTags');
  }

  const confidence = Number(draft.confidence);
  if (!Number.isFinite(confidence)) {
    throw new Error('Generated draft has invalid confidence');
  }

  return {
    location: assertNonEmptyString(draft.location, 'location'),
    action: assertNonEmptyString(draft.action, 'action'),
    emotionTags: emotionTags.slice(0, 3),
    appearance: assertNonEmptyString(draft.appearance, 'appearance'),
    internalMonologue: assertNonEmptyString(draft.internalMonologue, 'internalMonologue'),
    naturalText: assertNonEmptyString(draft.naturalText, 'naturalText'),
    confidence: Math.max(0.2, Math.min(1, confidence)),
    reason: draft.reason ? String(draft.reason).trim() : undefined,
  };
}

function inferCountryFromOffset(offset?: string): 'CN' | 'US' {
  return offset === '+08:00' ? 'CN' : 'US';
}

export function materializeGeneratedCandidate(
  window: ResolvedWindow,
  sources: CollectedSources,
  draft: TimelineGeneratedDraft,
  reason = 'llm-guided semantic timeline synthesis',
): GeneratedCandidateResult {
  const normalized = normalizeGeneratedDraft(draft);
  const dayEpisodes = parseMemoryFile(sources.memoryContent);
  const timestampParts = parseTimestampParts(window.end);
  if (!timestampParts) {
    throw new Error(`Cannot materialize generated candidate without parseable window end: ${window.end}`);
  }

  const priorEpisode = dayEpisodes[dayEpisodes.length - 1];
  const appearanceResolution = resolveAppearance(dayEpisodes, normalized.action, normalized.appearance);
  const parsed: ParsedEpisode = {
    timestamp: window.end,
    location: normalized.location,
    action: normalized.action,
    emotionTags: normalized.emotionTags,
    appearance: appearanceResolution.appearance,
    internalMonologue: normalized.internalMonologue,
    naturalText: normalized.naturalText,
    parseLevel: 'A',
    confidence: normalized.confidence,
  };

  const date = formatDate(timestampParts);
  const idempotencyKey = computeFingerprint(date, parsed.location, parsed.action, parsed.timestamp);
  const worldHooks = {
    weekday: ![0, 6].includes(dayOfWeek(timestampParts)),
    holiday_key: getHoliday(date, inferCountryFromOffset(timestampParts.offset)),
  };

  return {
    parsed,
    episode: mapToEpisode(parsed, worldHooks, idempotencyKey),
    idempotencyKey,
    generationReason: normalized.reason || reason,
    notes: [
      'No reusable canon entry found; generated a timeline memory from the LLM draft.',
      `Generation basis: ${normalized.reason || reason}`,
      `Persona context loaded: ${sources.coreContext.soul || sources.coreContext.memory || sources.coreContext.identity ? 'SOUL / MEMORY / IDENTITY signals available' : 'no explicit profile files found in runtime context'}`,
      `Appearance resolution: ${appearanceResolution.reason}`,
    ],
    appearance: {
      inherited: !appearanceResolution.overridden,
      reason: appearanceResolution.reason,
      source_episode_timestamp: priorEpisode?.timestamp,
    },
  };
}
