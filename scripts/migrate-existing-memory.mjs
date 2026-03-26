import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = { root: 'memory', apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--apply') {
      args.apply = true;
      continue;
    }
    if (token === '--root') {
      args.root = argv[i + 1] || args.root;
      i += 1;
    }
  }
  return args;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseMemoryFile(content) {
  const episodes = [];
  if (!content || !content.trim()) return episodes;

  const parts = content.split(/^### \[/m);
  for (const part of parts) {
    if (!part.trim()) continue;
    const timestampMatch = part.match(/[-*]\s*Timestamp:\s*([^\n]+)/i);
    if (!timestampMatch) continue;

    const locationMatch = part.match(/[-*]\s*Location:\s*([^\n]+)/i);
    const actionMatch = part.match(/[-*]\s*Action:\s*([^\n]+)/i);
    const emotionTagsMatch = part.match(/[-*]\s*Emotion_Tags:\s*\[([^\]]+)\]/i)
      || part.match(/[-*]\s*Emotion_Tags:\s*([^\n]+)/i);
    const appearanceMatch = part.match(/[-*]\s*Appearance:\s*([^\n]+)/i);
    const monologueMatch = part.match(/[-*]\s*Internal_Monologue:\s*([^\n]+)/i);

    const emotionTags = emotionTagsMatch
      ? emotionTagsMatch[1].split(',').map((tag) => tag.replace(/[\[\]]/g, '').trim()).filter(Boolean)
      : ['neutral'];

    episodes.push({
      timestamp: timestampMatch[1].trim(),
      location: locationMatch ? locationMatch[1].trim() : 'unknown',
      action: actionMatch ? actionMatch[1].trim() : 'unknown',
      emotionTags: emotionTags.length ? emotionTags : ['neutral'],
      appearance: appearanceMatch ? appearanceMatch[1].trim() : 'unknown',
      internalMonologue: monologueMatch ? monologueMatch[1].trim() : '',
    });
  }

  return episodes;
}

function isSafelyStructured(content) {
  const parts = content.split(/^### \[/m).filter((part) => part.trim());
  if (parts.length === 0) return false;
  return parts.every((part) => /[-*]\s*Timestamp:\s*([^\n]+)/i.test(part));
}

function formatHeading(action, timestamp) {
  const timeMatch = timestamp.match(/(\d{2}:\d{2}:\d{2})/);
  const time = timeMatch ? timeMatch[1] : '00:00:00';
  return `### [${time}]`;
}

function formatEpisode(episode) {
  const lines = [
    formatHeading(episode.action, episode.timestamp),
    '',
    `- Timestamp: ${episode.timestamp.replace('T', ' ').replace(/([+-]\d{2}:\d{2}|Z)$/, '')}`,
    `- Location: ${episode.location}`,
    `- Action: ${episode.action}`,
    `- Emotion_Tags: [${episode.emotionTags.join(', ')}]`,
    `- Appearance: ${episode.appearance}`,
  ];
  if (episode.internalMonologue) {
    lines.push(`- Internal_Monologue: ${episode.internalMonologue}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function collectDailyFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  return fs.readdirSync(rootDir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
    .map((name) => path.join(rootDir, name))
    .sort();
}

function ensureBackup(filePath, content) {
  const backupPath = `${filePath}.bak`;
  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, content, 'utf8');
  }
}

function migrateFile(filePath, apply) {
  const original = fs.readFileSync(filePath, 'utf8');
  if (!original.trim()) {
    return { file: filePath, status: 'skipped_empty' };
  }
  if (!isSafelyStructured(original)) {
    return { file: filePath, status: 'skipped_unstructured' };
  }

  const episodes = parseMemoryFile(original);
  if (episodes.length === 0) {
    return { file: filePath, status: 'skipped_unstructured' };
  }

  const normalized = episodes.map((episode) => formatEpisode(episode)).join('');
  if (normalized === original) {
    return { file: filePath, status: 'unchanged', episodes: episodes.length };
  }

  if (apply) {
    ensureBackup(filePath, original);
    fs.writeFileSync(filePath, normalized, 'utf8');
  }

  return {
    file: filePath,
    status: apply ? 'migrated' : 'would_migrate',
    episodes: episodes.length,
    backup: apply ? `${filePath}.bak` : undefined,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = path.resolve(process.cwd(), args.root);
  const files = collectDailyFiles(rootDir);
  const results = files.map((filePath) => migrateFile(filePath, args.apply));
  const summary = {
    root: rootDir,
    apply: args.apply,
    scanned: files.length,
    migrated: results.filter((item) => item.status === 'migrated').length,
    would_migrate: results.filter((item) => item.status === 'would_migrate').length,
    unchanged: results.filter((item) => item.status === 'unchanged').length,
    skipped_unstructured: results.filter((item) => item.status === 'skipped_unstructured').length,
    skipped_empty: results.filter((item) => item.status === 'skipped_empty').length,
    results,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main();
