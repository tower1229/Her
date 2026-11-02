import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { withFileLock, FileLockError } from './lock';
import { commitFile } from './atomic-file';
import { writeEpisode, truncateEpisodeDuration } from './write-episode';
import { commitEpisode } from './commit-episode';
import { parseMemoryFile } from '../lib/parse-memory';

describe('daily log reliability', () => {
  let root: string;
  let file: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'her-store-')); file = path.join(root, '2026-11-01.md'); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  const event = { timestamp: '2026-11-01T09:00:00+08:00', location: 'home', action: 'reading', emotionTags: ['calm'], appearance: 'casual', estimatedDurationMinutes: 120, eventId: 'evt-one', legacyLogTimezone: 'Asia/Shanghai' };

  it('preserves the owner lock when a contender fails and does not remap callback errors', async () => {
    await withFileLock(file, async () => {
      const token = fs.readFileSync(`${file}.lock`, 'utf8');
      await expect(withFileLock(file, async () => {})).rejects.toBeInstanceOf(FileLockError);
      expect(fs.readFileSync(`${file}.lock`, 'utf8')).toBe(token);
    });
    const error = Object.assign(new Error('callback failure'), { code: 'EEXIST' });
    await expect(withFileLock(file, async () => { throw error; })).rejects.toBe(error);
    expect(fs.existsSync(`${file}.lock`)).toBe(false);
  });

  it('does not release a replacement lock', async () => {
    await withFileLock(file, async () => { fs.writeFileSync(`${file}.lock`, 'another-owner'); });
    expect(fs.readFileSync(`${file}.lock`, 'utf8')).toBe('another-owner');
  });

  it('preserves BOM, CRLF, ordinary notes, unknown fields and narrative while inserting in order', async () => {
    const original = '\uFEFF# Notes\r\n原始笔记\r\n\r\n### [11:00:00]\r\n- Timestamp: 2026-11-01 11:00:00\r\n- Action: lunch\r\n- Custom: keep\r\n正文保留。\r\n';
    fs.writeFileSync(file, original);
    expect((await writeEpisode({ ...event, filePath: file })).success).toBe(true);
    const actual = fs.readFileSync(file, 'utf8');
    expect(actual.startsWith('\uFEFF# Notes\r\n原始笔记')).toBe(true);
    expect(actual.endsWith(original.slice(original.indexOf('###')))).toBe(true);
    expect(actual.indexOf('### [09:00:00]')).toBeLessThan(actual.indexOf('### [11:00:00]'));
    expect(actual.replace(/\r\n/g, '')).not.toContain('\n');
    expect(parseMemoryFile(actual)[0].timestamp).toBe(event.timestamp);
  });

  it('only changes the duration field and rejects duplicate event identities', async () => {
    await writeEpisode({ ...event, filePath: file });
    fs.appendFileSync(file, '\nUnmanaged text and metadata.\n');
    const before = fs.readFileSync(file, 'utf8');
    expect(await truncateEpisodeDuration(file, event.eventId, '2026-11-01T09:30:00+08:00', 'UTC')).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).toBe(before.replace('Estimated_Duration: 120', 'Estimated_Duration: 30'));
    fs.appendFileSync(file, before);
    const duplicate = fs.readFileSync(file, 'utf8');
    expect(await truncateEpisodeDuration(file, event.eventId, '2026-11-01T09:45:00+08:00')).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe(duplicate);
  });

  it('refuses stale snapshots and removes its temporary file', () => {
    fs.writeFileSync(file, 'user edit');
    expect(() => commitFile(file, 'old snapshot', 'plugin edit')).toThrow('changed before commit');
    expect(fs.readFileSync(file, 'utf8')).toBe('user edit');
    expect(fs.readdirSync(root)).toEqual(['2026-11-01.md']);
  });

  it('commits same-file interruption together and makes failed truncation leave no new event', async () => {
    await writeEpisode({ ...event, filePath: file });
    const input = { ...event, eventId: 'evt-two', timestamp: '2026-11-01T09:30:00+08:00', action: 'walking', filePath: file };
    const original = fs.readFileSync(file, 'utf8');
    const failed = await commitEpisode(input, { writer: writeEpisode, rootPath: root, truncate: { filePath: file, eventId: 'missing', timestamp: input.timestamp } });
    expect(failed.result.success).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe(original);
    const success = await commitEpisode(input, { writer: writeEpisode, rootPath: root, truncate: { filePath: file, eventId: event.eventId, timestamp: input.timestamp } });
    expect(success.truncated).toBe(true);
    const events = parseMemoryFile(fs.readFileSync(file, 'utf8'));
    expect(events).toHaveLength(2);
    expect(events[0].estimatedDurationMinutes).toBe(30);
  });

  it('cleans its temp file after rename failure and keeps the old log', async () => {
    fs.writeFileSync(file, 'original');
    const rename = jest.spyOn(require('fs') as typeof fs, 'renameSync').mockImplementation(() => { throw new Error('rename failed'); });
    try { expect(() => commitFile(file, 'original', 'new')).toThrow('rename failed'); }
    finally { rename.mockRestore(); }
    expect(fs.readFileSync(file, 'utf8')).toBe('original');
    expect(fs.readdirSync(root)).toEqual(['2026-11-01.md']);
  });

  it('rechecks same-file truncation on an idempotent retry', async () => {
    await writeEpisode({ ...event, filePath: file });
    const input = { ...event, eventId: 'evt-two', timestamp: '2026-11-01T10:00:00+08:00', action: 'walking', filePath: file };
    await writeEpisode(input);
    const result = await commitEpisode(input, { writer: writeEpisode, rootPath: root, truncate: { filePath: file, eventId: event.eventId, timestamp: input.timestamp } });
    expect(result.result.outcome).toBe('noop_existing');
    expect(result.truncated).toBe(true);
    expect(parseMemoryFile(fs.readFileSync(file, 'utf8'))[0].estimatedDurationMinutes).toBe(60);
  });

  it('locks both dates for cross-day transitions and reports partial truncation failure', async () => {
    await writeEpisode({ ...event, timestamp: '2026-11-01T23:30:00+08:00', filePath: file });
    const tomorrow = path.join(root, '2026-11-02.md');
    const input = { ...event, timestamp: '2026-11-02T00:15:00+08:00', action: 'walking', eventId: 'two', filePath: tomorrow };
    const writer = jest.fn(async (value) => {
      expect(fs.existsSync(`${file}.lock`)).toBe(true);
      expect(fs.existsSync(`${tomorrow}.lock`)).toBe(true);
      return writeEpisode(value);
    });
    const result = await commitEpisode(input, { writer, rootPath: root, truncate: { filePath: file, eventId: event.eventId, timestamp: input.timestamp } });
    expect(result.truncated).toBe(true);
    expect(parseMemoryFile(fs.readFileSync(file, 'utf8'))[0].estimatedDurationMinutes).toBe(45);
    const partial = await commitEpisode(input, { writer, rootPath: root, truncate: { filePath: file, eventId: 'missing', timestamp: input.timestamp } });
    expect(partial.result.success).toBe(true);
    expect(partial.truncated).toBe(false);
  });

  it('keeps the new write and reports truncate_error when cross-day truncation throws', async () => {
    await writeEpisode({ ...event, timestamp: '2026-11-01T23:30:00+08:00', filePath: file });
    const tomorrow = path.join(root, '2026-11-02.md');
    const input = { ...event, timestamp: '2026-11-02T00:15:00+08:00', action: 'walking', eventId: 'two', filePath: tomorrow };
    const fsModule = require('fs') as typeof fs;
    const originalRename = fsModule.renameSync.bind(fsModule);
    const rename = jest.spyOn(fsModule, 'renameSync');
    let count = 0;
    rename.mockImplementation((...args: Parameters<typeof fs.renameSync>) => {
      count += 1;
      if (count > 1) throw new Error('disk full');
      return originalRename(...args);
    });
    try {
      const result = await commitEpisode(input, { writer: writeEpisode, rootPath: root, truncate: { filePath: file, eventId: event.eventId, timestamp: input.timestamp } });
      expect(result.result.success).toBe(true);
      expect(result.truncated).toBe(false);
      expect(result.result.error_code).toBeUndefined();
      expect(result.result.error).toBeUndefined();
      expect(result.truncate_error).toBe('disk full');
      expect(fs.existsSync(tomorrow)).toBe(true);
      expect(parseMemoryFile(fs.readFileSync(file, 'utf8'))[0].estimatedDurationMinutes).toBe(120);
    } finally {
      rename.mockRestore();
    }
  });

  it('rejects a different directory with the same basename and records offsets for naive new entries', async () => {
    const escaped = await commitEpisode({ ...event, filePath: file }, { writer: writeEpisode, rootPath: path.join(root, 'other') });
    expect(escaped.result.success).toBe(false);
    expect(fs.existsSync(file)).toBe(false);
    await writeEpisode({ ...event, timestamp: '2026-11-01 09:00:00', filePath: file });
    expect(fs.readFileSync(file, 'utf8')).toContain('timeline:timestamp=2026-11-01T09:00:00+08:00');
    expect(await truncateEpisodeDuration(file, event.eventId, '2026-11-01T08:59:59+08:00')).toBe(false);
  });
});
