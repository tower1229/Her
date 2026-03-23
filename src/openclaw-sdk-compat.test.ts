import { timelinePlugin, timelinePluginEntry } from '../index';

describe('timeline plugin entry compatibility shape', () => {
  it('materializes a definePluginEntry-style registration with tools and hooks', () => {
    expect(timelinePluginEntry.id).toBe('timeline-plugin');
    expect(timelinePlugin.tools.map((tool) => tool.name)).toEqual([
      'timeline_resolve',
      'timeline_status',
      'timeline_repair',
    ]);
    expect(timelinePlugin.tools.find((tool) => tool.name === 'timeline_resolve')?.optional).toBe(true);
    expect(timelinePlugin.tools.find((tool) => tool.name === 'timeline_repair')?.optional).toBe(true);
    expect(timelinePlugin.hooks.map((hook) => hook.name)).toEqual([
      'timeline_pre_compaction_flush',
      'timeline_session_snapshot',
      'timeline_audit_trace',
    ]);
  });

  it('keeps manifest, package, and runtime entry metadata aligned', () => {
    const manifest = require('../openclaw.plugin.json');
    const pkg = require('../package.json');

    expect(manifest.id).toBe(timelinePluginEntry.id);
    expect(manifest.entry).toBe(pkg.main);
    expect(manifest.skills).toEqual(['skills/timeline']);
    expect(pkg.openclaw.extensions).toEqual(['./dist/index.js']);
  });

  it('wraps tool execution results in the content envelope expected by the OpenClaw runtime', async () => {
    const tool = timelinePlugin.tools.find((entry) => entry.name === 'timeline_status');
    if (!tool) throw new Error('timeline_status tool not registered');

    const result = await tool.execute('call-1', {});

    expect(result.content[0]?.type).toBe('text');
    expect(result.content[0]?.text).toContain('timeline_status');
    expect(result.data).toBeTruthy();
  });
});
