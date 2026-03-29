import { timelinePlugin, timelinePluginEntry } from '../index';

describe('timeline plugin entry compatibility shape', () => {
  it('describes timeline_resolve as a routing surface for reflective recall as well as explicit time queries', () => {
    const tool = timelinePlugin.tools.find((entry) => entry.name === 'timeline_resolve');
    if (!tool) throw new Error('timeline_resolve tool not registered');

    expect(tool.description).toContain('most recent/previous occurrence');
    expect(tool.description).toContain('最近一次知道自己错了');
  });

  it('materializes a definePluginEntry-style registration with the canonical tool only', () => {
    expect(timelinePluginEntry.id).toBe('stella-timeline-plugin');
    expect(timelinePlugin.tools.map((tool) => tool.name)).toEqual(['timeline_resolve']);
    expect(timelinePlugin.tools.find((tool) => tool.name === 'timeline_resolve')?.optional).toBeUndefined();
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
    const tool = timelinePlugin.tools.find((entry) => entry.name === 'timeline_resolve');
    if (!tool) throw new Error('timeline_resolve tool not registered');

    const result = await tool.execute('call-1', {
      query: '你在干嘛',
    });

    expect(result.content[0]?.type).toBe('text');
    expect(result.content[0]?.text).toContain('timeline');
    expect(result.data).toBeTruthy();
  });
});
