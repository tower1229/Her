import { classifyWriteFailure } from './execute_write';

describe('classifyWriteFailure', () => {
  it('maps conflict write error', () => {
    const result = classifyWriteFailure({
      success: false,
      written_at: '',
      outcome: 'conflict',
      error_code: 'CONFLICT_EXISTS',
      error: 'conflict',
    });
    expect(result.mode).toBe('write_conflict');
    expect(result.errorCode).toBe('WRITE_CONFLICT');
    expect(result.guard).toBe('conflict');
  });

  it('maps canonical path error to blocked', () => {
    const result = classifyWriteFailure({
      success: false,
      written_at: '',
      outcome: 'failed',
      error: 'Canonical daily logs must live under memory/',
    });
    expect(result.mode).toBe('write_blocked');
    expect(result.errorCode).toBe('WRITE_BLOCKED');
    expect(result.guard).toBe('canonical_path');
  });

  it('maps unclassified write failures to write_dependency guard', () => {
    const result = classifyWriteFailure({
      success: false,
      written_at: '',
      outcome: 'failed',
      error: 'disk full',
    });
    expect(result.mode).toBe('write_failed');
    expect(result.errorCode).toBe('WRITE_FAILED');
    expect(result.guard).toBe('write_dependency');
  });
});

