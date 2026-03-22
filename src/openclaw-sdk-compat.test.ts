import { timelinePlugin, timelinePluginEntry } from '../index';

describe('timeline plugin entry compatibility shape', () => {
  it('materializes a definePluginEntry-style registration with tools and hooks', () => {
    expect(timelinePluginEntry.id).toBe('timeline-plugin');
    expect(timelinePlugin.tools.map((tool) => tool.name)).toContain('timeline_resolve');
    expect(timelinePlugin.hooks.map((hook) => hook.name)).toEqual([
      'timeline_pre_compaction_flush',
      'timeline_session_snapshot',
      'timeline_audit_trace',
    ]);
  });
});
