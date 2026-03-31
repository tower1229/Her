import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeTempDir = process.platform === 'win32' ? os.tmpdir() : '/tmp';

function runCapture(command) {
  try {
    return execSync(command, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: {
        ...process.env,
        TMPDIR: runtimeTempDir,
        TMP: runtimeTempDir,
        TEMP: runtimeTempDir,
      },
    }).trim();
  } catch {
    return '';
  }
}

function resolveOnPath(binaryName) {
  const command = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(command, [binaryName], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TMPDIR: runtimeTempDir,
      TMP: runtimeTempDir,
      TEMP: runtimeTempDir,
    },
  });
  if (result.status !== 0) return '';
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || '';
}

function listJsFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

function candidateDistDirs() {
  const dirs = new Set();
  const explicit = process.env.OPENCLAW_RUNTIME_MODULE?.trim();
  if (explicit && fs.existsSync(explicit)) {
    dirs.add(path.dirname(explicit));
  }

  const npmRoot = runCapture(process.platform === 'win32' ? 'npm.cmd root -g' : 'npm root -g');
  if (npmRoot) {
    dirs.add(path.join(npmRoot, 'openclaw', 'dist'));
  }

  const npmPrefix = runCapture(process.platform === 'win32' ? 'npm.cmd prefix -g' : 'npm prefix -g');
  if (npmPrefix) {
    dirs.add(path.join(npmPrefix, 'node_modules', 'openclaw', 'dist'));
    dirs.add(path.join(npmPrefix, 'lib', 'node_modules', 'openclaw', 'dist'));
  }

  const openClawBin = resolveOnPath('openclaw');
  if (openClawBin) {
    const binDir = path.dirname(openClawBin);
    dirs.add(path.join(binDir, 'node_modules', 'openclaw', 'dist'));
    dirs.add(path.join(binDir, '..', 'node_modules', 'openclaw', 'dist'));
    dirs.add(path.join(binDir, '..', 'lib', 'node_modules', 'openclaw', 'dist'));
  }

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA?.trim();
    if (appData) {
      dirs.add(path.join(appData, 'npm', 'node_modules', 'openclaw', 'dist'));
    }
  }

  return [...dirs];
}

function findRuntimeModuleInDist(distDir) {
  if (!fs.existsSync(distDir)) return '';
  const candidates = listJsFiles(distDir);
  const aliasAware = candidates.find((filePath) => {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.includes('loadOpenClawPlugins as') && content.includes('resolvePluginTools as');
  });
  if (aliasAware) return aliasAware;

  const direct = candidates.find((filePath) => {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.includes('function loadOpenClawPlugins') && content.includes('function resolvePluginTools');
  });
  if (direct) return direct;

  return candidates.find((filePath) => /^reply-.*\.js$/.test(path.basename(filePath))) || '';
}

function findOpenClawRuntimeModule() {
  const explicit = process.env.OPENCLAW_RUNTIME_MODULE?.trim();
  if (explicit && fs.existsSync(explicit)) return explicit;

  for (const distDir of candidateDistDirs()) {
    const runtimeModule = findRuntimeModuleInDist(distDir);
    if (runtimeModule) return runtimeModule;
  }

  const nvmNodeDir = path.join(os.homedir(), '.nvm', 'versions', 'node');
  if (fs.existsSync(nvmNodeDir)) {
    for (const entry of fs.readdirSync(nvmNodeDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const distDir = path.join(nvmNodeDir, entry.name, 'lib', 'node_modules', 'openclaw', 'dist');
      const runtimeModule = findRuntimeModuleInDist(distDir);
      if (runtimeModule) return runtimeModule;
    }
  }

  return '';
}

function findCompatibleNodeBin(runtimeModulePath) {
  const explicit = process.env.OPENCLAW_NODE_BIN?.trim();
  if (explicit && fs.existsSync(explicit)) return explicit;

  const normalized = path.normalize(runtimeModulePath);
  const unixMarker = `${path.sep}lib${path.sep}node_modules${path.sep}openclaw${path.sep}dist${path.sep}`;
  const unixIndex = normalized.lastIndexOf(unixMarker);
  if (unixIndex !== -1) {
    const prefixDir = normalized.slice(0, unixIndex);
    const unixNode = path.join(prefixDir, 'bin', 'node');
    if (fs.existsSync(unixNode)) return unixNode;
    const winNode = path.join(prefixDir, 'node.exe');
    if (fs.existsSync(winNode)) return winNode;
  }

  return process.execPath;
}

function parseLastJsonObject(raw) {
  const jsonLine = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{') && line.endsWith('}'))
    .slice(-1)[0];
  if (!jsonLine) {
    throw new Error(`OpenClaw smoke script did not emit a JSON payload.\n${raw}`);
  }
  return JSON.parse(jsonLine);
}

function copyRecursive(sourcePath, targetPath) {
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

function setSafePermissions(targetPath) {
  if (process.platform === 'win32' || !fs.existsSync(targetPath)) return;
  const stat = fs.statSync(targetPath);
  fs.chmodSync(targetPath, stat.isDirectory() ? 0o755 : 0o644);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(targetPath)) {
      setSafePermissions(path.join(targetPath, entry));
    }
  }
}

