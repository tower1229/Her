import { ParsedEpisode, Episode } from './types';

export function parseMemoryFile(content: string): ParsedEpisode[] {
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
    const timestamp = timestampMatch[1].trim();

    // Extract other fields with permissive matching
    const locationMatch = part.match(/[-*]\s*Location:\s*([^\n]+)/i);
    const actionMatch = part.match(/[-*]\s*Action:\s*([^\n]+)/i);
    const emotionTagsMatch = part.match(/[-*]\s*Emotion_Tags:\s*\[([^\]]+)\]/i) 
                             || part.match(/[-*]\s*Emotion_Tags:\s*([^\n]+)/i);
    const appearanceMatch = part.match(/[-*]\s*Appearance:\s*([^\n]+)/i);
    const monologueMatch = part.match(/[-*]\s*Internal_Monologue:\s*([^\n]+)/i);

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
      confidence
    });
  }

  return episodes;
}

export function mapTimeOfDay(timestamp: string): string {
  const dateObj = new Date(timestamp);
  if (isNaN(dateObj.getTime())) return 'unknown';
  const hour = dateObj.getHours();
  if (hour >= 0 && hour <= 5) return 'night';
  if (hour >= 6 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 17) return 'afternoon';
  return 'evening';
}

export function mapLocationKind(location: string): string {
  const lowerLoc = location.toLowerCase();
  if (lowerLoc.includes('home') || lowerLoc.includes('家') || lowerLoc.includes('卧室') || lowerLoc.includes('书房')) return 'home';
  if (lowerLoc.includes('cafe') || lowerLoc.includes('咖啡')) return 'cafe';
  if (lowerLoc.includes('work') || lowerLoc.includes('office') || lowerLoc.includes('公司') || lowerLoc.includes('办公')) return 'work';
  if (lowerLoc.includes('transit') || lowerLoc.includes('车') || lowerLoc.includes('地铁') || lowerLoc.includes('bus') || lowerLoc.includes('car')) return 'transit';
  if (lowerLoc.includes('outdoor') || lowerLoc.includes('公园') || lowerLoc.includes('外') || lowerLoc.includes('park') || lowerLoc.includes('street')) return 'outdoor';
  return 'other';
}

export function mapToEpisode(
  parsed: ParsedEpisode, 
  worldHooks: { weekday: boolean; holiday_key: string | null },
  idempotencyKey: string,
  writer = 'timeline-skill'
): Episode {
  const timeOfDay = mapTimeOfDay(parsed.timestamp);
  
  // End time defaults to start + 1 hour as per spec (v1 default)
  const startDate = new Date(parsed.timestamp);
  let endStr = parsed.timestamp;
  if (!isNaN(startDate.getTime())) {
    startDate.setHours(startDate.getHours() + 1);
    const offsetMatcher = parsed.timestamp.match(/(Z|[+-]\d{2}:\d{2})$/);
    const tzString = offsetMatcher ? offsetMatcher[1] : '';
    // Generate ISO string locally matching original timezone format
    const yyyy = startDate.getFullYear();
    const mm = String(startDate.getMonth() + 1).padStart(2, '0');
    const dd = String(startDate.getDate()).padStart(2, '0');
    const hh = String(startDate.getHours()).padStart(2, '0');
    const mins = String(startDate.getMinutes()).padStart(2, '0');
    const secs = String(startDate.getSeconds()).padStart(2, '0');
    endStr = `${yyyy}-${mm}-${dd}T${hh}:${mins}:${secs}${tzString}`;
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
      summary: parsed.naturalText || `${parsed.action}在${parsed.location}`,
      detail: parsed.internalMonologue
    },
    state_snapshot: {
      scene: {
        location_kind: mapLocationKind(parsed.location),
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
