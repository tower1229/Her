// Fixed-version integration probe. Private host bundles are test dependencies only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');
const pluginId = 'stella-timeline-plugin';

function readNpmPackFilename(stdout) {
  const text = String(stdout || '');
  const startCandidates = [text.indexOf('['), text.indexOf('{')].filter((index) => index >= 0);
  assert.ok(startCandidates.length > 0, `npm pack --json produced no JSON: ${text.slice(0, 400)}`);
  const parsed = JSON.parse(text.slice(Math.min(...startCandidates)));
  const entries = Array.isArray(parsed)
    ? parsed
    : parsed?.filename
      ? [parsed]
      : Object.values(parsed ?? {});
  const filename = entries.find((entry) => entry && typeof entry.filename === 'string')?.filename;
  assert.ok(filename, `npm pack --json missing filename: ${text.slice(0, 400)}`);
  return filename;
}

if (!process.argv.includes('--probe')) {
  // Explicit installation wins; do not silently test a different host on failure.
  const hostRoot = path.resolve(process.env.OPENCLAW_PACKAGE_ROOT || path.join(repoRoot, 'node_modules/openclaw'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(hostRoot, 'package.json'), 'utf8')).version, '2026.10.9');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'her-host-smoke-'));
  try {
    const pluginRoot = path.join(temp, 'plugin');
    const npmCli = [process.env.npm_execpath, path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')].find(p => p && fs.existsSync(p));
    assert.ok(npmCli, 'npm CLI required to validate the actual publication tarball');
    const packed = spawnSync(process.execPath, [npmCli, 'pack', '--ignore-scripts', '--json', '--pack-destination', temp], { cwd: repoRoot, encoding: 'utf8' });
    assert.equal(packed.status, 0, packed.stderr);
    const tarball = path.join(temp, readNpmPackFilename(packed.stdout));
    const extracted = spawnSync('tar', ['-xf', tarball, '-C', temp], { encoding: 'utf8' });
    assert.equal(extracted.status, 0, extracted.stderr);
    fs.renameSync(path.join(temp, 'package'), pluginRoot);
    const env = { ...process.env, OPENCLAW_STATE_DIR: path.join(temp, 'state'), OPENCLAW_CONFIG_PATH: path.join(temp, 'openclaw.json'), OPENCLAW_HOME: temp };
    for (const key of Object.keys(env)) if (/(API_KEY|TOKEN|SECRET|PASSWORD)$/.test(key)) delete env[key];
    const child = spawn(process.env.OPENCLAW_NODE_BIN || process.execPath, [scriptPath, '--probe', hostRoot, temp], {
      cwd: temp, env, stdio: 'inherit',
    });
    const timeout = setTimeout(() => child.kill(), 120000);
    let status;
    try { status = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); }); }
    finally { clearTimeout(timeout); }
    assert.equal(status, 0, 'Fixed-host acceptance failed or exceeded its 120s budget');
  } finally {
    assert.equal(path.dirname(temp), path.resolve(os.tmpdir()));
    fs.rmSync(temp, { recursive: true, force: true });
  }
} else {
  const [hostRoot, temp] = process.argv.slice(-2);
  assert.equal(process.versions.node, '24.22.1', 'Acceptance must use Node 24.22.1');
  const dist = path.join(hostRoot, 'dist');
  async function hostExport(prefix, name) {
    const files = fs.readdirSync(dist).filter(n => n.startsWith(prefix) && /\.(?:mjs|js)$/.test(n));
    for (const file of files) {
      const source = fs.readFileSync(path.join(dist, file), 'utf8');
      const alias = source.match(new RegExp('\\b' + name + ' as ([\\w$]+)'))?.[1];
      if (!alias && !source.includes(`export function ${name}`)) continue;
      const mod = await import(pathToFileURL(path.join(dist, file)).href);
      if (typeof (mod[alias] || mod[name]) === 'function') return mod[alias] || mod[name];
    }
    throw new Error(`Required host export missing: ${name}`);
  }
  const load = await hostExport('loader-', 'loadOpenClawPlugins');
  const resolveTools = await hostExport('tools-', 'resolvePluginTools');
  const workspaceDir = path.join(temp, 'workspace');
  fs.mkdirSync(path.join(workspaceDir, 'memory'), { recursive: true });
  const config = {
    agents: { defaults: { workspace: workspaceDir } },
    memory: { search: { provider: 'none' } },
    plugins: { allow: [pluginId, 'memory-core'], load: { paths: [path.join(temp, 'plugin')] }, entries: {
      [pluginId]: { enabled: true, hooks: { allowPromptInjection: true, allowConversationAccess: true }, config: { legacyLogTimezone: 'UTC' } },
    } },
    tools: { profile: 'coding', alsoAllow: [pluginId] },
  };
  fs.writeFileSync(process.env.OPENCLAW_CONFIG_PATH, JSON.stringify(config));
  const registry = await load({ config, workspaceDir, cache: false });
  console.log('Host registry loaded');
  const plugin = registry.plugins.find(p => p.id === pluginId);
  assert.equal(plugin?.status, 'loaded', JSON.stringify({ plugin, diagnostics: registry.diagnostics }));
  const tools = await resolveTools({ context: { config, workspaceDir, agentId: 'main', sessionKey: 'agent:main:main', sandboxed: true }, runtimeRegistry: registry, existingToolNames: new Set(), toolAllowlist: [pluginId] });
  assert.ok(tools.some(t => t.name === 'timeline_resolve'));
  assert.ok(tools.some(t => t.name === 'timeline_transition'));
  const hooks = registry.typedHooks.filter(h => h.pluginId === pluginId).map(h => h.hookName);
  for (const name of ['before_prompt_build', 'heartbeat_prompt_contribution', 'message_sent']) assert.ok(hooks.includes(name), `Missing typed hook ${name}: ${JSON.stringify(hooks)}`);
  const require = createRequire(import.meta.url);
  const { writeEpisode } = require(path.join(temp, 'plugin/dist/src/storage/write-episode.js'));
  const daily = path.join(workspaceDir, 'memory/2026-11-01.md');
  fs.writeFileSync(daily, '# Daily\r\n\r\nOrdinary note: amberbadger prefers tea.\r\n');
  assert.ok((await writeEpisode({ filePath: daily, timestamp: '2026-11-01T09:00:00+00:00', location: 'home', action: 'cobaltkingfisher reads novels', emotionTags: ['calm'], appearance: 'casual' })).success);
  assert.ok(fs.readFileSync(daily, 'utf8').includes('amberbadger'));
  const memoryTools = await resolveTools({ context: { config, workspaceDir, agentId: 'main', sessionKey: 'agent:main:main', sandboxed: true }, runtimeRegistry: registry, existingToolNames: new Set(), toolAllowlist: ['memory-core'] });
  const search = memoryTools.find(t => t.name === 'memory_search');
  assert.ok(search, 'Default memory_search tool missing');
  for (const query of ['amberbadger', 'cobaltkingfisher']) {
    console.log(`Checking default memory_search: ${query}`);
    const response = await search.execute(`probe-${query}`, { query, minScore: 0 });
    const payload = JSON.parse(response.content.find(c => c.type === 'text').text);
    assert.ok(payload.results?.some(h => h.path === 'memory/2026-11-01.md'), `Default memory_search did not find ${query}: ${JSON.stringify(payload)}`);
  }
  console.log('Shared daily memory_search passed');
  const blockedConfig = structuredClone(config);
  blockedConfig.plugins.entries[pluginId].hooks = { allowConversationAccess: false, allowPromptInjection: false };
  const blocked = await load({ config: blockedConfig, workspaceDir, cache: false, activate: false });
  const blockedHooks = blocked.typedHooks.filter(h => h.pluginId === pluginId);
  assert.ok(!blockedHooks.some(h => ['heartbeat_prompt_contribution', 'before_prompt_build'].includes(h.hookName)), `Host failed to gate prompt hooks: ${JSON.stringify(blockedHooks.map(h => h.hookName))}`);
  // Delivery observation (message_sent) remains available in this host version;
  // it cannot count an unrelated outbound message as a successful greeting.
  for (const hook of blockedHooks) assert.equal(await hook.handler({ prompt: 'hi', messages: [] }, { workspaceDir }), undefined);
  console.log('Host hook policy gates passed; closing memory resources');
  await (await hostExport('memory-', 'closeAllMemorySearchManagers'))();
  await new Promise(resolve => process.stdout.write(JSON.stringify({ host: '2026.10.9', node: process.versions.node, plugin: plugin.status, tools: tools.map(t => t.name), hooks, hookPolicyGates: 'passed', sharedDailyRecall: 'passed (real default memory_search, lexical mode)', liveModel: 'not verified', liveChannel: 'not verified' }) + '\n', resolve));
  // The standalone probe owns this process. The loaded host installs background
  // observers; after all assertions and memory close finish, end their lifetime.
  process.exit(0);
}
