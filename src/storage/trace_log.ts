import * as fs from 'fs';
import * as path from 'path';

export interface TraceLogRecord {
  trace_id: string;
  event: string;
  ts: string;
  payload: Record<string, unknown>;
}

export function appendTraceLog(record: TraceLogRecord, logPath: string): void {
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`, 'utf8');
}
