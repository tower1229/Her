import { parseMemoryFile } from '../lib/parse-memory';
import { timestampMillis } from '../lib/timeline-time';

export function dailySections(text: string) {
  const headings = [...text.matchAll(/^(?:\uFEFF)?#{1,6}[^\S\r\n]+[^\r\n]*(?:\r?\n|$)/gm)];
  return headings.map((m, i) => {
    const start = m.index! + (m[0].startsWith('\uFEFF') ? 1 : 0);
    const end = headings[i + 1]?.index ?? text.length;
    const raw = text.slice(start, end);
    const episode = /^### \[/.test(raw) ? parseMemoryFile(raw)[0] : undefined;
    return { start, end, raw, episode };
  });
}

export function insertEpisode(text: string, block: string, timestamp: string, zone?: string): string {
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const target = timestampMillis(timestamp, zone);
  const next = dailySections(text).find(s => s.episode && timestampMillis(s.episode.timestamp, zone) > target);
  const at = next?.start ?? text.length;
  const prefix = text.slice(0, at);
  const separator = prefix && !prefix.endsWith(newline + newline) ? (prefix.endsWith(newline) ? newline : newline + newline) : '';
  return prefix + separator + block.replace(/\r?\n/g, newline) + text.slice(at);
}

export function truncateDocument(text: string, eventId: string, interruption: string, zone?: string): string | null {
  const matches = dailySections(text).filter(s => s.episode?.eventId === eventId);
  if (matches.length !== 1) return null;
  const section = matches[0];
  const ep = section.episode!;
  if (!ep.estimatedDurationMinutes) return null;
  const elapsed = timestampMillis(interruption, zone) - timestampMillis(ep.timestamp, zone);
  if (!Number.isFinite(elapsed) || elapsed < 0) return null;
  const minutes = Math.round(elapsed / 60000);
  const duration = Math.max(1, Math.min(minutes, ep.estimatedDurationMinutes));
  const fields = [...section.raw.matchAll(/^([-*]\s*Estimated_Duration:\s*)(\d+)([^\r\n]*)/gm)];
  if (fields.length !== 1) return null;
  const field = fields[0];
  const start = section.start + field.index! + field[1].length;
  return text.slice(0, start) + duration + text.slice(start + field[2].length);
}
