// Opt-in, real-model acceptance. Uses only public Gateway HTTP/RPC APIs.
// Reuses an inline credential or a user-authorized opaque store snapshot in
// private temporary state; never prints credentials or touches user diaries.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import readline from 'node:readline';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.env.OPENCLAW_NODE_BIN || process.execPath;
const host = process.env.OPENCLAW_PACKAGE_ROOT || path.join(root, 'node_modules/openclaw');
const sourceConfig = process.env.OPENCLAW_LIVE_CONFIG_PATH || path.join(os.homedir(), '.openclaw/openclaw.json');
const base = JSON.parse(fs.readFileSync(sourceConfig, 'utf8'));
const model = process.env.OPENCLAW_LIVE_MODEL || 'deepseek/deepseek-v4-flash';
const provider = model.split('/')[0];
const credential = base.models?.providers?.[provider]?.apiKey;
const storeSnapshot = process.env.HER_LIVE_STORE_SNAPSHOT;
if (typeof credential !== 'string' && !(credential?.source === 'store' && storeSnapshot)) throw new Error('Isolated acceptance requires an inline credential or an explicitly authorized official store snapshot; no credential-store bypass is performed.');
const secret = typeof credential === 'string' ? credential : undefined;
const token = randomUUID();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'her-live-'));
const workspace = path.join(temp, 'workspace');
const configPath = path.join(temp, 'openclaw.json');
const stateDir = path.join(temp, 'state');
const pluginDir = path.join(temp, 'plugin');
const reportPath = path.resolve(process.env.HER_LIVE_REPORT || path.join(root, 'docs/20261101-live-results.json'));
const report = { startedAt: new Date().toISOString(), host: JSON.parse(fs.readFileSync(path.join(host, 'package.json'))).version, node: process.versions.node, model, tests: [], externalChannel: 'not configured', userWorkspaceModified: false };
const clean = value => (secret ? String(value).split(secret).join('[REDACTED]') : String(value)).split(token).join('[GATEWAY_TOKEN]').replace(/oc-sent-v2\.[A-Za-z0-9._-]+\.end/g, '[SECRET_SENTINEL]');
const save = () => fs.writeFileSync(reportPath, clean(JSON.stringify(report, null, 2)) + '\n');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function gatewayEvidence() {
  const file = path.join(temp, 'gateway.log');
  const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n') : [];
  return lines.flatMap(line => {
    try {
      const entry = JSON.parse(line);
      const message = typeof entry['1'] === 'string' ? entry['1'] : entry['0'];
      if (typeof message !== 'string' || !/request_id|timeline |heartbeat|\[model-fetch\] response|\[agent\] run/.test(message)) return [];
      return [{ time: entry.time, message: clean(message) }];
    } catch { return []; }
  });
}
let gateway;
let rpcClient;
const rpcPending = new Map();
let stderr = '';
const env = { ...process.env, OPENCLAW_STATE_DIR: stateDir, OPENCLAW_CONFIG_PATH: configPath, OPENCLAW_HOME: temp, OPENCLAW_GATEWAY_TOKEN: token };
delete env.OPENCLAW_RUNTIME_SMOKE;
async function command(args, timeout = 240000, commandEnv = env) {
  return await new Promise((resolve, reject) => {
    const child = spawn(node, [path.join(host, 'openclaw.mjs'), ...args], { cwd: workspace, env: commandEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    const timer = setTimeout(() => child.kill(), timeout);
    child.once('error', reject);
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve(out) : reject(new Error(clean(`CLI ${args[0]} failed (${code}): ${err}\n${out}`))); });
  });
}
async function rpc(method, params = {}, timeout = 180000) {
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { rpcPending.delete(id); reject(new Error(`${method} client timeout`)); }, timeout + 5000);
    rpcPending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    rpcClient.stdin.write(JSON.stringify({ id, method, params, timeout }) + '\n');
  });
}
async function check(name, operation) {
  const selected = process.env.HER_LIVE_CASES?.split(',');
  if (selected && !selected.some(prefix => name.startsWith(prefix))) return;
  console.log(`LIVE: ${name}`);
  const start = Date.now();
  try { const result = await operation(); if (result.response) assert.equal(result.response.ok, true, JSON.stringify(result.response)); if ('dailyUnchanged' in result) assert.equal(result.dailyUnchanged, true); report.tests.push({ name, elapsedMs: Date.now() - start, result }); console.log(`${name}: captured (${Date.now() - start}ms)`); }
  catch (error) { report.tests.push({ name, elapsedMs: Date.now() - start, error: clean(error.stack || error), lastObservedChat: report.lastChat, lastObservedToolResult: report.lastToolResult }); console.log(clean(`${name}: ${error.message}`)); process.exitCode = 1; }
  save();
}
try {
  assert.equal(report.host, '2026.10.9', 'Acceptance requires the pinned OpenClaw host');
  assert.equal(process.versions.node, '24.22.1', 'Acceptance requires Node 24.22.1');
  fs.mkdirSync(pluginDir);
  for (const entry of ['package.json', 'openclaw.plugin.json', 'dist', 'skills', 'templates']) fs.cpSync(path.join(root, entry), path.join(pluginDir, entry), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'memory'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'persona'));
  if (credential?.source === 'store') {
    // A user-approved official snapshot is restored opaquely. Only OpenClaw
    // resolves its SecretRef; this harness never queries or exports secret rows.
    fs.mkdirSync(path.join(stateDir, 'state'), { recursive: true });
    await command(['backup', 'sqlite', 'restore', path.resolve(storeSnapshot), '--target', path.join(stateDir, 'state/openclaw.sqlite'), '--json'], 240000, { ...process.env, OPENCLAW_CONFIG_PATH: sourceConfig });
    report.credentialMode = 'authorized official global snapshot + unchanged store SecretRef';
  }
  const port = await new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const p = server.address().port; server.close(() => resolve(p)); }); });
  const config = {
    gateway: { mode: 'local', port, bind: 'loopback', auth: { mode: 'token', token } },
    models: { providers: { [provider]: base.models.providers[provider] } },
    cron: { enabled: false },
    agents: { defaults: { workspace, model: { primary: model, fallbacks: [] }, thinkingDefault: 'off', timeoutSeconds: 180,
      heartbeat: { every: '30m', target: 'last', isolatedSession: true, lightContext: true, activeHours: { start: '00:00', end: '24:00', timezone: 'UTC' } } }, entries: { main: {} } },
    tools: { profile: 'coding', alsoAllow: ['stella-timeline-plugin'] },
    memory: { search: { provider: 'none' } },
    plugins: { allow: ['stella-timeline-plugin', 'memory-core', provider, 'openai'], load: { paths: [pluginDir] }, entries: {
      'stella-timeline-plugin': { enabled: true, hooks: { allowConversationAccess: true, allowPromptInjection: true }, config: { legacyLogTimezone: 'Asia/Shanghai', proactiveGreeting: { enabled: true }, enableTrace: true } },
      'memory-core': { config: { dreaming: { enabled: false } } },
    } },
    logging: { level: 'debug', consoleLevel: 'warn', file: path.join(temp, 'gateway.log') },
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
  fs.writeFileSync(path.join(workspace, 'IDENTITY.md'), '# Identity\n名字：小禾。你住在上海，喜欢阅读、散步，表达自然简洁。\n');
  fs.writeFileSync(path.join(workspace, 'SOUL.md'), '# Soul\n温和、独立、有时间连续性的陪伴者。使用简体中文，只给用户自然的回复。\n' + fs.readFileSync(path.join(root, 'templates/SOUL.fragment.md'), 'utf8'));
  fs.writeFileSync(path.join(workspace, 'AGENTS.md'), fs.readFileSync(path.join(root, 'templates/AGENTS.fragment.md'), 'utf8').replaceAll('{{CANONICAL_ROOT_NAME}}', 'memory'));
  fs.writeFileSync(path.join(workspace, 'HEARTBEAT.md'), fs.readFileSync(path.join(root, 'templates/HEARTBEAT.fragment.md'), 'utf8').replaceAll('{{CANONICAL_ROOT_NAME}}', 'memory'));
  const profilePath = path.join(workspace, 'persona/PERSONA_PROFILE.md');
  fs.writeFileSync(profilePath, '# PERSONA_PROFILE\n## Meta\n- schema_version: 1.0\n- home_city: Shanghai\n- home_timezone: Asia/Shanghai\n## Soul\n- temperament: quiet\n- values: [continuity, authenticity]\n## Scene Anchors\n- plausible_locations: [家中书房, 附近公园]\n- plausible_activities: [阅读, 散步, 整理书架]\n');
  const require = createRequire(import.meta.url);
  const { writeEpisode } = require('../dist/src/storage/write-episode.js');
  const { createDefaultEngagementState } = require('../dist/src/engagement/engagement_state.js');
  const stamp = d => {
    const offset = -d.getTimezoneOffset();
    const shifted = new Date(d.getTime() + offset * 60000).toISOString().slice(0, 19);
    return `${shifted}${offset < 0 ? '-' : '+'}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}:${String(Math.abs(offset) % 60).padStart(2, '0')}`;
  };
  const currentStamp = stamp(new Date(Date.now() - 3 * 60000));
  const dailyPath = path.join(workspace, `memory/${currentStamp.slice(0, 10)}.md`);
  fs.writeFileSync(dailyPath, '# 日记\n\n普通笔记：这段文字必须保留。\n\n');
  await writeEpisode({ filePath: dailyPath, timestamp: currentStamp, location: '家中书房', action: '整理蓝色笔记本里的读书摘录', emotionTags: ['平静'], appearance: '浅色家居服', estimatedDurationMinutes: 90, eventId: 'live-existing-episode' });
  const engagementPath = path.join(workspace, 'memory/engagement_state.json');
  const seedEngagement = () => {
    const existing = fs.existsSync(engagementPath) ? JSON.parse(fs.readFileSync(engagementPath, 'utf8')) : {};
    fs.writeFileSync(engagementPath, JSON.stringify({ ...createDefaultEngagementState(config), last_user_message_at: new Date(Date.now() - 8 * 3600000).toISOString(), primary_contact_fingerprint: existing.primary_contact_fingerprint || null, contact_scope_status: existing.primary_contact_fingerprint ? 'single' : 'unknown', proactive_greeting_enabled: true }));
  };
  seedEngagement();
  const before = fs.readFileSync(dailyPath, 'utf8');
  gateway = spawn(node, [path.join(host, 'openclaw.mjs'), 'gateway', 'run', '--port', String(port), '--bind', 'loopback'], { cwd: workspace, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  gateway.stdout.on('data', d => { stderr += d; });
  gateway.stderr.on('data', d => { stderr += d; });
  let ready = false;
  for (let i = 0; i < 240; i++) {
    if (gateway.exitCode !== null) throw new Error(clean('Gateway exited: ' + stderr));
    try { const r = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(1000) }); if (r.ok) { ready = true; break; } } catch {}
    await pause(1000);
    if (i % 30 === 29) console.log(`LIVE: Gateway startup pending (${i + 1}s)`);
  }
  if (!ready) throw new Error(clean('Gateway startup timeout: ' + stderr));
  console.log('LIVE: isolated Gateway ready');
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Persistent RPC connection timeout')), 30000);
    rpcClient = spawn(node, [path.join(root, 'scripts/live-gateway-client.mjs')], { cwd: workspace, env: { ...env, OPENCLAW_PACKAGE_ROOT: host, HER_LIVE_GATEWAY_URL: `ws://127.0.0.1:${port}` }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    rpcClient.stderr.on('data', d => { stderr += d; });
    readline.createInterface({ input: rpcClient.stdout }).on('line', line => {
      if (!line.startsWith('HER_RPC ')) return;
      const message = JSON.parse(line.slice(8));
      if (message.ready) { clearTimeout(timer); resolve(); }
      if (message.connectionError) { clearTimeout(timer); reject(new Error(clean(message.connectionError))); }
      const pending = rpcPending.get(message.id);
      if (pending) { rpcPending.delete(message.id); message.error ? pending.reject(new Error(clean(message.error))) : pending.resolve(message.result); }
    });
    rpcClient.once('error', error => { clearTimeout(timer); reject(error); });
    rpcClient.once('exit', code => {
      clearTimeout(timer); reject(new Error(`Persistent RPC client exited (${code}): ${clean(stderr)}`));
      for (const pending of rpcPending.values()) pending.reject(new Error('Persistent RPC client closed'));
      rpcPending.clear();
    });
  });
  report.rpcTransport = 'persistent public GatewayClient';
  const sessionKey = `agent:main:her-live-${randomUUID()}`;
  const invoke = async (tool, args) => {
    const response = await fetch(`http://127.0.0.1:${port}/tools/invoke`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ tool, args, sessionKey }), signal: AbortSignal.timeout(210000) });
    const body = await response.json();
    if (!response.ok || !body.ok) throw new Error(JSON.stringify(body));
    return body.result.details || JSON.parse(body.result.content.find(c => c.type === 'text').text);
  };
  if (process.env.HER_LIVE_SCENARIOS) {
    const suite = await import(pathToFileURL(path.resolve(process.env.HER_LIVE_SCENARIOS)).href);
    await suite.run({ root, workspace, config, configPath, rpc, invoke, check, writeEpisode, stamp, seedEngagement, sessionKey, report, gatewayEvidence, pause });
  } else {
  await check('actual-runtime-read-only-fast', async () => { const r = await invoke('timeline_resolve', { query: '你现在在干嘛', mode: 'read_only_fast', trace: true }); return { response: r, dailyUnchanged: fs.readFileSync(dailyPath, 'utf8') === before }; });
  await check('real-planner-and-reasoner', async () => { const r = await invoke('timeline_resolve', { query: '刚才你在书房做了什么？只查询已有记录。', mode: 'read_only', trace: true }); return { response: r, dailyUnchanged: fs.readFileSync(dailyPath, 'utf8') === before }; });
  await check('real-transition-planner', async () => { const r = await invoke('timeline_transition', { directive: '先停下整理笔记，到客厅休息十分钟。' }); assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.canon_write.success, true); const daily = fs.readFileSync(dailyPath, 'utf8'); assert.ok(daily.includes('普通笔记：这段文字必须保留。')); return { response: r, daily }; });
  await check('real-legacy-persona-extractor', async () => {
    fs.renameSync(profilePath, profilePath + '.disabled');
    try { const r = await invoke('timeline_resolve', { query: '回忆刚才整理笔记的经历，仅查询已有记录。', mode: 'read_only', trace: true }); return { response: r, personaCacheFiles: fs.existsSync(path.join(workspace, '.timeline-cache/persona-contract')) ? fs.readdirSync(path.join(workspace, '.timeline-cache/persona-contract')) : [] }; }
    finally { fs.renameSync(profilePath + '.disabled', profilePath); }
  });
  await check('real-persona-gap-fill-and-reuse', async () => {
    const query = '昨晚21点你在做什么？';
    const first = await invoke('timeline_resolve', { query, trace: true });
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(first.resolution_summary.writes_succeeded, 1);
    const memory = path.join(workspace, 'memory');
    const files = Object.fromEntries(fs.readdirSync(memory).filter(f => f.endsWith('.md')).map(f => [f, fs.readFileSync(path.join(memory, f), 'utf8')]));
    const second = await invoke('timeline_resolve', { query, mode: 'read_only', trace: true });
    assert.equal(second.ok, true, JSON.stringify(second));
    assert.equal(second.resolution_summary.mode, 'read_only_hit');
    assert.equal(second.resolution_summary.writes_attempted, 0);
    for (const [file, text] of Object.entries(files)) assert.equal(fs.readFileSync(path.join(memory, file), 'utf8'), text);
    return { first, second, files, unchanged: true };
  });
  await check('webchat-real-chat-send', async () => {
    const admission = await rpc('chat.send', { sessionKey, message: '你现在在干嘛？简短地自然回答就好。', idempotencyKey: randomUUID() });
    if (admission.runId) { const waited = await rpc('agent.wait', { runId: admission.runId, timeoutMs: 180000 }); assert.equal(waited.status, 'ok', JSON.stringify(waited)); }
    const history = await rpc('chat.history', { sessionKey, limit: 8 });
    const engagement = JSON.parse(fs.readFileSync(engagementPath, 'utf8'));
    assert.ok(Date.now() - Date.parse(engagement.last_user_message_at) < 60000, 'WebChat inbound was not recorded');
    assert.equal(engagement.contact_scope_status, 'single');
    const reply = history.messages.filter(m => m.role === 'assistant').map(m => typeof m.content === 'string' ? m.content : m.content.filter(c => c.type === 'text').map(c => c.text).join('')).join('\n');
    assert.ok(reply.trim(), 'No visible assistant response');
    assert.doesNotMatch(reply, /request_id|timeline_resolve|canon_write/);
    return { admission, history, engagement };
  });
  await check('webchat-opt-out-and-opt-in', async () => {
    const results = [];
    for (const [message, optedOut] of [['暂时别主动联系我。', true], ['现在可以主动联系我了。', false]]) {
      const admission = await rpc('chat.send', { sessionKey, message, idempotencyKey: randomUUID() });
      assert.equal((await rpc('agent.wait', { runId: admission.runId, timeoutMs: 180000 })).status, 'ok');
      const state = JSON.parse(fs.readFileSync(engagementPath, 'utf8'));
      assert.equal(state.proactive_opt_out, optedOut);
      assert.equal(state.contact_scope_status, 'single');
      results.push({ message, optedOut: state.proactive_opt_out, lastUserMessageAt: state.last_user_message_at });
    }
    return { results };
  });
  let monitor;
  await check('heartbeat-monitor-discovery', async () => { seedEngagement(); const listed = await rpc('cron.list', { includeDisabled: true }); monitor = listed.jobs.find(j => j.declarationKey === 'heartbeat:main'); assert.ok(monitor); return listed; });
  await check('heartbeat-unrouted-manual-run', async () => {
    const before = JSON.parse(fs.readFileSync(engagementPath, 'utf8'));
    const run = await rpc('cron.run', { id: monitor.id, mode: 'force', waitTimeoutMs: 120000 });
    const state = JSON.parse(fs.readFileSync(engagementPath, 'utf8'));
    assert.equal(state.last_user_message_at, before.last_user_message_at, 'Heartbeat incorrectly counted as user activity');
    assert.equal(state.unanswered_proactive_count, 0);
    return { run, heartbeat: await rpc('last-heartbeat'), engagement: state };
  });
  await check('heartbeat-internal-generation', async () => {
    // Explicit internal-only target exercises the real heartbeat model/hook without a recipient.
    config.agents.defaults.heartbeat.target = 'none';
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
    await pause(5000);
    seedEngagement();
    const before = JSON.parse(fs.readFileSync(engagementPath, 'utf8'));
    const run = await rpc('cron.run', { id: monitor.id, mode: 'force', waitTimeoutMs: 120000 });
    const state = JSON.parse(fs.readFileSync(engagementPath, 'utf8'));
    assert.equal(state.last_user_message_at, before.last_user_message_at);
    assert.equal(state.last_decision?.reason_code, 'allowed', JSON.stringify(state));
    assert.equal(state.pending_proactive_send, true);
    assert.equal(state.unanswered_proactive_count, 0);
    return { run, heartbeat: await rpc('last-heartbeat'), engagement: state };
  });
  await check('heartbeat-pending-suppresses-repeat', async () => {
    const run = await rpc('cron.run', { id: monitor.id, mode: 'force', waitTimeoutMs: 120000 });
    const state = JSON.parse(fs.readFileSync(engagementPath, 'utf8'));
    assert.equal(state.last_decision?.reason_code, 'pending_send_inflight', JSON.stringify(state));
    assert.equal(state.pending_proactive_send, true);
    assert.equal(state.unanswered_proactive_count, 0);
    return { run, heartbeat: await rpc('last-heartbeat'), engagement: state };
  });
  }
  report.gatewayEvidence = gatewayEvidence();
  await check('real-model-response-correlation', async () => {
    const ids = report.gatewayEvidence.flatMap(e => {
      try { const value = JSON.parse(e.message.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); return typeof value.request_id === 'string' ? [value.request_id] : []; } catch { return []; }
    });
    for (const prefix of ['timeline-plan-', 'timeline-request-', 'trans-', 'timeline-persona-extract-']) assert.ok(ids.some(id => id.startsWith(prefix)), `No real model response for ${prefix}`);
    return { requestIds: ids };
  });
  report.finalEngagement = JSON.parse(fs.readFileSync(engagementPath, 'utf8'));
  report.finishedAt = new Date().toISOString();
  save();
} catch (error) {
  report.fatalError = clean(error.stack || error);
  report.gatewayEvidence = gatewayEvidence();
  save();
  console.error(clean(error.message));
  process.exitCode = 1;
} finally {
  if (rpcClient && rpcClient.exitCode === null) {
    rpcClient.stdin.end();
    await Promise.race([new Promise(resolve => rpcClient.once('exit', resolve)), pause(5000)]);
    if (rpcClient.exitCode === null) rpcClient.kill();
  }
  if (gateway && gateway.exitCode === null) {
    gateway.kill();
    await Promise.race([new Promise(resolve => gateway.once('exit', resolve)), pause(10000)]);
  }
  if (path.dirname(temp) !== path.resolve(os.tmpdir()) || !path.basename(temp).startsWith('her-live-')) throw new Error('Unexpected cleanup path');
  fs.rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
}
