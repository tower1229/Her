import * as fs from 'fs';
import * as path from 'path';
import { parseMemoryFile } from '../lib/parse-memory';
import { readRecentLogs } from '../storage/run-log';
import { readRecentTraceLogs } from '../storage/trace_log';
import { assertCanonicalDailyLogPath } from '../storage/daily_log';

export interface TimelineRepairInput {
  calendar_date?: string;
  file_path?: string;
  include_recent_runs?: boolean;
  include_recent_traces?: boolean;
  trace_log_path?: string;
}

export interface TimelineRepairIssue {
  kind:
    | 'missing_file'
    | 'non_canonical_path'
    | 'missing_timestamp'
    | 'missing_location'
    | 'missing_action'
    | 'missing_emotion_tags'
    | 'missing_appearance'
    | 'unparseable_section';
  message: string;
  section_index?: number;
}

export interface TimelineRepairOutput {
  ok: true;
  schema_version: '1.0';
  target: {
    calendar_date?: string;
    file_path: string;
    exists: boolean;
    canonical: boolean;
  };
  summary: {
    section_count: number;
    parsed_episode_count: number;
    issue_count: number;
    repairable: boolean;
  };
  diagnostics: {
    issues: TimelineRepairIssue[];
    recent_runs?: unknown[];
    recent_traces?: unknown[];
  };
  notes: string[];
}

function deriveFilePath(input: TimelineRepairInput): { calendarDate?: string; filePath: string } {
  if (input.file_path) {
    const filePath = path.normalize(input.file_path);
    const calendarDate = path.basename(filePath, '.md');
    return { calendarDate, filePath };
  }
  if (input.calendar_date) {
    return {
      calendarDate: input.calendar_date,
      filePath: path.join('memory', `${input.calendar_date}.md`),
    };
  }
  throw new Error('timeline_repair requires calendar_date or file_path');
}

function inspectSections(raw: string): TimelineRepairIssue[] {
  const issues: TimelineRepairIssue[] = [];
  const sections = raw.split(/^### \[/m).filter((section) => section.trim());

  sections.forEach((section, index) => {
    if (!/[-*]\s*Timestamp:/i.test(section)) {
      issues.push({ kind: 'missing_timestamp', message: 'Section is missing Timestamp field.', section_index: index + 1 });
      return;
    }
    if (!/[-*]\s*Location:/i.test(section)) {
      issues.push({ kind: 'missing_location', message: 'Section is missing Location field.', section_index: index + 1 });
    }
    if (!/[-*]\s*Action:/i.test(section)) {
      issues.push({ kind: 'missing_action', message: 'Section is missing Action field.', section_index: index + 1 });
    }
    if (!/[-*]\s*Emotion_Tags:/i.test(section)) {
      issues.push({ kind: 'missing_emotion_tags', message: 'Section is missing Emotion_Tags field.', section_index: index + 1 });
    }
    if (!/[-*]\s*Appearance:/i.test(section)) {
      issues.push({ kind: 'missing_appearance', message: 'Section is missing Appearance field.', section_index: index + 1 });
    }
  });

  return issues;
}

export async function timelineRepair(input: TimelineRepairInput): Promise<TimelineRepairOutput> {
  const { calendarDate, filePath } = deriveFilePath(input);
  let canonical = true;
  const issues: TimelineRepairIssue[] = [];

  if (calendarDate) {
    try {
      assertCanonicalDailyLogPath(filePath, calendarDate);
    } catch (error: any) {
      canonical = false;
      issues.push({ kind: 'non_canonical_path', message: error.message });
    }
  }

  if (!fs.existsSync(filePath)) {
    issues.push({ kind: 'missing_file', message: `Daily log does not exist: ${filePath}` });
    return {
      ok: true,
      schema_version: '1.0',
      target: {
        calendar_date: calendarDate,
        file_path: filePath,
        exists: false,
        canonical,
      },
      summary: {
        section_count: 0,
        parsed_episode_count: 0,
        issue_count: issues.length,
        repairable: true,
      },
      diagnostics: {
        issues,
      },
      notes: ['No file was found, so only path/canonical diagnostics were performed.'],
    };
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const sectionIssues = inspectSections(raw);
  issues.push(...sectionIssues);
  const parsedEpisodes = parseMemoryFile(raw);
  const sections = raw.split(/^### \[/m).filter((section) => section.trim());
  if (sections.length > 0 && parsedEpisodes.length === 0) {
    issues.push({ kind: 'unparseable_section', message: 'File contains sections but none parsed into episodes.' });
  }

  const diagnostics: TimelineRepairOutput['diagnostics'] = {
    issues,
  };

  if (input.include_recent_runs !== false) {
    diagnostics.recent_runs = readRecentLogs(path.join(path.dirname(filePath), '.timeline-run.log'));
  }

  if (input.include_recent_traces) {
    diagnostics.recent_traces = readRecentTraceLogs(input.trace_log_path || path.join(path.dirname(filePath), '.timeline-trace.log'));
  }

  return {
    ok: true,
    schema_version: '1.0',
    target: {
      calendar_date: calendarDate,
      file_path: filePath,
      exists: true,
      canonical,
    },
    summary: {
      section_count: sections.length,
      parsed_episode_count: parsedEpisodes.length,
      issue_count: issues.length,
      repairable: issues.every((issue) => issue.kind !== 'non_canonical_path'),
    },
    diagnostics,
    notes: issues.length
      ? ['timeline_repair reports diagnostics only; it does not rewrite canon automatically.']
      : ['No structural issues were detected in the target daily log.'],
  };
}

export const timelineRepairToolSpec = {
  name: 'timeline_repair',
  description: 'Diagnostic tool for malformed daily logs, canonical path checks, and recent timeline runtime logs.',
  inputSchema: {
    type: 'object',
    properties: {
      calendar_date: { type: 'string' },
      file_path: { type: 'string' },
      include_recent_runs: { type: 'boolean' },
      include_recent_traces: { type: 'boolean' },
      trace_log_path: { type: 'string' },
    },
    additionalProperties: false,
  },
  run: timelineRepair,
};
