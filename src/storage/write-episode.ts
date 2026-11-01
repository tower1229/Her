import * as fs from 'fs';
import * as path from 'path';
import { commitFile, readOptionalFile } from './atomic-file';
import { insertEpisode, truncateDocument } from './daily-document';
import { timestampMillis, timestampWithOffset } from '../lib/timeline-time';
import { computeFingerprint, halfHourTimelineBucket } from '../lib/fingerprint';
import { parseMemoryFile } from '../lib/parse-memory';
import { WorldHooks } from '../lib/types';
import { getHoliday } from '../lib/holidays';
import { inferCountryFromOffset } from '../lib/country';
import { dayOfWeek, formatDate, formatTime, parseTimestampParts } from '../lib/time-utils';

export interface WriteEpisodeInput {
  timestamp: string;
  location: string;
  action: string;
  emotionTags: string[];
  appearance: string;
  internalMonologue?: string;
  estimatedDurationMinutes?: number;
  eventId?: string;
  parentEventTag?: string;
  parentEventPhase?: string;
  parentEventProgress?: number;
  filePath: string;
  confidence?: number;
  legacyLogTimezone?: string;
  truncateEvent?: { eventId: string; timestamp: string };
  /** Existing episodes with these Event_Id values do not trigger same-half-hour-bucket CONFLICT (interrupt / micro-task follow-ups). */
  sameBucketExemptEventIds?: string[];
}

export interface WriteResult {
  success: boolean;
  written_at: string;
  world_hooks?: WorldHooks;
  outcome?: 'appended' | 'noop_existing' | 'conflict' | 'failed';
  error_code?: 'MISSING_FIELDS' | 'INVALID_TIMESTAMP' | 'CONFLICT_EXISTS' | 'LOCK_EXISTS' | 'IO_ERROR';
  error?: string;
  recovery_hint?: string;
  idempotency_key?: string;
  existing_fingerprint?: string;
}

function detectWriteConflict(
  existingContent: string,
  dateStr: string,
  timestamp: string,
  location: string,
  action: string,
  sameBucketExemptEventIds?: string[],
): {
  outcome: 'noop_existing' | 'conflict' | 'clear';
  fingerprint: string;
  existingFingerprint?: string;
} {
  const fingerprint = computeFingerprint(dateStr, location, action, timestamp);
  const newTimeBucket = halfHourTimelineBucket(timestamp);
  const exempt = new Set((sameBucketExemptEventIds ?? []).filter(Boolean));
  const existingEpisodes = parseMemoryFile(existingContent);
  for (const episode of existingEpisodes) {
    const existingDate = episode.timestamp.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || dateStr;
    const existingFingerprint = computeFingerprint(existingDate, episode.location, episode.action, episode.timestamp);
    if (existingFingerprint === fingerprint) {
      return { outcome: 'noop_existing', fingerprint, existingFingerprint };
    }
    const sameDate = existingDate === dateStr;
    const sameTimeBucket = halfHourTimelineBucket(episode.timestamp) === newTimeBucket;
    if (sameDate && sameTimeBucket) {
      if (episode.eventId && exempt.has(episode.eventId)) {
        continue;
      }
      return { outcome: 'conflict', fingerprint, existingFingerprint };
    }
  }

  return { outcome: 'clear', fingerprint };
}

