import * as fs from 'fs';
import * as path from 'path';
import { execFileSync, execSync } from 'child_process';

function findOpenClawReplyModule(): string {
  const npmRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
  const distDir = path.join(npmRoot, 'openclaw', 'dist');
  const replyModule = fs.readdirSync(distDir).find((entry) => /^reply-.*\.js$/.test(entry));
  if (!replyModule) {
    throw new Error(`Unable to locate OpenClaw reply bundle under ${distDir}`);
  }
  return path.join(distDir, replyModule);
}

const smokeEnabled = process.env.OPENCLAW_RUNTIME_SMOKE === '1';
const describeIfSmoke = smokeEnabled ? describe : describe.skip;

describeIfSmoke('OpenClaw runtime smoke', () => {
  it('loads the plugin through the real OpenClaw loader and resolves tools/hooks', () => {
    const replyModulePath = findOpenClawReplyModule();
    const repoRoot = path.resolve(__dirname, '..', '..');
    const script = `
      import { pathToFileURL } from 'node:url';
      const runtime = await import(pathToFileURL(${JSON.stringify(replyModulePath)}).href);
      const findRuntimeExport = (signature) => {
        for (const value of Object.values(runtime)) {
          if (typeof value === 'function' && String(value).includes(signature)) {
            return value;
          }
        }
        throw new Error('Unable to find OpenClaw runtime export containing signature: ' + signature);
      };
      const loadOpenClawPlugins = findRuntimeExport('function loadOpenClawPlugins');
      const resolvePluginTools = findRuntimeExport('function resolvePluginTools');
      const config = {
        plugins: {
          allow: ['timeline-plugin'],
          load: { paths: [${JSON.stringify(repoRoot)}] },
          entries: { 'timeline-plugin': { enabled: true } },
        },
        tools: {
          profile: 'coding',
          alsoAllow: ['timeline-plugin'],
        },
      };
      const registry = loadOpenClawPlugins({ config, workspaceDir: ${JSON.stringify(repoRoot)} });
      const plugin = registry.plugins.find((entry) => entry.id === 'timeline-plugin');
      const resolvedTools = resolvePluginTools({
        context: { config, workspaceDir: ${JSON.stringify(repoRoot)}, sandboxed: true },
        existingToolNames: new Set(),
        toolAllowlist: ['timeline-plugin'],
      });
      console.log(JSON.stringify({
        plugin: plugin ? {
          status: plugin.status,
          toolNames: plugin.toolNames,
          hookNames: plugin.hookNames,
        } : null,
        resolvedToolNames: resolvedTools.map((tool) => tool.name),
      }));
    `;
    const raw = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
    const jsonLine = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('{') && line.endsWith('}'))
      .slice(-1)[0];
    if (!jsonLine) {
      throw new Error(`OpenClaw smoke script did not emit a JSON payload.\n${raw}`);
    }
    const payload = JSON.parse(jsonLine) as {
      plugin: null | {
        status: string;
        toolNames: string[];
        hookNames: string[];
      };
      resolvedToolNames: string[];
    };

    expect(payload.plugin).toBeTruthy();
    expect(payload.plugin?.status).toBe('loaded');
    expect(payload.plugin?.toolNames).toEqual(
      expect.arrayContaining(['timeline_resolve', 'timeline_status', 'timeline_repair']),
    );
    expect(payload.plugin?.hookNames).toEqual(
      expect.arrayContaining([
        'timeline_pre_compaction_flush',
        'timeline_session_snapshot',
        'timeline_audit_trace',
      ]),
    );
    expect(payload.resolvedToolNames).toEqual(
      expect.arrayContaining(['timeline_resolve', 'timeline_status', 'timeline_repair']),
    );
  });
});
