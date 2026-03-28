import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

const smokeEnabled = process.env.OPENCLAW_RUNTIME_SMOKE === '1';
const runtimeModulePath = process.env.OPENCLAW_RUNTIME_MODULE?.trim() || '';
const smokeNodeBin = process.env.OPENCLAW_NODE_BIN?.trim() || process.execPath;
const runtimeModuleSource = runtimeModulePath && fs.existsSync(runtimeModulePath)
  ? fs.readFileSync(runtimeModulePath, 'utf8')
  : '';

function resolveExportAlias(source: string, symbolName: string): string {
  const aliasMatch = source.match(new RegExp(`\\b${symbolName} as ([\\w$]+)`));
  if (aliasMatch?.[1]) return aliasMatch[1];
  return symbolName;
}

const loadOpenClawPluginsExport = resolveExportAlias(runtimeModuleSource, 'loadOpenClawPlugins');
const resolvePluginToolsExport = resolveExportAlias(runtimeModuleSource, 'resolvePluginTools');
const smokeReady = smokeEnabled && runtimeModulePath && fs.existsSync(runtimeModulePath) && Boolean(runtimeModuleSource);
const describeIfSmoke = smokeReady ? describe : describe.skip;

function copyRecursive(sourcePath: string, targetPath: string): void {
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    fs.mkdirSync(targetPath, { recursive: true });
    for (const entry of fs.readdirSync(sourcePath)) {
      copyRecursive(path.join(sourcePath, entry), path.join(targetPath, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function setSafePermissions(targetPath: string): void {
  if (process.platform === 'win32' || !fs.existsSync(targetPath)) return;
  const stat = fs.statSync(targetPath);
  fs.chmodSync(targetPath, stat.isDirectory() ? 0o755 : 0o644);
  if (!stat.isDirectory()) return;
  for (const entry of fs.readdirSync(targetPath)) {
    setSafePermissions(path.join(targetPath, entry));
  }
}

function stagePluginForSmoke(repoRoot: string): string {
  const stagedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-timeline-plugin-smoke-'));
  for (const entry of ['package.json', 'openclaw.plugin.json', 'dist']) {
    copyRecursive(path.join(repoRoot, entry), path.join(stagedRoot, entry));
  }
  setSafePermissions(stagedRoot);
  return stagedRoot;
}

describeIfSmoke('OpenClaw runtime smoke', () => {
  it('loads the plugin through the real OpenClaw loader and resolves the canonical tool', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const stagedPluginRoot = stagePluginForSmoke(repoRoot);

    try {
      const script = `
      import { pathToFileURL } from 'node:url';
      const runtime = await import(pathToFileURL(${JSON.stringify(runtimeModulePath)}).href);
      const loadOpenClawPlugins = runtime[${JSON.stringify(loadOpenClawPluginsExport)}]
        || runtime.loadOpenClawPlugins
        || runtime.default?.[${JSON.stringify(loadOpenClawPluginsExport)}]
        || runtime.default?.loadOpenClawPlugins;
      const resolvePluginTools = runtime[${JSON.stringify(resolvePluginToolsExport)}]
        || runtime.resolvePluginTools
        || runtime.default?.[${JSON.stringify(resolvePluginToolsExport)}]
        || runtime.default?.resolvePluginTools;
      if (typeof loadOpenClawPlugins !== 'function' || typeof resolvePluginTools !== 'function') {
        throw new Error('Unable to resolve OpenClaw runtime exports from ' + ${JSON.stringify(runtimeModulePath)});
      }
      const config = {
        plugins: {
          allow: ['stella-timeline-plugin'],
          load: { paths: [${JSON.stringify(stagedPluginRoot)}] },
          entries: { 'stella-timeline-plugin': { enabled: true } },
        },
        tools: {
          profile: 'coding',
          alsoAllow: ['stella-timeline-plugin'],
        },
      };
      const registry = loadOpenClawPlugins({ config, workspaceDir: ${JSON.stringify(repoRoot)} });
      const plugin = registry.plugins.find((entry) => entry.id === 'stella-timeline-plugin');
      const resolvedTools = resolvePluginTools({
        context: { config, workspaceDir: ${JSON.stringify(repoRoot)}, sandboxed: true },
        existingToolNames: new Set(),
        toolAllowlist: ['stella-timeline-plugin'],
      });
      console.log(JSON.stringify({
        runtimeModulePath: ${JSON.stringify(runtimeModulePath)},
        plugin: plugin ? {
          status: plugin.status,
          toolNames: plugin.toolNames,
        } : null,
        resolvedToolNames: resolvedTools.map((tool) => tool.name),
      }));
    `;
      const raw = execFileSync(smokeNodeBin, ['--input-type=module', '-e', script], {
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
        runtimeModulePath?: string;
        plugin: null | {
          status: string;
          toolNames: string[];
        };
        resolvedToolNames: string[];
      };

      expect(payload.plugin).toBeTruthy();
      expect(payload.plugin?.status).toBe('loaded');
      expect(payload.plugin?.toolNames).toEqual(expect.arrayContaining(['timeline_resolve']));
      expect(payload.resolvedToolNames).toEqual(expect.arrayContaining(['timeline_resolve']));
    } finally {
      fs.rmSync(stagedPluginRoot, { recursive: true, force: true });
    }
  });
});