export async function writeEpisode(input: WriteEpisodeInput): Promise<WriteResult> {
  const {
    timestamp,
    location,
    action,
    emotionTags,
    appearance,
    internalMonologue,
    estimatedDurationMinutes,
    eventId,
    parentEventTag,
    parentEventPhase,
    parentEventProgress,
    filePath,
    sameBucketExemptEventIds,
  } = input;

  if (!timestamp || !location || !action || !emotionTags || emotionTags.length === 0 || !appearance) {
    return {
      success: false,
      written_at: '',
      outcome: 'failed',
      error_code: 'MISSING_FIELDS',
      error: 'Missing required fields',
      recovery_hint: 'Provide timestamp, location, action, emotionTags, and appearance before writing canon.',
    };
  }

  try {
    const timestampParts = parseTimestampParts(timestamp);
    if (!timestampParts || !Number.isFinite(timestampMillis(timestamp, input.legacyLogTimezone))) {
      return {
        success: false,
        written_at: '',
        outcome: 'failed',
        error_code: 'INVALID_TIMESTAMP',
        error: 'Invalid timestamp format',
        recovery_hint: 'Use an ISO timestamp or a canonical timeline timestamp before writing canon.',
      };
    }

    const dateStr = formatDate(timestampParts);
    const timeStr = formatTime(timestampParts);
    const weekday = ![0, 6].includes(dayOfWeek(timestampParts));
    const holidayKey = getHoliday(dateStr, inferCountryFromOffset(timestampParts.offset));

    const worldHooks: WorldHooks = {
      weekday,
      holiday_key: holidayKey,
    };
    const expectedContent = readOptionalFile(filePath);
    const existingContent = expectedContent ?? '';
    const conflictCheck = detectWriteConflict(existingContent, dateStr, timestamp, location, action, sameBucketExemptEventIds);
    if (conflictCheck.outcome === 'noop_existing') {
      if (input.truncateEvent) {
        const updated = truncateDocument(existingContent, input.truncateEvent.eventId, input.truncateEvent.timestamp, input.legacyLogTimezone);
        if (updated === null) throw new Error('Prior event cannot be uniquely truncated; no changes committed.');
        commitFile(filePath, expectedContent, updated);
      }
      return {
        success: true,
        written_at: '',
        world_hooks: worldHooks,
        outcome: 'noop_existing',
        idempotency_key: conflictCheck.fingerprint,
        existing_fingerprint: conflictCheck.existingFingerprint,
      };
    }
    if (conflictCheck.outcome === 'conflict') {
      return {
        success: false,
        written_at: '',
        world_hooks: worldHooks,
        outcome: 'conflict',
        error_code: 'CONFLICT_EXISTS',
        error: 'A different episode already occupies the same timeline bucket.',
        recovery_hint: 'Inspect the existing daily log entry before retrying or writing a new canon episode.',
        idempotency_key: conflictCheck.fingerprint,
        existing_fingerprint: conflictCheck.existingFingerprint,
      };
    }

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Only render the new entry; preserve every existing byte during insertion.

    const generatedEventId = eventId ?? `evt-${dateStr.replace(/-/g, '')}-${timeStr.replace(/:/g, '')}`;
    const newEpisode = {
      timestamp: `${dateStr} ${timeStr}`,
      location,
      action,
      emotionTags,
      appearance,
      internalMonologue,
      estimatedDurationMinutes,
      eventId: generatedEventId,
      parentEventTag,
      parentEventPhase,
      parentEventProgress,
    };

    const allEpisodes = [newEpisode];

    const fileLines: string[] = [];
    for (const ep of allEpisodes) {
      const epTimeParts = parseTimestampParts(ep.timestamp) ?? parseTimestampParts(`${ep.timestamp.replace(' ', 'T')}+00:00`);
      const epTimeStr = epTimeParts ? formatTime(epTimeParts) : ep.timestamp.slice(11, 19);
      fileLines.push(`### [${epTimeStr}]`, '');
      fileLines.push(`- Timestamp: ${ep.timestamp}`);
      fileLines.push(`- Location: ${ep.location}`);
      fileLines.push(`- Action: ${ep.action}`);
      fileLines.push(`- Emotion_Tags: [${ep.emotionTags.join(', ')}]`);
      fileLines.push(`- Appearance: ${ep.appearance}`);
      if (ep.internalMonologue) {
        fileLines.push(`- Internal_Monologue: ${ep.internalMonologue}`);
      }
      if (ep.estimatedDurationMinutes != null) {
        fileLines.push(`- Estimated_Duration: ${ep.estimatedDurationMinutes}`);
      }
      if (ep.eventId) {
        fileLines.push(`- Event_Id: ${ep.eventId}`);
      }
      if (ep.parentEventTag) {
        fileLines.push(`- Parent_Event: ${ep.parentEventTag}`);
      }
      if (ep.parentEventPhase) {
        fileLines.push(`- Parent_Event_Phase: ${ep.parentEventPhase}`);
      }
      if (ep.parentEventProgress != null) {
        fileLines.push(`- Parent_Event_Progress: ${ep.parentEventProgress}`);
      }
      fileLines.push(`<!-- timeline:timestamp=${timestampWithOffset(timestamp, input.legacyLogTimezone)} -->`);
      fileLines.push('');
    }

    let updated = insertEpisode(existingContent, fileLines.join('\n') + '\n', timestamp, input.legacyLogTimezone);
    if (input.truncateEvent) {
      const truncated = truncateDocument(updated, input.truncateEvent.eventId, input.truncateEvent.timestamp, input.legacyLogTimezone);
      if (truncated === null) throw new Error('Prior event cannot be uniquely truncated; no changes committed.');
      updated = truncated;
    }
    commitFile(filePath, expectedContent, updated);

    return {
      success: true,
      written_at: new Date().toISOString(),
      world_hooks: worldHooks,
      outcome: 'appended',
      idempotency_key: conflictCheck.fingerprint,
    };
  } catch (error: any) {
    return {
      success: false,
      written_at: '',
      outcome: 'failed',
      error_code: 'IO_ERROR',
      error: error.message,
      recovery_hint: 'Check file permissions and retry after confirming the timeline path is writable.',
    };
  }
}

export async function truncateEpisodeDuration(
  filePath: string,
  eventId: string,
  interruptionTimeISO: string,
  legacyLogTimezone?: string,
): Promise<boolean> {
  try {
    const original = readOptionalFile(filePath);
    if (original === null) return false;
    const updated = truncateDocument(original, eventId, interruptionTimeISO, legacyLogTimezone);
    if (updated === null) return false;
    commitFile(filePath, original, updated);
    return true;
  } catch { return false; }
}
