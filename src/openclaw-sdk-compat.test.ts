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

  it('keeps manifest, package, and runtime entry metadata aligned', () => {
    const manifest = require('../openclaw.plugin.json');
    const pkg = require('../package.json');

    expect(manifest.id).toBe(timelinePluginEntry.id);
    expect(manifest.entry).toBe(pkg.main);
    expect(manifest.skills).toEqual(['skills/timeline']);
    expect(pkg.openclaw.extensions).toEqual(['./index.ts']);
  });
});
