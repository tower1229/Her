import * as path from 'path';

const DAILY_LOG_RE = /^\d{4}-\d{2}-\d{2}\.md$/;

function toCanonicalPosixPath(filePath: string): string {
  return path.posix.normalize(filePath.replace(/\\/g, '/'));
}

export function assertCanonicalDailyLogPath(
  filePath: string,
  calendarDate: string,
  canonicalRootName = 'memory',
): string {
  const normalized = toCanonicalPosixPath(filePath);
  const base = path.posix.basename(normalized);
  const parent = path.posix.basename(path.posix.dirname(normalized));
  const expectedBase = `${calendarDate}.md`;

  if (!DAILY_LOG_RE.test(base)) {
    throw new Error(`Non-canonical daily log filename: ${base}`);
  }
  if (base !== expectedBase) {
    throw new Error(`Daily log filename does not match calendar date: expected ${expectedBase}, got ${base}`);
  }
  if (parent !== canonicalRootName) {
    const directoryLabel = canonicalRootName === 'memory'
      ? 'a memory/'
      : `the configured ${canonicalRootName}/`;
    throw new Error(`Canonical daily logs must live under ${directoryLabel} directory: ${normalized}`);
  }

  return normalized;
}
