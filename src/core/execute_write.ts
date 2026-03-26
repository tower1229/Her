import { materializeGeneratedCandidate } from './materialize_generated_candidate';
import { CollectedSources } from './collect_sources';
import { ResolvedWindow } from './resolve_window';
import { TimelineCollectorOutput, TimelineGeneratedDraft } from './timeline_reasoner_contract';
import { assertCanonicalDailyLogPath } from '../storage/daily_log';
import { FileLockError, withFileLock } from '../storage/lock';
import { WriteResult } from '../storage/write-episode';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface ExecuteWriteDeps {
  memoryFilePath?: (calendarDate: string) => string;
  canonicalRootName?: string;
  writeEpisode?: (input: {
    timestamp: string;
    location: string;
    action: string;
    emotionTags: string[];
    appearance: string;
    internalMonologue?: string;
    filePath: string;
    confidence?: number;
  }) => Promise<WriteResult>;
}

export interface ExecuteWriteResult {
  generated: ReturnType<typeof materializeGeneratedCandidate>;
  generatedCalendarDate: string;
  filePath: string;
  normalizedWriteResult: WriteResult;
  writeGuard: 'canonical_path' | 'lock' | 'conflict' | 'write_dependency';
}

export function classifyWriteFailure(writeResult: WriteResult): {
  mode: 'write_blocked' | 'write_conflict' | 'write_failed';
  errorCode: 'WRITE_BLOCKED' | 'WRITE_CONFLICT' | 'WRITE_FAILED';
  guard: 'canonical_path' | 'lock' | 'conflict' | 'write_dependency';
  recoveryHint?: string;
} {
  if (writeResult.error_code === 'CONFLICT_EXISTS') {
    return {
      mode: 'write_conflict',
      errorCode: 'WRITE_CONFLICT',
      guard: 'conflict',
      recoveryHint: writeResult.recovery_hint,
    };
  }
  if (writeResult.error_code === 'LOCK_EXISTS') {
    return {
      mode: 'write_conflict',
      errorCode: 'WRITE_CONFLICT',
      guard: 'lock',
      recoveryHint: writeResult.recovery_hint ?? 'Retry once the current timeline writer releases the file lock.',
    };
  }
  if (writeResult.error === 'write dependency missing') {
    return {
      mode: 'write_blocked',
      errorCode: 'WRITE_BLOCKED',
      guard: 'write_dependency',
      recoveryHint: 'Configure the timeline writer dependencies before allowing generated writes.',
    };
  }
  if ((writeResult.error || '').includes('Canonical daily logs')) {
    return {
      mode: 'write_blocked',
      errorCode: 'WRITE_BLOCKED',
      guard: 'canonical_path',
      recoveryHint: writeResult.recovery_hint ?? 'Use the canonical memory/YYYY-MM-DD.md path before allowing generated writes.',
    };
  }
  return {
    mode: 'write_failed',
    errorCode: 'WRITE_FAILED',
    guard: 'canonical_path',
    recoveryHint: writeResult.recovery_hint,
  };
}

export async function executeGeneratedWrite(input: {
  window: ResolvedWindow;
  sources: CollectedSources;
  collector: TimelineCollectorOutput;
  generatedFact: TimelineGeneratedDraft;
  generationReason: string;
  deps: ExecuteWriteDeps;
  calendarDateFromTimestamp: (timestamp: string) => string;
}): Promise<ExecuteWriteResult> {
  const generated = materializeGeneratedCandidate(
    input.window,
    input.sources,
    input.generatedFact,
    input.generationReason,
  );
  const generatedCalendarDate = input.calendarDateFromTimestamp(generated.parsed.timestamp);
  const requestedPath = input.deps.memoryFilePath
    ? input.deps.memoryFilePath(generatedCalendarDate)
    : `memory/${generatedCalendarDate}.md`;

  let filePath = requestedPath;
  let writeResult: WriteResult = {
    success: false,
    written_at: '',
    outcome: 'failed',
    error: 'write dependency missing',
    recovery_hint: 'Configure the timeline writer dependencies before allowing generated writes.',
  };
  let writeGuard: ExecuteWriteResult['writeGuard'] = 'canonical_path';

  try {
    filePath = assertCanonicalDailyLogPath(
      requestedPath,
      generatedCalendarDate,
      input.deps.canonicalRootName || 'memory',
    );
    writeResult = input.deps.writeEpisode
      ? await withFileLock(filePath, async () =>
          input.deps.writeEpisode!({
            timestamp: generated.parsed.timestamp,
            location: generated.parsed.location,
            action: generated.parsed.action,
            emotionTags: generated.parsed.emotionTags,
            appearance: generated.parsed.appearance,
            internalMonologue: generated.parsed.internalMonologue,
            filePath,
            confidence: generated.parsed.confidence,
          }),
        )
      : writeResult;
  } catch (error: unknown) {
    if (error instanceof FileLockError) {
      writeGuard = 'lock';
      writeResult = {
        success: false,
        written_at: '',
        outcome: 'conflict',
        error_code: 'LOCK_EXISTS',
        error: error.message,
        recovery_hint: 'Retry once the current timeline writer releases the file lock.',
      };
    } else {
      const message = errorMessage(error);
      writeResult = {
        success: false,
        written_at: '',
        outcome: 'failed',
        error_code: message.includes('Canonical daily logs') ? 'IO_ERROR' : undefined,
        error: message,
        recovery_hint: message.includes('Canonical daily logs')
          ? 'Use the canonical memory/YYYY-MM-DD.md path before allowing generated writes.'
          : undefined,
      };
    }
  }

  const normalizedWriteResult: WriteResult = writeResult.success && !writeResult.outcome
    ? { ...writeResult, outcome: 'appended' }
    : writeResult;
  const failedWrite = !normalizedWriteResult.success ? classifyWriteFailure(normalizedWriteResult) : null;
  if (failedWrite) {
    writeGuard = failedWrite.guard;
  }

  return {
    generated,
    generatedCalendarDate,
    filePath,
    normalizedWriteResult,
    writeGuard,
  };
}

