import * as fs from 'fs';

export interface RunLogEntry {
  ts: string;
  date: string;
  mode: 'generated_new' | 'read_only_hit';
  episodes_written: number;
  window: string;
  confidence: number;
}

export function appendRunLog(entry: RunLogEntry, logPath: string): void {
  try {
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(logPath, line, 'utf8');
  } catch (error) {
    console.error('Failed to write run log:', error);
  }
}

export function readRecentLogs(logPath: string, n = 20): RunLogEntry[] {
  try {
    if (!fs.existsSync(logPath)) return [];
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.trim().split('\n');
    const recent = lines.slice(-n).map(line => {
      try { return JSON.parse(line); } catch (e) { return null; }
    }).filter(Boolean);
    return recent as RunLogEntry[];
  } catch (error) {
    return [];
  }
}
