import { parseMemoryFile } from '../lib/parse-memory';
import { defaultDurationForActivityMode } from './build_consumption_view';
import { enumerateCalendarDates } from './calendar_dates';
import { CollectedTimelineFact } from './timeline_reasoner_contract';
import { addHours, formatTimestamp, parseTimestampParts, formatDate } from '../lib/time-utils';

export async function collectActiveFacts(
  memoryGet: (calendarDate: string) => Promise<string>,
  nowIso: string,
  lookbackDays = 7
): Promise<CollectedTimelineFact[]> {
  const parts = parseTimestampParts(nowIso);
  if (!parts) return [];
  const lookbackStartParts = addHours(parts, -24 * lookbackDays);
  const calendarDates = enumerateCalendarDates(formatTimestamp(lookbackStartParts), nowIso);

  const activeFacts: CollectedTimelineFact[] = [];
  const anchorMs = new Date(nowIso).getTime();

  for (const calendarDate of calendarDates) {
    const content = await memoryGet(calendarDate);
    if (!content) continue;
    
    const parsedEpisodes = parseMemoryFile(content);
    for (const [index, episode] of parsedEpisodes.entries()) {
      const factMs = new Date(episode.timestamp.replace(' ', 'T')).getTime();
      if (isNaN(factMs)) continue;
      
      const elapsedMinutes = Math.max(0, Math.round((anchorMs - factMs) / 60_000));
      const duration = episode.estimatedDurationMinutes ?? defaultDurationForActivityMode(undefined);
      
      // We only care about facts that are still active relative to nowIso 
      if (elapsedMinutes >= 0 && elapsedMinutes < duration) {
        activeFacts.push({
          fact_id: `canon:${calendarDate}:${index}`,
          source_type: 'canon_daily_log',
          calendar_date: calendarDate,
          timestamp: episode.timestamp,
          location: episode.location,
          action: episode.action,
          emotion_tags: episode.emotionTags,
          appearance: episode.appearance,
          internal_monologue: episode.internalMonologue,
          parse_level: episode.parseLevel,
          confidence: episode.confidence,
          estimated_duration_minutes: duration,
          elapsed_minutes: elapsedMinutes,
          is_within_duration_window: true,
          event_id: episode.eventId,
          has_parent_event: Boolean(episode.parentEventTag),
          parent_event_tag: episode.parentEventTag,
          parent_event_phase: episode.parentEventPhase,
          parent_event_progress: episode.parentEventProgress,
        });
      }
    }
  }

  // Sort descending by timestamp so latest fact is first
  return activeFacts.sort((a, b) => new Date(b.timestamp.replace(' ', 'T')).getTime() - new Date(a.timestamp.replace(' ', 'T')).getTime());
}
