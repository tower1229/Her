import * as fs from 'fs';
import * as path from 'path';
import { computeFingerprint } from '../lib/fingerprint';
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
  filePath: string,
  dateStr: string,
  timestamp: string,
  location: string,
  action: string,
): {
  outcome: 'noop_existing' | 'conflict' | 'clear';
  fingerprint: string;
  existingFingerprint?: string;
} {
  const fingerprint = computeFingerprint(dateStr, location, action, timestamp);
  if (!fs.existsSync(filePath)) {
    return { outcome: 'clear', fingerprint };
  }

  const existingContent = fs.readFileSync(filePath, 'utf8');
  const existingEpisodes = parseMemoryFile(existingContent);
  for (const episode of existingEpisodes) {
    const existingDate = episode.timestamp.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || dateStr;
    const existingFingerprint = computeFingerprint(existingDate, episode.location, episode.action, episode.timestamp);
    if (existingFingerprint === fingerprint) {
      return { outcome: 'noop_existing', fingerprint, existingFingerprint };
    }
    const sameDate = existingDate === dateStr;
    const sameTimeBucket = existingFingerprint.split('|')[3] === fingerprint.split('|')[3];
    if (sameDate && sameTimeBucket) {
      return { outcome: 'conflict', fingerprint, existingFingerprint };
    }
  }

  return { outcome: 'clear', fingerprint };
}

export async function writeEpisode(input: WriteEpisodeInput): Promise<WriteResult> {
  const { timestamp, location, action, emotionTags, appearance, internalMonologue, estimatedDurationMinutes, eventId, parentEventTag, parentEventPhase, parentEventProgress, filePath } = input;

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
    const dateObj = timestampParts ? null : new Date(timestamp);
    if (!timestampParts && (!dateObj || isNaN(dateObj.getTime()))) {
      return {
        success: false,
        written_at: '',
        outcome: 'failed',
        error_code: 'INVALID_TIMESTAMP',
        error: 'Invalid timestamp format',
        recovery_hint: 'Use an ISO timestamp or a canonical timeline timestamp before writing canon.',
      };
    }

    const yyyy = timestampParts ? timestampParts.year : dateObj!.getFullYear();
    const mm = String(timestampParts ? timestampParts.month : dateObj!.getMonth() + 1).padStart(2, '0');
    const dd = String(timestampParts ? timestampParts.day : dateObj!.getDate()).padStart(2, '0');
    const dateStr = timestampParts ? formatDate(timestampParts) : `${yyyy}-${mm}-${dd}`;

    const timeStr = timestampParts
      ? formatTime(timestampParts)
      : `${String(dateObj!.getHours()).padStart(2, '0')}:${String(dateObj!.getMinutes()).padStart(2, '0')}:${String(dateObj!.getSeconds()).padStart(2, '0')}`;

    const isWeekend = timestampParts ? [0, 6].includes(dayOfWeek(timestampParts)) : dateObj!.getDay() === 0 || dateObj!.getDay() === 6;
    const weekday = !isWeekend;
    const holidayKey = getHoliday(`${yyyy}-${mm}-${dd}`, timestampParts ? inferCountryFromOffset(timestampParts.offset) : 'US');

    const worldHooks: WorldHooks = {
      weekday,
      holiday_key: holidayKey,
    };
    const conflictCheck = detectWriteConflict(filePath, dateStr, timestamp, location, action);
    if (conflictCheck.outcome === 'noop_existing') {
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

    // Read existing episodes, merge with the new one, sort by timestamp, and rewrite
    // the entire file so the daily log stays in chronological order.
    const existingContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    const existingEpisodes = parseMemoryFile(existingContent);

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

    const allEpisodes = [...existingEpisodes, newEpisode];
    allEpisodes.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

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
      fileLines.push('');
    }

    fs.writeFileSync(filePath, fileLines.join('\n') + '\n', 'utf8');

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
  interruptionTimeISO: string
): Promise<boolean> {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  
  try {
    const existingContent = fs.readFileSync(filePath, 'utf8');
    const allEpisodes = parseMemoryFile(existingContent);
    let found = false;

    // We locate the episode by eventId (or simply the latest if eventId is missing but we're doing a strict interrupt)
    for (const ep of allEpisodes) {
      if (ep.eventId === eventId && ep.estimatedDurationMinutes) {
        const epTimeParts = parseTimestampParts(ep.timestamp);
        const interruptParts = parseTimestampParts(interruptionTimeISO);
        if (epTimeParts && interruptParts && epTimeParts.year === interruptParts.year && epTimeParts.month === interruptParts.month && epTimeParts.day === interruptParts.day) {
           const startMinutes = epTimeParts.hour * 60 + epTimeParts.minute;
           const endMinutes = interruptParts.hour * 60 + interruptParts.minute;
           const diff = endMinutes - startMinutes;
           if (diff > 0 && diff < ep.estimatedDurationMinutes) {
              ep.estimatedDurationMinutes = diff;
              found = true;
           } else if (diff <= 0) {
              ep.estimatedDurationMinutes = 1; // Minimum 1 min length
              found = true;
           }
        } else {
           // Basic fallback if unparseable / multi-day
           const d1 = new Date(ep.timestamp.replace(' ', 'T')).getTime();
           const d2 = new Date(interruptionTimeISO.replace(' ', 'T')).getTime();
           if (!isNaN(d1) && !isNaN(d2)) {
             const diffMins = Math.floor((d2 - d1) / 60000);
             if (diffMins > 0 && diffMins < ep.estimatedDurationMinutes) {
               ep.estimatedDurationMinutes = diffMins;
               found = true;
             }
           }
        }
      }
    }

    if (!found) return false;

    // Rewrite exactly like writeEpisode
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
      fileLines.push('');
    }

    fs.writeFileSync(filePath, fileLines.join('\n') + '\n', 'utf8');
    return true;
  } catch(e) {
    return false;
  }
}
