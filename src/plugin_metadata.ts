export const TIMELINE_PLUGIN_ID = 'timeline-plugin';
export const TIMELINE_PLUGIN_NAME = 'Timeline Plugin';
export const TIMELINE_PLUGIN_VERSION = '2.0.0-draft';
export const TIMELINE_PLUGIN_DESCRIPTION =
  'OpenClaw timeline v2 runtime with canonical timeline_resolve/timeline_status/timeline_repair tools and lifecycle helpers.';

export const TIMELINE_TOOL_NAMES = ['timeline_resolve', 'timeline_status', 'timeline_repair'] as const;
export const TIMELINE_HOOK_NAMES = [
  'timeline_pre_compaction_flush',
  'timeline_session_snapshot',
  'timeline_audit_trace',
] as const;
export const TIMELINE_SKILL_PATHS = ['skills/timeline'] as const;
