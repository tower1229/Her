import * as fs from 'fs';
import * as path from 'path';
import { appendTraceLog, readRecentTraceLogs } from './trace_log';

describe('trace_log', () => {
  const logPath = path.join(process.cwd(), '.timeline-cache', 'trace-log-unit-test.log');

  beforeEach(() => {
    fs.rmSync(logPath, { force: true });
  });

  afterAll(() => {
    fs.rmSync(logPath, { force: true });
  });

  it('appends records and reads them back in order', () => {
    appendTraceLog(
      {
        trace_id: 'trace-1',
        event: 'timeline_resolve',
        ts: '2026-03-29T10:00:00.000Z',
        payload: { ok: true },
      },
      logPath,
    );
    appendTraceLog(
      {
        trace_id: 'trace-2',
        event: 'timeline_resolve',
        ts: '2026-03-29T10:01:00.000Z',
        payload: { ok: false },
      },
      logPath,
    );

    expect(readRecentTraceLogs(logPath)).toEqual([
      {
        trace_id: 'trace-1',
        event: 'timeline_resolve',
        ts: '2026-03-29T10:00:00.000Z',
        payload: { ok: true },
      },
      {
        trace_id: 'trace-2',
        event: 'timeline_resolve',
        ts: '2026-03-29T10:01:00.000Z',
        payload: { ok: false },
      },
    ]);
  });

  it('ignores malformed trailing lines while reading recent records', () => {
    appendTraceLog(
      {
        trace_id: 'trace-1',
        event: 'timeline_resolve',
        ts: '2026-03-29T10:00:00.000Z',
        payload: { ok: true },
      },
      logPath,
    );
    fs.appendFileSync(logPath, '{not-json}\n', 'utf8');

    expect(readRecentTraceLogs(logPath)).toEqual([
      {
        trace_id: 'trace-1',
        event: 'timeline_resolve',
        ts: '2026-03-29T10:00:00.000Z',
        payload: { ok: true },
      },
    ]);
  });
});
