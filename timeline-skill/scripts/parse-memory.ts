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
