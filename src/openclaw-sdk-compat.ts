import { auditTraceHook } from './hooks/audit_trace';
import { preCompactionFlushHook } from './hooks/pre_compaction_flush';
import { sessionSnapshotHook } from './hooks/session_snapshot';
import { timelineResolveToolSpec } from './tools/timeline_resolve';
import { timelineRepairToolSpec } from './tools/timeline_repair';
import { timelineStatusToolSpec } from './tools/timeline_status';

export interface HookSpec {
  name: string;
  description: string;
  event: string;
}

export interface PluginToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  data?: unknown;
}

export interface PluginToolRegistration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (callId: string, params: unknown) => Promise<PluginToolResult>;
  optional?: boolean;
}

export interface PluginHookRegistration extends HookSpec {}

export interface PluginEntryApi {
  registerTool: (tool: PluginToolRegistration, options?: { optional?: boolean }) => void;
  registerHook: (hook: PluginHookRegistration) => void;
}

export interface PluginEntryDefinition {
  id: string;
  name: string;
  description: string;
  register: (api: PluginEntryApi) => void;
}

export interface RegisteredPluginShape {
  id: string;
  name: string;
  description: string;
  tools: PluginToolRegistration[];
  hooks: PluginHookRegistration[];
}

export function definePluginEntry(definition: PluginEntryDefinition): PluginEntryDefinition {
  return definition;
}

export function materializePlugin(definition: PluginEntryDefinition): RegisteredPluginShape {
  const tools: PluginToolRegistration[] = [];
  const hooks: PluginHookRegistration[] = [];

  definition.register({
    registerTool(tool, options) {
      tools.push({ ...tool, optional: options?.optional });
    },
    registerHook(hook) {
      hooks.push(hook);
    },
  });

  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    tools,
    hooks,
  };
}

function wrapToolData(data: unknown): PluginToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    data,
  };
}

export function makeTimelineToolRegistration(): PluginToolRegistration {
  return {
    name: timelineResolveToolSpec.name,
    description: timelineResolveToolSpec.description,
    parameters: timelineResolveToolSpec.inputSchema,
    async execute(_callId, params) {
      return wrapToolData(await timelineResolveToolSpec.run(params as never));
    },
  };
}

export function makeTimelineStatusToolRegistration(): PluginToolRegistration {
  return {
    name: timelineStatusToolSpec.name,
    description: timelineStatusToolSpec.description,
    parameters: timelineStatusToolSpec.inputSchema,
    async execute(_callId, params) {
      return wrapToolData(await timelineStatusToolSpec.run(params as never));
    },
  };
}

export function makeTimelineRepairToolRegistration(): PluginToolRegistration {
  return {
    name: timelineRepairToolSpec.name,
    description: timelineRepairToolSpec.description,
    parameters: timelineRepairToolSpec.inputSchema,
    async execute(_callId, params) {
      return wrapToolData(await timelineRepairToolSpec.run(params as never));
    },
  };
}

export function getTimelineHookRegistrations(): PluginHookRegistration[] {
  return [
    { ...preCompactionFlushHook },
    { ...sessionSnapshotHook },
    { ...auditTraceHook },
  ];
}
