// Real-model scenarios traced to the original English and Chinese README.
// Loaded by verify-openclaw-live.mjs after its isolated Gateway is ready.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

export async function run(h) {
  const { workspace, rpc, invoke, check, writeEpisode, report, gatewayEvidence } = h;
  assert.equal(report.model, 'google/gemini-3.8-flash');
  report.readmeBaseline = 'feda99284ff7695d68dc283cb6f5295e8b3ccc91';
  report.caseObservations = {};
  const require = createRequire(import.meta.url);
  const { parseMemoryFile } = require('../dist/src/lib/parse-memory.js');
  const memory = path.join(workspace, 'memory');
  const profilePath = path.join(workspace, 'persona/PERSONA_PROFILE.md');
  const stablePath = path.join(workspace, 'MEMORY.md');
  const profile = `# PERSONA_PROFILE
## Meta
- schema_version: 1.0
- home_city: 上海
- home_country: 中国
- home_timezone: Asia/Shanghai
## Identity
- living_style: 独居的小禾，平日做文字编辑，居住在上海
- common_zones: [家中书房, 家中客厅, 梧桐咖啡馆, 社区健身房]
## Soul
- temperament: 安静而有主见
- values: [诚实, 自省, 尊重他人]
## Stable Memory
- long_term_habits: [阅读, 散步, 整理读书摘录]
- long_term_preferences: [乌龙茶, 安静的周末]
- important_non_temporal_facts: [怕高，不开车]
## Daily Rhythm Tendencies
- weekday_bias: [白天做文字编辑]
- weekend_bias: [睡得稍晚, 早晨慢慢吃早餐, 下午散步]
- evening_bias: [在家阅读, 休息]
## Appearance Tendencies
- default_home_style: 浅色家居服
- default_outing_style: 深蓝外套和长裤
- default_exercise_style: 黑色运动上衣和运动裤
- change_triggers: [健身, 洗澡, 睡觉, 正式出门]
- non_triggers: [从书房走到客厅, 喝水, 整理笔记]
## Scene Anchors
- plausible_locations: [家中书房, 家中客厅, 梧桐咖啡馆, 社区健身房, 上海街头]
- plausible_activities: [阅读, 整理摘录, 喝茶, 散步, 健身]
## Constraint Rules
- must: [真实用户信息只能来自用户，不能补造]
- avoid: [开车, 高空运动]
`;
  fs.writeFileSync(profilePath, profile);
  fs.writeFileSync(stablePath, '# 长期记忆\n小禾喜欢乌龙茶，怕高，不开车。\n用户事实测试锚点：用户偏爱无糖茶。\n');
  const baselineStable = fs.readFileSync(stablePath, 'utf8');
  const localStamp = ms => new Date(ms + 8 * 3600000).toISOString().slice(0, 19) + '+08:00';
  const nowStamp = () => localStamp(Date.now());
  const dayClock = (daysAgo, hour, minute = 0) => `${localStamp(Date.now() - daysAgo * 86400000).slice(0, 10)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+08:00`;
  const dailyFiles = () => fs.readdirSync(memory).filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));
  const snapshot = () => Object.fromEntries(dailyFiles().map(f => [f, fs.readFileSync(path.join(memory, f), 'utf8')]));
  const episodes = () => Object.values(snapshot()).flatMap(text => parseMemoryFile(text));
  const observe = (id, value) => { report.caseObservations[id] = value; return value; };
  function reset() { for (const f of dailyFiles()) fs.unlinkSync(path.join(memory, f)); }
  async function seed({ timestamp = localStamp(Date.now() - 600000), eventId = 'fixture-' + randomUUID(), location = '家中书房', action = '整理蓝色笔记本里的读书摘录', appearance = '浅色家居服', duration = 90, monologue = '慢慢把读过的内容理顺。' } = {}) {
    const filePath = path.join(memory, timestamp.slice(0, 10) + '.md');
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '# 每日日记\n\n普通笔记：这里的自由文本必须保留。\n\n');
    const result = await writeEpisode({ filePath, timestamp, eventId, location, action, appearance, estimatedDurationMinutes: duration, emotionTags: ['平静'], internalMonologue: monologue });
    assert.equal(result.success, true, JSON.stringify(result));
    return eventId;
  }
  const tracePath = path.join(memory, '.timeline-trace.log');
  const traceLines = () => fs.existsSync(tracePath) ? fs.readFileSync(tracePath, 'utf8').trim().split('\n').filter(Boolean) : [];
  async function chat(message, key = `agent:main:readme-${randomUUID()}`) {
    const traceOffset = traceLines().length;
    const admission = await rpc('chat.send', { sessionKey: key, message, idempotencyKey: randomUUID() });
    assert.ok(admission.runId, JSON.stringify(admission));
    const wait = await rpc('agent.wait', { runId: admission.runId, timeoutMs: 180000 });
    assert.equal(wait.status, 'ok', JSON.stringify(wait));
    const history = await rpc('chat.history', { sessionKey: key, limit: 12 });
    const responses = history.messages.filter(m => m.role === 'assistant' && (!m.__openclaw?.runId || m.__openclaw.runId === admission.runId));
    const text = responses.map(m => typeof m.content === 'string' ? m.content : m.content?.filter(c => c.type === 'text').map(c => c.text).join('')).filter(Boolean).join('\n');
    const result = { sessionKey: key, runId: admission.runId, text, model: responses.map(m => m.model), promptContext: history.messages.filter(m => m.role === 'user').at(-1)?.__openclaw?.modelPromptProjection?.text, traces: traceLines().slice(traceOffset).map(line => JSON.parse(line)) };
    report.lastChat = result;
    assert.ok(text.trim(), 'Missing assistant response');
    assert.ok(responses.some(m => m.model === 'gemini-3.8-flash'), JSON.stringify(result));
    assert.doesNotMatch(text, /request_id|canon_write|timeline\.consumption|timeline_resolve\(/);
    assert.doesNotMatch(JSON.stringify(result.traces), /Fallback reasoner|observation cancelled|error_degraded/, 'A degraded reply is not successful real-model acceptance');
    return result;
  }
  async function resolve(query, mode) {
    const result = await invoke('timeline_resolve', { query, ...(mode ? { mode } : {}), trace: true });
    report.lastToolResult = result;
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.notEqual(result.resolution_summary?.mode, 'error_degraded', JSON.stringify(result));
    assert.doesNotMatch(JSON.stringify(result), /Fallback reasoner|observation cancelled/, 'Fallback does not prove successful model inference');
    return result;
  }

  // Stop the suite if the requested provider cannot actually answer; do not
  // replace unavailable Gemini with semantic fallbacks or another model.
  reset(); await seed();
  const preflight = await chat('请只回复“验收准备好了”。');
  report.modelPreflight = preflight;

  await check('R01-current-existing', async () => {
    reset(); await seed(); const before = snapshot();
    const answer = observe('R01', await chat('你现在在做什么？'));
    assert.match(answer.text, /书房|笔记|摘录/); assert.deepEqual(snapshot(), before);
    return answer;
  });
  await check('R02-now-gap-fill-and-reuse', async () => {
    reset(); const first = await chat('你现在在做什么？'); const written = snapshot();
    const second = await chat('刚刚你在做什么？现在还在继续吗？', first.sessionKey);
    const result = observe('R02', { first, second, written, after: snapshot() });
    assert.ok(Object.keys(written).length > 0, 'No daily record created for the empty current window');
    assert.deepEqual(snapshot(), written, 'Immediate follow-up unexpectedly rewrote the timeline');
    return result;
  });
  const pastFixtures = async () => {
    reset();
    await seed({ timestamp: dayClock(1, 19, 10), location: '厨房餐桌', action: '做番茄鸡蛋面，吃完把碗洗了', duration: 45 });
    await seed({ timestamp: dayClock(1, 20), location: '客厅沙发', action: '窝在沙发上看纪录片《河流》，没有出门', duration: 120 });
  };
  await check('R03-specific-past-point', async () => {
    await pastFixtures(); const before = snapshot(); const answer = observe('R03', await chat('昨晚八点你在做什么？'));
    assert.match(answer.text, /沙发|纪录片|河流/); assert.ok(answer.traces.some(t => t.payload?.trace?.actual_range === 'past_point')); assert.deepEqual(snapshot(), before); return answer;
  });
  await check('R04-last-night-range', async () => {
    await pastFixtures(); const before = snapshot(); const answer = observe('R04', await chat('你昨晚在干嘛？'));
    assert.match(answer.text, /番茄|面|纪录片|河流|沙发/); assert.ok(answer.traces.some(t => t.payload?.trace?.actual_range === 'past_range')); assert.deepEqual(snapshot(), before); return answer;
  });
  await check('R05-recent-multi-day', async () => {
    reset();
    await seed({ timestamp: dayClock(3, 16), location: '家中书房', action: '完成散文稿《雨巷》的校对', duration: 80 });
    await seed({ timestamp: dayClock(2, 18), location: '社区篮球场', action: '和朋友打篮球，最后投进一个漂亮的三分球', appearance: '黑色运动服', duration: 70 });
    await seed({ timestamp: dayClock(1, 20), location: '烧烤店', action: '和朋友吃烤茄子，聊篮球场的趣事', duration: 60 });
    const before = snapshot(); const summary = await chat('你这几天都在忙什么？'); const anecdote = await chat('最近有什么有趣的事吗？');
    observe('R05', { summary, anecdote, files: snapshot() });
    assert.match(summary.text, /校对|雨巷/); assert.match(summary.text, /篮球/); assert.match(summary.text, /烧烤|茄子/);
    assert.match(anecdote.text, /篮球|三分|烧烤|茄子/);
    assert.ok(summary.traces.length && anecdote.traces.length); assert.deepEqual(snapshot(), before); return { summary, anecdote };
  });
  await check('R06-reflective-recall', async () => {
    reset(); await seed({ timestamp: dayClock(1, 15), location: '梧桐咖啡馆', action: '和林沫核对读书会时间，发现是自己记错了，向她道歉并把时间改到周三', duration: 35, monologue: '刚才还坚持是她记错了，翻出通知才发现是我错了，应该认真道歉。' });
    const before = snapshot(); const answer = observe('R06', await chat('你最近一次知道自己错了是什么场景？'));
    assert.match(answer.text, /林沫|读书会|时间|周三/); assert.match(answer.text, /错|道歉/); assert.ok(answer.traces.length); assert.deepEqual(snapshot(), before); return answer;
  });
  await check('R07-weekend-rhythm', async () => {
    reset(); const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', weekday: 'long' }).format(new Date());
    assert.ok(['Saturday', 'Sunday'].includes(weekday), 'Requires an actual weekend; do not pretend a weekday is a weekend');
    const answer = await chat('今天周末，你早上是怎么过的？'); const result = observe('R07', { weekday, answer, files: snapshot() });
    assert.ok(episodes().length); assert.ok(episodes().every(e => Date.parse(e.timestamp) <= Date.now())); assert.doesNotMatch(answer.text, /今天是周[一二三四五]/); return result;
  });
  await check('R08-outfit-continuity-and-transitions', async () => {
    reset(); await seed(); const first = await chat('你现在穿什么，在干嘛？'); const before = snapshot();
    const same = await chat('还是刚才那身衣服吗？', first.sessionKey); assert.deepEqual(snapshot(), before);
    const exercise = await chat('先停下整理笔记，换上黑色运动上衣和运动裤去社区健身房锻炼。', first.sessionKey);
    assert.ok(exercise.traces.some(t => t.event === 'timeline_transition' && t.payload?.ok !== false));
    assert.ok(episodes().some(e => /健身|运动/.test(e.action)));
    const during = await chat('你现在在哪里，穿的是什么？', first.sessionKey);
    const home = await chat('锻炼先到这里，现在回家洗澡，然后换回浅色家居服坐在客厅休息。', first.sessionKey);
    assert.ok(home.traces.some(t => t.event === 'timeline_transition' && t.payload?.ok !== false));
    const after = await chat('刚回家，现在穿的还是运动服吗？', first.sessionKey);
    const result = observe('R08', { first, same, exercise, during, home, after, files: snapshot() });
    assert.match(during.text, /运动|健身/); assert.match(after.text, /家居|换|洗澡/); return result;
  });
  await check('R09-scene-atmosphere', async () => {
    reset(); await seed({ location: '安静的家中书房', action: '独自专心校对文章，窗边放着乌龙茶' });
    const quiet = await chat('陪我聊两句吧，你那边怎么样？');
    reset(); await seed({ location: '热闹的梧桐咖啡馆', action: '朋友马上就到，店里正在放轻快音乐，我在等她一起聊天', appearance: '深蓝外套和长裤' });
    const lively = await chat('陪我聊两句吧，你那边怎么样？'); const result = observe('R09', { quiet, lively, semanticToneReview: 'requires human review of captured natural replies' });
    assert.match(quiet.promptContext || '', /书房/); assert.match(lively.promptContext || '', /咖啡馆/);
    assert.match(quiet.text, /安静|书房|校对|茶/); assert.match(lively.text, /咖啡|朋友|音乐|热闹/); return result;
  });
  await check('R10-moving-macro-refinement', async () => {
    reset(); const id = await seed({ timestamp: localStamp(Date.now() - 3 * 3600000), eventId: 'moving-macro', location: '上海新旧住处之间', action: '今天在上海搬家，搬运和整理书籍衣物，预计整段搬家持续十二小时', duration: 720, appearance: '方便搬运的灰色T恤和长裤' });
    const answer = await chat('搬家到哪一步了，你现在具体在干嘛？');
    const result = observe('R10', { answer, files: snapshot() });
    const parent = episodes().find(e => e.eventId === id); assert.ok(parent); assert.equal(parent.estimatedDurationMinutes, 720);
    assert.ok(episodes().some(e => e.parentEventTag === id), 'No persisted instantaneous phase linked to the moving event');
    assert.match(answer.text, /搬|箱|书|整理|打包|衣/); return result;
  });
  await check('R11-cross-day-travel', async () => {
    reset(); await seed({ timestamp: dayClock(1, 9), eventId: 'travel-macro', location: '大理旅行途中', action: '从上海出发到大理旅行三天，已到大理，今天仍在当地旅行', duration: 4320, appearance: '深蓝外套和长裤' });
    const answer = await chat('你现在在做什么，已经回上海家里了吗？');
    const result = observe('R11', { answer, files: snapshot() });
    assert.ok(episodes().some(e => e.eventId === 'travel-macro'));
    assert.ok(episodes().some(e => e.parentEventTag === 'travel-macro'), 'No persisted current phase for cross-day travel');
    assert.match(answer.text, /大理|旅|还没|没有回|没回/); assert.doesNotMatch(answer.text, /已经回到上海|已经在上海家里/); return result;
  });
  await check('R12-structured-persona-precedence', async () => {
    reset(); const identity = path.join(workspace, 'IDENTITY.md'); const old = fs.readFileSync(identity, 'utf8');
    const extractionResponses = () => gatewayEvidence().filter(e => /"request_id"\s*:\s*"timeline-persona-extract-/.test(e.message)).length;
    const beforeCount = extractionResponses();
    fs.writeFileSync(identity, '# Legacy identity\n住在东京，喜欢开车和蹦极。\n');
    try {
      const response = await resolve('昨天上午十点你在做什么？'); const result = observe('R12', { response, files: snapshot() });
      assert.doesNotMatch(JSON.stringify(response.result?.consumption?.scene), /东京|蹦极|开车/);
      assert.equal(extractionResponses(), beforeCount);
      assert.equal(fs.readFileSync(profilePath, 'utf8'), profile); return result;
    } finally { fs.writeFileSync(identity, old); }
  });
  await check('R13-legacy-persona-and-cache', async () => {
    reset(); await seed(); fs.renameSync(profilePath, profilePath + '.disabled');
    const cachePath = path.join(workspace, '.timeline-cache/persona-contract');
    try {
      const first = await resolve('刚才你在做什么？', 'read_only');
      const cache = Object.fromEntries(fs.readdirSync(cachePath).map(f => [f, fs.readFileSync(path.join(cachePath, f), 'utf8')]));
      const second = await resolve('刚才整理的是哪本笔记？', 'read_only');
      const after = Object.fromEntries(fs.readdirSync(cachePath).map(f => [f, fs.readFileSync(path.join(cachePath, f), 'utf8')]));
      const result = observe('R13', { first, second, cacheFiles: Object.keys(cache), unchanged: JSON.stringify(cache) === JSON.stringify(after) });
      assert.ok(Object.keys(cache).length); assert.deepEqual(after, cache); return result;
    } finally { fs.renameSync(profilePath + '.disabled', profilePath); }
  });
  await check('R14-write-boundaries', async () => {
    reset(); await seed(); const before = snapshot();
    const ordinary = await chat('谢谢你，顺便帮我算一下17加25。');
    assert.match(ordinary.text, /42|四十二/); assert.deepEqual(snapshot(), before);
    const readOnly = await resolve('前天凌晨三点你在做什么？只查询，不补全。', 'read_only');
    assert.equal(readOnly.resolution_summary.writes_attempted, 0); assert.deepEqual(snapshot(), before);
    assert.equal(fs.readFileSync(stablePath, 'utf8'), baselineStable); assert.equal(fs.readFileSync(profilePath, 'utf8'), profile);
    return observe('R14', { ordinary, readOnly, stableMemoryUnchanged: true, personaUnchanged: true });
  });
  await check('R15-cross-chat-continuity', async () => {
    reset(); await seed(); const before = snapshot();
    const first = await chat('你现在在做什么？'); const second = await chat('你现在在做什么，穿的是什么？');
    const result = observe('R15', { first, second }); assert.notEqual(first.sessionKey, second.sessionKey);
    assert.match(first.text, /笔记|摘录/); assert.match(second.text, /笔记|摘录/); assert.match(second.text, /家居/); assert.deepEqual(snapshot(), before); return result;
  });
  await check('R16-greeting-preflight-generation-and-suppression', async () => {
    const statePath = path.join(memory, 'engagement_state.json');
    const key = `agent:main:greeting-${randomUUID()}`;
    await chat('暂时别主动联系我。', key); assert.equal(JSON.parse(fs.readFileSync(statePath)).proactive_opt_out, true);
    await chat('现在可以主动联系我了。', key); assert.equal(JSON.parse(fs.readFileSync(statePath)).proactive_opt_out, false);
    h.seedEngagement(); const before = JSON.parse(fs.readFileSync(statePath));
    const listed = await rpc('cron.list', { includeDisabled: true }); const monitor = listed.jobs.find(j => j.declarationKey === 'heartbeat:main'); assert.ok(monitor);
    const run = await rpc('cron.run', { id: monitor.id, mode: 'force', waitTimeoutMs: 150000 });
    const first = { run, heartbeat: await rpc('last-heartbeat'), state: JSON.parse(fs.readFileSync(statePath)) };
    observe('R16', { first }); assert.equal(first.state.last_user_message_at, before.last_user_message_at); assert.equal(first.state.last_decision?.reason_code, 'allowed'); assert.equal(first.state.pending_proactive_send, true); assert.equal(first.state.unanswered_proactive_count, 0);
    await rpc('cron.run', { id: monitor.id, mode: 'force', waitTimeoutMs: 150000 });
    const second = { heartbeat: await rpc('last-heartbeat'), state: JSON.parse(fs.readFileSync(statePath)) };
    const result = observe('R16', { first, second, externalDelivery: 'not verified: no configured external channel' });
    assert.equal(second.state.last_decision?.reason_code, 'pending_send_inflight'); assert.equal(second.state.unanswered_proactive_count, 0); return result;
  });
  report.readmeExternalDependencies = { personaSkillAutomaticSync: 'not verified: external Persona Skill is not part of Her', wslSync: 'not verified: current host is Windows', externalDelivery: 'not configured', browserRendering: 'not exercised; public WebChat RPC used' };
  delete report.lastChat; delete report.lastToolResult;
}