function stagePluginForSmoke() {
  const stagedRoot = fs.mkdtempSync(path.join(runtimeTempDir, 'stella-timeline-plugin-smoke-'));
  for (const entry of ['package.json', 'openclaw.plugin.json', 'dist']) {
    const sourcePath = path.join(repoRoot, entry);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`OpenClaw smoke staging missing required path: ${sourcePath}`);
    }
    copyRecursive(sourcePath, path.join(stagedRoot, entry));
  }
  setSafePermissions(stagedRoot);
  return stagedRoot;
}

const runtimeModule = findOpenClawRuntimeModule();
if (!runtimeModule) {
  console.log('Skipping OpenClaw smoke: OpenClaw runtime not found on this machine.');
  process.exit(0);
}

const openClawNodeBin = findCompatibleNodeBin(runtimeModule);
const stagedPluginRoot = stagePluginForSmoke();
const script = `
  import fs from 'node:fs';
  import { pathToFileURL } from 'node:url';

  const runtimeModulePath = ${JSON.stringify(runtimeModule)};
  const repoRoot = ${JSON.stringify(repoRoot)};
  const pluginRoot = ${JSON.stringify(stagedPluginRoot)};
  const runtimeSource = fs.readFileSync(runtimeModulePath, 'utf8');
  const alias = (symbolName) => runtimeSource.match(new RegExp('\\\\b' + symbolName + ' as ([\\\\w$]+)'))?.[1] || symbolName;
  const runtime = await import(pathToFileURL(runtimeModulePath).href);
  const loadOpenClawPlugins = runtime[alias('loadOpenClawPlugins')]
    || runtime.loadOpenClawPlugins
    || runtime.default?.[alias('loadOpenClawPlugins')]
    || runtime.default?.loadOpenClawPlugins;
  const resolvePluginTools = runtime[alias('resolvePluginTools')]
    || runtime.resolvePluginTools
    || runtime.default?.[alias('resolvePluginTools')]
    || runtime.default?.resolvePluginTools;

  if (typeof loadOpenClawPlugins !== 'function' || typeof resolvePluginTools !== 'function') {
    throw new Error('Unable to resolve OpenClaw runtime exports from ' + runtimeModulePath);
  }

  const config = {
    plugins: {
      allow: ['stella-timeline-plugin'],
      load: { paths: [pluginRoot] },
      entries: { 'stella-timeline-plugin': { enabled: true } },
    },
    tools: {
      profile: 'coding',
      alsoAllow: ['stella-timeline-plugin'],
    },
  };

  const registry = loadOpenClawPlugins({ config, workspaceDir: repoRoot });
  const plugin = registry.plugins.find((entry) => entry.id === 'stella-timeline-plugin');
  const resolvedTools = resolvePluginTools({
    context: { config, workspaceDir: repoRoot, sandboxed: true },
    existingToolNames: new Set(),
    toolAllowlist: ['stella-timeline-plugin'],
  });

  console.log(JSON.stringify({
    runtimeModulePath,
    plugin: plugin ? {
      status: plugin.status,
      toolNames: plugin.toolNames,
    } : null,
    resolvedToolNames: resolvedTools.map((tool) => tool.name),
  }));
`;

const result = spawnSync(openClawNodeBin, ['--input-type=module', '-e', script], {
  cwd: repoRoot,
  encoding: 'utf8',
  env: {
    ...process.env,
    TMPDIR: runtimeTempDir,
    TMP: runtimeTempDir,
    TEMP: runtimeTempDir,
  },
});

if (result.status !== 0) {
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  console.error(output || `OpenClaw smoke failed with exit code ${result.status}`);
  process.exit(result.status ?? 1);
}

const payload = parseLastJsonObject(result.stdout || '');
if (!payload.plugin) {
  console.error(`OpenClaw smoke did not load stella-timeline-plugin.\n${result.stdout || ''}`);
  process.exit(1);
}
if (payload.plugin.status !== 'loaded') {
  console.error(`OpenClaw smoke loaded stella-timeline-plugin with unexpected status: ${payload.plugin.status}`);
  process.exit(1);
}
if (!Array.isArray(payload.resolvedToolNames) || !payload.resolvedToolNames.includes('timeline_resolve') || !payload.resolvedToolNames.includes('timeline_transition')) {
  console.error(`OpenClaw smoke did not resolve required timeline tools into runtime tools.\n${JSON.stringify(payload)}`);
  process.exit(1);
}

console.log(`OpenClaw smoke passed using ${runtimeModule}`);
