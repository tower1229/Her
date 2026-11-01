// Isolated feasibility probe. Uses installed upstream pure helpers, never user memory.
// node scripts/probe-shared-memory.mjs <openclaw-package-root>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const root = path.resolve(process.argv[2] || 'missing-openclaw-path');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(pkg.version, '2026.10.9', 'Probe is pinned to this host version');
const dist = path.join(root, 'dist');
function sourceFile(prefix, requiredText) {
  const files = fs.readdirSync(dist).filter(n => n.startsWith(prefix) && n.endsWith('.mjs'));
  const name = files.find(n => fs.readFileSync(path.join(dist, n), 'utf8').includes(requiredText));
  assert.ok(name, `Upstream implementation not found: ${prefix}`);
  return path.join(dist, name);
}
const chunkFile = sourceFile('markdown-chunks-', 'function chunkMarkdown(');
const blockFile = sourceFile('memory-host-markdown-', 'function replaceManagedMarkdownBlock(');
const phaseFile = sourceFile('dreaming-phases-', 'function buildDailySnippetChunks(');
const headingFile = sourceFile('dreaming-dreams-file-', 'function isGenericDailyHeading(');
const sessionFile = sourceFile('session-ingestion-', 'const DAILY_MEMORY_FILENAME_RE =');
const utfFile = sourceFile('utf16-slice-', 'function truncateUtf16Safe(');
const storageFile = sourceFile('engine-storage-', 'async function listMemoryFiles(');
const { p: listMemoryFiles } = await import(pathToFileURL(storageFile));
const { n: chunkMarkdown } = await import(pathToFileURL(chunkFile));
const { t: replaceManagedMarkdownBlock } = await import(pathToFileURL(blockFile));
const { r: truncateUtf16Safe } = await import(pathToFileURL(utfFile));
// Extract the actual pure parser verbatim, avoiding initialization of host services.
// This validates candidate extraction, not a model-driven dreaming sweep.
const phase = fs.readFileSync(phaseFile, 'utf8');
const heading = fs.readFileSync(headingFile, 'utf8');
const session = fs.readFileSync(sessionFile, 'utf8');
const parserCode = [
  heading.match(/^const GENERIC_DAY_HEADING_RE = .*;$/m)[0],
  session.match(/^const DAILY_MEMORY_FILENAME_RE = .*;$/m)[0],
  heading.slice(heading.indexOf('function isGenericDailyHeading('), heading.indexOf('function normalizeSnippet(')),
  phase.slice(phase.indexOf('const DAILY_INGESTION_SCORE'), phase.indexOf('function resolveDailyFileProvenance(')),
  'buildDailySnippetChunks',
].join('\n');
const parseDaily = vm.runInNewContext(parserCode, { truncateUtf16Safe }, { timeout: 1000 });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'her-shared-memory-'));
const results = {};
try {
  const file = path.join(temp, '2026-11-01.md');
  const original = '# Daily\r\n\r\n普通笔记：用户偏好简洁回答。\r\n';
  const require = createRequire(import.meta.url);
  const { writeEpisode } = require('../dist/src/storage/write-episode.js');
  fs.writeFileSync(file, original);
  const write = await writeEpisode({ timestamp: '2026-11-01T09:00:00+08:00', location: 'home', action: 'Read a book', emotionTags: ['calm'], appearance: 'casual', filePath: file });
  results.currentWriter = { success: write.success, ordinaryTextPreserved: fs.readFileSync(file, 'utf8').includes('用户偏好') };
  assert.equal(results.currentWriter.ordinaryTextPreserved, false);

  const event = '\n<!-- timeline:event:evt-probe -->\n### 模拟经历 evt-probe\n- [模拟经历 evt-probe] 在虚构的花园里阅读了一本小说。\n<!-- /timeline:event:evt-probe -->\n';
  fs.writeFileSync(file, original);
  fs.appendFileSync(file, event);
  const afterAppend = fs.readFileSync(file, 'utf8');
  assert.ok(afterAppend.startsWith(original));
  const update = text => replaceManagedMarkdownBlock({ original: text, heading: '## Light Sleep', startMarker: '<!-- openclaw:dreaming:light:start -->', endMarker: '<!-- openclaw:dreaming:light:end -->', body: '- A generated phase summary.' });
  results.serialManagedWrite = { ordinaryTextPreserved: update(afterAppend).includes('用户偏好'), eventPreserved: update(afterAppend).includes('evt-probe') };
  assert.ok(results.serialManagedWrite.eventPreserved);
  // Deterministic interleaving: host snapshots A, Her appends B, host replaces using A.
  const staleHostSnapshot = original;
  fs.writeFileSync(file, update(staleHostSnapshot));
  results.nonCooperatingRace = { eventPreserved: fs.readFileSync(file, 'utf8').includes('evt-probe'), kind: 'controlled read/append/replace schedule; not a running Gateway' };
  assert.equal(results.nonCooperatingRace.eventPreserved, false);

  const fields = '### 09:00\n- Source_Type: simulated\n- Event_Id: evt-fields\n- Action: I visited the fictional Moon Garden and read a novel.\n';
  const fieldsChunks = parseDaily(fields.split('\n'), 100);
  const action = fieldsChunks.find(c => c.snippet.includes('Action:'));
  assert.ok(action);
  results.separateFields = { actionSnippet: action.snippet, retainsSource: action.snippet.includes('simulated'), retainsId: action.snippet.includes('evt-fields') };
  assert.equal(results.separateFields.retainsSource, false);
  const labeled = '### 模拟经历 evt-safe\n- [模拟经历 evt-safe] 在虚构的月光花园里阅读小说。\n- [模拟经历 evt-safe] 随后在花园长椅上休息。\n';
  const candidates = parseDaily(labeled.split('\n'), 100);
  results.selfContainedClaims = { candidates: candidates.map(c => c.snippet), allRetainSourceAndId: candidates.every(c => c.snippet.includes('模拟经历') && c.snippet.includes('evt-safe')) };
  assert.ok(results.selfContainedClaims.allRetainSourceAndId);
  const long = '### 模拟经历 evt-long\n' + Array.from({ length: 100 }, (_, i) => `第${i}段：我在月光花园阅读小说，随后整理了书架并在窗边休息。`).join('\n');
  const chunks = chunkMarkdown(long, { tokens: 400, overlap: 80 });
  results.longSearchChunks = { total: chunks.length, withoutSource: chunks.filter(c => !c.text.includes('模拟经历')).length };
  assert.ok(results.longSearchChunks.withoutSource > 0);
  const searchSafe = chunkMarkdown(labeled, { tokens: 400, overlap: 80 });
  results.shortSearchChunk = { retainsSourceAndId: searchSafe.every(c => c.text.includes('模拟经历') && c.text.includes('evt-safe')) };
  const memoryDir = path.join(temp, 'memory');
  const eventRelative = 'memory/timeline/simulated/2026-11-01/evt-safe.md';
  const eventFile = path.join(temp, eventRelative);
  fs.mkdirSync(path.dirname(eventFile), { recursive: true });
  fs.writeFileSync(path.join(memoryDir, '2026-11-01.md'), original);
  fs.writeFileSync(eventFile, labeled, { flag: 'wx' });
  const indexedPaths = (await listMemoryFiles(temp)).map(p => path.relative(temp, p).replaceAll('\\', '/'));
  assert.ok(indexedPaths.includes(eventRelative));
  assert.ok(indexedPaths.includes('memory/2026-11-01.md'));
  const pathPredicateCode = [
    ...['SHORT_TERM_PATH_RE', 'DREAMING_MEMORY_PATH_RE', 'SHORT_TERM_SESSION_CORPUS_RE', 'SHORT_TERM_BASENAME_RE'].map(name => heading.match(new RegExp(`^const ${name} = .*;$`, 'm'))[0]),
    heading.slice(heading.indexOf('function normalizeMemoryPath('), heading.indexOf('function buildClaimHash(')),
    heading.slice(heading.indexOf('function isShortTermMemoryPath('), heading.indexOf('function isShortTermSessionCorpusPath(')),
    'isShortTermMemoryPath',
  ].join('\n');
  const isPromotionPath = vm.runInNewContext(pathPredicateCode, {}, { timeout: 1000 });
  results.partitionedFiles = {
    indexedPaths,
    ordinaryDailyPromotionEligible: isPromotionPath('memory/2026-11-01.md'),
    eventPromotionEligible: isPromotionPath(eventRelative),
    datedEventFilenamePromotionEligible: isPromotionPath('memory/timeline/2026-11-01-evt-safe.md'),
  };
  assert.equal(results.partitionedFiles.eventPromotionEligible, false);
  assert.equal(results.partitionedFiles.datedEventFilenamePromotionEligible, true);
  const beforeUserEdit = fs.readFileSync(eventFile, 'utf8');
  fs.writeFileSync(eventFile, beforeUserEdit + '\n用户手工补充的内容。\n');
  fs.writeFileSync(path.join(path.dirname(eventFile), 'detail-safe.md'), '[模拟经历 evt-safe] 新增一致细节。', { flag: 'wx' });
  fs.writeFileSync(path.join(memoryDir, '2026-11-01.md'), update(original));
  results.partitionedFiles.manualEditPreservedDuringOtherWrites = fs.readFileSync(eventFile, 'utf8').includes('用户手工补充');
  assert.ok(results.partitionedFiles.manualEditPreservedDuringOtherWrites);
  assert.throws(() => fs.writeFileSync(eventFile, 'overwrite', { flag: 'wx' }), { code: 'EEXIST' });
  console.log(JSON.stringify({ host: pkg.version, evidence: [chunkFile, blockFile, phaseFile].map(f => ({ file: path.basename(f), sha256: createHash('sha256').update(fs.readFileSync(f)).digest('hex') })), results }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
