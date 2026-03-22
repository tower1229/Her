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

export function readRecentTraceLogs(logPath: string, n = 20): TraceLogRecord[] {
  try {
    if (!fs.existsSync(logPath)) return [];
    const content = fs.readFileSync(logPath, 'utf8').trim();
    if (!content) return [];
    return content
      .split('\n')
      .slice(-n)
      .map((line) => {
        try {
          return JSON.parse(line) as TraceLogRecord;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as TraceLogRecord[];
  } catch {
    return [];
  }
}
