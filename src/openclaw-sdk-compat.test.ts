import * as fs from 'fs';
import * as path from 'path';
import { timelinePlugin, timelinePluginEntry } from '../index';

describe('timeline plugin entry compatibility shape', () => {
  const tmpDir = path.join(__dirname, '__compat_tmp__');

  beforeEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('describes timeline_resolve as a routing surface for reflective recall as well as explicit time queries', () => {
    const tool = timelinePlugin.tools.find((entry) => entry.name === 'timeline_resolve');
    if (!tool) throw new Error('timeline_resolve tool not registered');

    expect(tool.description).toContain('most recent/previous occurrence');
    expect(tool.description).toContain('最近一次知道自己错了');
  });

  it('materializes a definePluginEntry-style registration with canonical tools', () => {
    expect(timelinePluginEntry.id).toBe('stella-timeline-plugin');
    expect(timelinePlugin.tools.map((tool) => tool.name)).toEqual(['timeline_resolve', 'timeline_transition']);
    expect(timelinePlugin.tools.find((tool) => tool.name === 'timeline_resolve')?.optional).toBeUndefined();
    expect(timelinePlugin.tools.find((tool) => tool.name === 'timeline_transition')?.optional).toBeUndefined();
    expect(timelinePlugin.hooks.map((hook) => hook.event)).toContain('before_prompt_build');
    expect(timelinePlugin.hooks.map((hook) => hook.event)).toContain('message:preprocessed');
    expect(timelinePlugin.hooks.map((hook) => hook.event)).toContain('message:sent');
  });

  it('materialized before_prompt_build hook uses the runtime prompt-context pipeline rather than static guidance only', async () => {
    const hook = timelinePlugin.hooks.find((entry) => entry.event === 'before_prompt_build');
    if (!hook) throw new Error('before_prompt_build hook not registered');

    const result = await hook.execute(
      { prompt: '你好', messages: [{ role: 'user', bodyText: '你好' }] },
      { workspaceDir: tmpDir, sessionKey: 'compat-session' },
    );

    expect(result).toEqual(
      expect.objectContaining({
        prependSystemContext: expect.stringContaining('Timeline prompt context may be injected'),
        prependContext: expect.stringContaining('status: empty_window'),
      }),
    );
  });

  it('keeps manifest, package, and runtime entry metadata aligned', () => {
    const manifest = require('../openclaw.plugin.json');
    const pkg = require('../package.json');

    expect(manifest.id).toBe(timelinePluginEntry.id);
    expect(manifest.entry).toBe(pkg.main);
    expect(manifest.skills).toEqual(['skills/timeline-skill']);
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
