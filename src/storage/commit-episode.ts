import * as path from 'path';
import { assertCanonicalDailyLogPath } from './daily_log';
import { withFileLocks, FileLockError } from './lock';
import { WriteEpisodeInput, WriteResult, truncateEpisodeDuration } from './write-episode';
import { readOptionalFile } from './atomic-file';
import { parseMemoryFile } from '../lib/parse-memory';
import { halfHourTimelineBucket } from '../lib/fingerprint';

export async function commitEpisode(input: WriteEpisodeInput, options: {
  rootName?: string; rootPath?: string;
  exemptCurrentBucket?: boolean;
  writer: (input: WriteEpisodeInput) => Promise<WriteResult>;
  truncate?: { filePath: string; eventId: string; timestamp: string };
}): Promise<{ result: WriteResult; truncated: boolean }> {
  const target = options.truncate;
  try {
    const date = input.timestamp.slice(0, 10);
    assertCanonicalDailyLogPath(input.filePath, date, options.rootName || path.basename(path.dirname(input.filePath)), options.rootPath);
    if (target) assertCanonicalDailyLogPath(target.filePath, path.basename(target.filePath, '.md'), options.rootName || path.basename(path.dirname(input.filePath)), options.rootPath);
    return await withFileLocks([input.filePath, ...(target ? [target.filePath] : [])], async () => {
      const sameFile = target && path.resolve(target.filePath) === path.resolve(input.filePath);
      const bucketMates = options.exemptCurrentBucket ? parseMemoryFile(readOptionalFile(input.filePath) ?? '')
        .filter(ep => halfHourTimelineBucket(ep.timestamp) === halfHourTimelineBucket(input.timestamp))
        .map(ep => ep.eventId).filter((id): id is string => Boolean(id)) : [];
      const result = await options.writer({ ...input, sameBucketExemptEventIds: [...new Set([...(input.sameBucketExemptEventIds ?? []), ...bucketMates])], ...(sameFile ? { truncateEvent: target } : {}) });
      let truncated = Boolean(result.success && sameFile);
      if (result.success && target && !sameFile) {
        try {
          truncated = await truncateEpisodeDuration(target.filePath, target.eventId, target.timestamp, input.legacyLogTimezone);
        } catch (error: unknown) {
          return {
            truncated: false,
            result: {
              ...result,
              error_code: 'IO_ERROR',
              error: error instanceof Error ? error.message : String(error),
            },
          };
        }
      }
      return { result, truncated };
    });
  } catch (error: unknown) {
    return { truncated: false, result: { success: false, written_at: '', outcome: error instanceof FileLockError ? 'conflict' : 'failed', error_code: error instanceof FileLockError ? 'LOCK_EXISTS' : 'IO_ERROR', error: error instanceof Error ? error.message : String(error) } };
  }
}
