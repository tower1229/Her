import { getHoliday } from '../lib/holidays';
import { checkReadOnlyHit, computeFingerprint } from '../lib/fingerprint';
import { mapToEpisode, parseMemoryFile } from '../lib/parse-memory';
import { dayOfWeek, formatDate, parseTimestampParts } from '../lib/time-utils';
import { CollectedSources } from './collect_sources';
import { ResolvedWindow } from './resolve_window';
import { selectEpisodeForWindow } from './select_episode';
import { TimelineResolveInput, TimelineResolveOutput } from '../tools/timeline_resolve';

export function buildReadOnlyResult(
  input: TimelineResolveInput,
  window: ResolvedWindow,
  sources: CollectedSources,
): TimelineResolveOutput {
  const parsedEpisodes = parseMemoryFile(sources.memoryContent);
  const selection = selectEpisodeForWindow(parsedEpisodes, window, input);
  const candidate = selection.episode;

  if (!candidate) {
    return {
      ok: true,
      schema_version: '1.0',
      trace_id: '',
      resolution_summary: {
        mode: 'empty_window',
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
          preset: window.legacy_preset,
          semantic_target: window.semantic_target,
          collection_scope: window.collection_scope,
          start: window.start,
          end: window.end,
          idempotency_key: 'none',
        },
        resolution: {
          mode: 'empty_window',
          notes: selection.reason,
        },
        episodes: [],
      },
      notes: [selection.reason],
    };
  }

  const timestampParts = parseTimestampParts(candidate.timestamp);
  const date = timestampParts ? formatDate(timestampParts) : window.calendar_date;
  const fp = computeFingerprint(date, candidate.location, candidate.action, candidate.timestamp);
  const hit = checkReadOnlyHit([candidate], {
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
      mode: 'read_only_hit',
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
        preset: window.legacy_preset,
        semantic_target: window.semantic_target,
        collection_scope: window.collection_scope,
        start: window.start,
        end: window.end,
        idempotency_key: fp,
      },
      resolution: {
        mode: 'read_only_hit',
        notes: selection.reason,
      },
      episodes: [episode],
    },
    notes: [selection.reason],
  };
}
