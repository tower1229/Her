import { getHoliday } from '../lib/holidays';
import { checkReadOnlyHit, computeFingerprint } from '../lib/fingerprint';
import { mapToEpisode, parseMemoryFile } from '../lib/parse-memory';
import { dayOfWeek, formatDate, parseTimestampParts } from '../lib/time-utils';
import { CollectedSources } from './collect_sources';
import { ResolvedWindow } from './resolve_window';
import { TimelineResolveInput, TimelineResolveOutput } from '../tools/timeline_resolve';

export function buildReadOnlyResult(
  _input: TimelineResolveInput,
  window: ResolvedWindow,
  sources: CollectedSources,
): TimelineResolveOutput {
  const parsedEpisodes = parseMemoryFile(sources.memoryContent);
  const candidate = parsedEpisodes[0];

  if (!candidate) {
    return {
      ok: true,
      schema_version: '1.0',
      trace_id: '',
      resolution_summary: {
        mode: 'read_only_hit',
        writes_attempted: 0,
        writes_succeeded: 0,
        sources: sources.sourceOrder,
        confidence_min: 0,
        confidence_max: 0,
      },
      result: {
        schema_version: '1.0',
        document_type: 'timeline.window',
        anchor: { now: window.end, timezone: window.timezone },
        window: {
          calendar_date: window.calendar_date,
          preset: window.preset,
          start: window.start,
          end: window.end,
          idempotency_key: 'none',
        },
        resolution: {
          mode: 'read_only_hit',
          notes: 'no parsed episodes found; returning empty window',
        },
        episodes: [],
      },
      notes: ['No parsed episodes found in memory_get output.'],
    };
  }

  const timestampParts = parseTimestampParts(candidate.timestamp);
  const date = timestampParts ? formatDate(timestampParts) : window.calendar_date;
  const fp = computeFingerprint(date, candidate.location, candidate.action, candidate.timestamp);
  const hit = checkReadOnlyHit(parsedEpisodes, {
    date,
    location: candidate.location,
    action: candidate.action,
    timestamp: candidate.timestamp,
  });

  const worldHooks = timestampParts
    ? {
        weekday: ![0, 6].includes(dayOfWeek(timestampParts)),
        holiday_key: getHoliday(date),
      }
    : { weekday: true, holiday_key: null };

  const episode = mapToEpisode(candidate, worldHooks, fp);

  return {
    ok: true,
    schema_version: '1.0',
    trace_id: '',
    resolution_summary: {
      mode: hit.hit ? 'read_only_hit' : 'generated_new',
      writes_attempted: 0,
      writes_succeeded: 0,
      sources: sources.sourceOrder,
      confidence_min: candidate.confidence,
      confidence_max: candidate.confidence,
    },
    result: {
      schema_version: '1.0',
      document_type: 'timeline.window',
      anchor: { now: window.end, timezone: window.timezone },
      window: {
        calendar_date: window.calendar_date,
        preset: window.preset,
        start: window.start,
        end: window.end,
        idempotency_key: fp,
      },
      resolution: {
        mode: hit.hit ? 'read_only_hit' : 'generated_new',
        notes: hit.hit ? 'matched parsed memory entry' : 'no fingerprint match found; generation not yet implemented',
      },
      episodes: [episode],
    },
    notes: hit.hit
      ? ['Read-only hit returned from parsed daily log.']
      : ['Generation path not implemented yet; returning first parsed episode for inspection.'],
  };
}
