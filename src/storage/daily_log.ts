import * as path from 'path';

const DAILY_LOG_RE = /^\d{4}-\d{2}-\d{2}\.md$/;

export function assertCanonicalDailyLogPath(filePath: string, calendarDate: string): string {
  const normalized = path.normalize(filePath);
  const base = path.basename(normalized);
  const parent = path.basename(path.dirname(normalized));
  const expectedBase = `${calendarDate}.md`;

  if (!DAILY_LOG_RE.test(base)) {
    throw new Error(`Non-canonical daily log filename: ${base}`);
  }
  if (base !== expectedBase) {
    throw new Error(`Daily log filename does not match calendar date: expected ${expectedBase}, got ${base}`);
  }
  if (parent !== 'memory') {
    throw new Error(`Canonical daily logs must live under a memory/ directory: ${normalized}`);
  }

  return normalized;
}
