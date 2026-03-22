import { PluginSpec } from './src/plugin-spec';
import { auditTraceHook } from './src/hooks/audit_trace';
import { preCompactionFlushHook } from './src/hooks/pre_compaction_flush';
import { sessionSnapshotHook } from './src/hooks/session_snapshot';
import { timelineResolveToolSpec } from './src/tools/timeline_resolve';

export const pluginSpec: PluginSpec = {
  id: 'timeline-plugin',
  description:
    'OpenClaw timeline v2 skeleton: bundled skill + canonical timeline_resolve tool + lifecycle hook placeholders.',
  skillsDir: 'skills',
  configSchema: {
    type: 'object',
    properties: {
      enableTrace: { type: 'boolean', default: true },
      traceLogPath: { type: 'string' },
      canonicalMemoryRoot: { type: 'string' },
    },
    additionalProperties: false,
  },
  tools: [timelineResolveToolSpec],
  hooks: [preCompactionFlushHook, sessionSnapshotHook, auditTraceHook],
};

export default pluginSpec;
