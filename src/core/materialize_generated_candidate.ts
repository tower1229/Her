import { computeFingerprint } from '../lib/fingerprint';
import { resolveAppearance } from '../lib/inherit-appearance';
import { mapToEpisode, parseMemoryFile } from '../lib/parse-memory';
import { ParsedEpisode } from '../lib/types';
import { dayOfWeek, formatDate, parseTimestampParts } from '../lib/time-utils';
import { getHoliday } from '../lib/holidays';
import { inferCountryFromOffset } from '../lib/country';
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
    transition: string;
    outfit_mode: string;
    change_reason: string;
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
    timestamp: draft.timestamp ? assertNonEmptyString(draft.timestamp, 'timestamp') : undefined,
    location: assertNonEmptyString(draft.location, 'location'),
    action: assertNonEmptyString(draft.action, 'action'),
    emotionTags: emotionTags.slice(0, 3),
    appearance: assertNonEmptyString(draft.appearance, 'appearance'),
    internalMonologue: assertNonEmptyString(draft.internalMonologue, 'internalMonologue'),
    confidence: Math.max(0.2, Math.min(1, confidence)),
    reason: draft.reason ? String(draft.reason).trim() : undefined,
    sceneSemantics: draft.sceneSemantics,
    appearanceLogic: draft.appearanceLogic,
  };
}

export function materializeGeneratedCandidate(
  window: ResolvedWindow,
  sources: CollectedSources,
  draft: TimelineGeneratedDraft,
  reason = 'llm-guided semantic timeline synthesis',
): GeneratedCandidateResult {
  const normalized = normalizeGeneratedDraft(draft);
  const candidateTimestamp = normalized.timestamp || window.end;
  const timestampParts = parseTimestampParts(candidateTimestamp);
  if (!timestampParts) {
    throw new Error(`Cannot materialize generated candidate without parseable timestamp: ${candidateTimestamp}`);
  }
  const materializedDate = formatDate(timestampParts);
  const currentDayLog = sources.dailyLogs.find((entry) => entry.calendar_date === materializedDate);
  const dayEpisodes = parseMemoryFile(currentDayLog?.raw_content || '');

  const appearanceResolution = resolveAppearance(dayEpisodes, normalized.appearance, normalized.appearanceLogic);
  const parsed: ParsedEpisode = {
    timestamp: candidateTimestamp,
    location: normalized.location,
    action: normalized.action,
    emotionTags: normalized.emotionTags,
    appearance: appearanceResolution.appearance,
    internalMonologue: normalized.internalMonologue,
    parseLevel: 'A',
    confidence: normalized.confidence,
  };

  const idempotencyKey = computeFingerprint(materializedDate, parsed.location, parsed.action, parsed.timestamp);
  const worldHooks = {
    weekday: ![0, 6].includes(dayOfWeek(timestampParts)),
    holiday_key: getHoliday(materializedDate, inferCountryFromOffset(timestampParts.offset)),
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
      source_episode_timestamp: appearanceResolution.sourceEpisodeTimestamp,
      transition: appearanceResolution.transition,
      outfit_mode: appearanceResolution.outfitMode,
      change_reason: appearanceResolution.changeReason,
    },
  };
}
