import {
  TIMELINE_HOOK_NAMES,
  TIMELINE_PLUGIN_DESCRIPTION,
  TIMELINE_PLUGIN_ID,
  TIMELINE_PLUGIN_NAME,
  TIMELINE_PLUGIN_VERSION,
  TIMELINE_SKILL_PATHS,
  TIMELINE_TOOL_NAMES,
} from '../plugin_metadata';
import { getTimelineRuntimeStatus } from '../storage/runtime_status';

export interface TimelineStatusInput {
  include_last_run?: boolean;
}

export interface TimelineStatusOutput {
  ok: true;
  schema_version: '1.0';
  plugin: {
    id: string;
    name: string;
    version: string;
    description: string;
    skills: readonly string[];
  };
  registration: {
    tools: readonly string[];
    hooks: readonly string[];
  };
  runtime: {
    last_run: ReturnType<typeof getTimelineRuntimeStatus>;
  };
  notes: string[];
}

export async function timelineStatus(input: TimelineStatusInput = {}): Promise<TimelineStatusOutput> {
  const includeLastRun = input.include_last_run !== false;
  const lastRun = includeLastRun ? getTimelineRuntimeStatus() : null;

  return {
    ok: true,
    schema_version: '1.0',
    plugin: {
      id: TIMELINE_PLUGIN_ID,
      name: TIMELINE_PLUGIN_NAME,
      version: TIMELINE_PLUGIN_VERSION,
      description: TIMELINE_PLUGIN_DESCRIPTION,
      skills: TIMELINE_SKILL_PATHS,
    },
    registration: {
      tools: TIMELINE_TOOL_NAMES,
      hooks: TIMELINE_HOOK_NAMES,
    },
    runtime: {
      last_run: lastRun,
    },
    notes: lastRun
      ? ['Returning current plugin registration metadata and the last timeline runtime snapshot.']
      : ['No timeline tool invocation has been recorded yet in this process.'],
  };
}

export const timelineStatusToolSpec = {
  name: 'timeline_status',
  description: 'Diagnostic tool for plugin registration metadata and the last timeline runtime snapshot.',
  inputSchema: {
    type: 'object',
    properties: {
      include_last_run: { type: 'boolean' },
    },
    additionalProperties: false,
  },
  run: timelineStatus,
};
