import { effectiveTimestamp } from './timeline-time';
import { ParsedEpisode, Episode } from './types';
import { addHours, formatTimestamp, parseTimestampParts } from './time-utils';

export function parseMemoryFile(content: string, diagnostic?: (message: string) => void): ParsedEpisode[] {
  const episodes: ParsedEpisode[] = [];
  
  if (!content || !content.trim()) {
    return episodes;
  }

  // Split into paragraphs by '### [' to handle sections
  const parts = content.split(/^### \[/m);
  
  for (const part of parts) {
    if (!part.trim()) continue;
    
    // We already split by '### [', so let's put it back to parse cleanly if needed,
    // actually we just extract fields directly.
    
    // Extract timestamp
    const timestampMatch = part.match(/[-*]\s*Timestamp:\s*([^\n]+)/i);
    if (!timestampMatch) {
      continue; // Skip if no timestamp
    }
    const timestamp = effectiveTimestamp(timestampMatch[1].trim(), part, diagnostic);

    // Extract other fields with permissive matching
    const locationMatch = part.match(/[-*]\s*Location:\s*([^\n]+)/i);
    const actionMatch = part.match(/[-*]\s*Action:\s*([^\n]+)/i);
    const emotionTagsMatch = part.match(/[-*]\s*Emotion_Tags:\s*\[([^\]]+)\]/i) 
                             || part.match(/[-*]\s*Emotion_Tags:\s*([^\n]+)/i);
    const appearanceMatch = part.match(/[-*]\s*Appearance:\s*([^\n]+)/i);
    const monologueMatch = part.match(/[-*]\s*Internal_Monologue:\s*([^\n]+)/i);
    const durationMatch = part.match(/[-*]\s*Estimated_Duration:\s*(\d+)/i);
    const eventIdMatch = part.match(/[-*]\s*Event_Id:\s*([^\n]+)/i);
    const parentEventMatch = part.match(/[-*]\s*Parent_Event:\s*([^\n]+)/i);
    const parentPhaseMatch = part.match(/[-*]\s*Parent_Event_Phase:\s*([^\n]+)/i);
    const parentProgressMatch = part.match(/[-*]\s*Parent_Event_Progress:\s*([\d.]+)/i);

    // Extract natural text: everything after the last key-value field
    const lastKeyValIndex = part.lastIndexOf('-');
    let naturalText = undefined;
    if (lastKeyValIndex !== -1) {
      const remainingBytes = part.substring(lastKeyValIndex);
      const afterFieldMatch = remainingBytes.match(/\n\s*([^- \n][\s\S]*)/);
      if (afterFieldMatch && afterFieldMatch[1].trim()) {
         naturalText = afterFieldMatch[1].trim();
      }
    }

    const location = locationMatch ? locationMatch[1].trim() : "unknown";
    const action = actionMatch ? actionMatch[1].trim() : "unknown";
    
    let emotionTags = ['neutral'];
    if (emotionTagsMatch) {
      emotionTags = emotionTagsMatch[1].split(',').map(tag => tag.replace(/[\[\]]/g, '').trim()).filter(Boolean);
      if (emotionTags.length === 0) emotionTags = ['neutral'];
    }

    const appearance = appearanceMatch ? appearanceMatch[1].trim() : "unknown";
    const internalMonologue = monologueMatch ? monologueMatch[1].trim() : undefined;
    const estimatedDurationMinutes = durationMatch ? Number(durationMatch[1]) : undefined;
    const eventId = eventIdMatch ? eventIdMatch[1].trim() : undefined;
    const parentEventTag = parentEventMatch ? parentEventMatch[1].trim() : undefined;
    const parentEventPhase = parentPhaseMatch ? parentPhaseMatch[1].trim() : undefined;
    const parentEventProgress = parentProgressMatch ? Number(parentProgressMatch[1]) : undefined;

    // Check Level A vs Level B
    let parseLevel: 'A' | 'B' = 'A';
    let confidence = 1.0;

    if (!appearanceMatch || appearance === 'unknown') {
      parseLevel = 'B';
      confidence = 0.6;
    }
    if (!emotionTagsMatch || emotionTags[0] === 'neutral') {
      parseLevel = 'B';
      confidence = Math.min(confidence, 0.5);
    }

    episodes.push({
      timestamp,
      location,
      action,
      emotionTags,
      appearance,
      internalMonologue,
      naturalText,
      parseLevel,
      confidence,
      estimatedDurationMinutes,
      eventId,
      parentEventTag,
      parentEventPhase,
      parentEventProgress,
    });
  }

  return episodes;
}

export function mapTimeOfDay(timestamp: string): string {
  const parts = parseTimestampParts(timestamp);
  if (!parts) return 'unknown';
  const hour = parts.hour;
  if (hour >= 0 && hour <= 5) return 'night';
  if (hour >= 6 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 17) return 'afternoon';
  return 'evening';
}

function buildNarrativeSummary(parsed: ParsedEpisode): string {
  const action = parsed.action && parsed.action !== 'unknown' ? parsed.action : '记录一个时间片段';
  const location = parsed.location && parsed.location !== 'unknown' ? `在${parsed.location}` : '';
  return `${location}${action}`;
}

export function mapToEpisode(
  parsed: ParsedEpisode, 
  worldHooks: { weekday: boolean; holiday_key: string | null },
  idempotencyKey: string,
  writer = 'stella-timeline-plugin'
): Episode {
  const timeOfDay = mapTimeOfDay(parsed.timestamp);
  
  // End time defaults to start + 1 hour as per spec (v1 default)
  let endStr = parsed.timestamp;
  const parts = parseTimestampParts(parsed.timestamp);
  if (parts) {
    endStr = formatTimestamp(addHours(parts, 1));
  }

  return {
    // Generate a simple v4-like uuid or mock one since it's v1.
    // In a real env, crypto.randomUUID() could be used.
    episode_id: `sys-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    schema_version: "1.0",
    document_type: "timeline.episode",
    temporal: {
      start: parsed.timestamp,
      end: endStr,
      time_of_day: timeOfDay,
      granularity: "block"
    },
    narrative: {
      summary: buildNarrativeSummary(parsed),
      detail: parsed.internalMonologue
    },
    state_snapshot: {
      scene: {
        location_kind: 'literal',
        location_label: parsed.location,
        activity: parsed.action,
        time_of_day: timeOfDay
      },
      emotion: {
        primary: parsed.emotionTags[0] || "neutral",
        secondary: parsed.emotionTags.length > 1 ? parsed.emotionTags[1] : null,
        intensity: 0.0 // Placeholder for v1
      },
      appearance: {
        outfit_style: parsed.appearance,
        grooming: null,
        posture_energy: null
      }
    },
    world_hooks: worldHooks,
    provenance: {
      writer,
      written_at: new Date().toISOString(),
      idempotency_key: idempotencyKey,
      confidence: parsed.confidence
    }
  };
}
