import * as fs from 'fs';
import * as path from 'path';
import { writeEpisode } from './write-episode';
import { getHoliday } from '../lib/holidays';

jest.mock('../lib/holidays');

describe('writeEpisode', () => {
  const tempFile = path.join(__dirname, 'mock_memory.md');

  beforeEach(() => {
    (getHoliday as jest.Mock).mockReturnValue(null);
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  });

  afterAll(() => {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  });

  it('rejects missing fields', async () => {
    const res = await writeEpisode({
      timestamp: '2026-03-22T14:30:00',
      location: '',
      action: 'resting',
      emotionTags: ['calm'],
      appearance: 'home clothes',
      filePath: tempFile
    } as any);

    expect(res.success).toBe(false);
    expect(res.error_code).toBe('MISSING_FIELDS');
    expect(res.error).toContain('Missing');
  });

  it('writes memory formatted and computes hooks', async () => {
    const res = await writeEpisode({
      timestamp: '2026-03-22T14:30:00+08:00', // March 22, 2026 is Sunday
      location: 'bedroom',
      action: 'waking up',
      emotionTags: ['sleepy', 'happy'],
      appearance: 'pajamas',
      internalMonologue: 'Need coffee',
      filePath: tempFile,
    });

    expect(res.success).toBe(true);

    const content = fs.readFileSync(tempFile, 'utf8');
    expect(content).toContain('### [14:30:00]');
    expect(content).toContain('- Timestamp: 2026-03-22 14:30:00');
    expect(content).toContain('- Appearance: pajamas');
    expect(content).toContain('- Internal_Monologue: Need coffee');
    expect(content).not.toContain('I just woke up and it feels good.');

    // Hooks
    if (res.world_hooks) {
        expect(res.world_hooks.weekday).toBe(false); // Sunday
        expect(res.world_hooks.holiday_key).toBe(null); // 2026-03-22 is not a holiday
    }
    expect(getHoliday).toHaveBeenCalledWith('2026-03-22', 'CN');
  });

  it('infers US holiday country when timestamp offset is not +08:00', async () => {
    await writeEpisode({
      timestamp: '2026-03-22T14:30:00-05:00',
      location: 'home office',
      action: 'reviewing notes',
      emotionTags: ['focused'],
      appearance: 'hoodie',
      filePath: tempFile,
    });

    expect(getHoliday).toHaveBeenCalledWith('2026-03-22', 'US');
  });

  it('returns noop_existing when the exact episode fingerprint is already present', async () => {
    fs.writeFileSync(
      tempFile,
      `### [14:30:00] waking up...\n\n- Timestamp: 2026-03-22 14:30:00\n- Location: bedroom\n- Action: waking up\n- Emotion_Tags: [sleepy, happy]\n- Appearance: pajamas\n\n`,
      'utf8',
    );

    const res = await writeEpisode({
      timestamp: '2026-03-22T14:30:00+08:00',
      location: 'bedroom',
      action: 'waking up',
      emotionTags: ['sleepy', 'happy'],
      appearance: 'pajamas',
      filePath: tempFile,
    });

    expect(res.success).toBe(true);
    expect(res.outcome).toBe('noop_existing');
    expect(fs.readFileSync(tempFile, 'utf8').match(/### \[/g)?.length).toBe(1);
  });

  it('returns conflict metadata when the same time bucket is already occupied by a different entry', async () => {
    fs.writeFileSync(
      tempFile,
      `### [14:30:00] planning notes...\n\n- Timestamp: 2026-03-22 14:30:00\n- Location: study\n- Action: planning notes\n- Emotion_Tags: [focused]\n- Appearance: home clothes\n\n`,
      'utf8',
    );

    const res = await writeEpisode({
      timestamp: '2026-03-22T14:35:00+08:00',
      location: 'cafe',
      action: 'waiting for coffee',
      emotionTags: ['calm'],
      appearance: 'light jacket',
      filePath: tempFile,
    });

    expect(res.success).toBe(false);
    expect(res.outcome).toBe('conflict');
    expect(res.error_code).toBe('CONFLICT_EXISTS');
    expect(res.recovery_hint).toContain('Inspect the existing daily log entry');
  });

  it('writes Estimated_Duration when provided', async () => {
    const res = await writeEpisode({
      timestamp: '2026-03-22T14:30:00+08:00',
      location: 'bedroom',
      action: 'reading',
      emotionTags: ['calm'],
      appearance: 'pajamas',
      estimatedDurationMinutes: 90,
      filePath: tempFile,
    });

    expect(res.success).toBe(true);
    const content = fs.readFileSync(tempFile, 'utf8');
    expect(content).toContain('- Estimated_Duration: 90');
  });

  it('omits Estimated_Duration when not provided', async () => {
    const res = await writeEpisode({
      timestamp: '2026-03-22T14:30:00+08:00',
      location: 'bedroom',
      action: 'reading',
      emotionTags: ['calm'],
      appearance: 'pajamas',
      filePath: tempFile,
    });

    expect(res.success).toBe(true);
    const content = fs.readFileSync(tempFile, 'utf8');
    expect(content).not.toContain('Estimated_Duration');
  });

  it('auto-generates Event_Id from timestamp', async () => {
    const res = await writeEpisode({
      timestamp: '2026-03-24T09:30:00+08:00',
      location: 'Home study',
      action: 'Reviewing tasks',
      emotionTags: ['calm'],
      appearance: 'light home top',
      filePath: tempFile,
    });

    expect(res.success).toBe(true);
    const content = fs.readFileSync(tempFile, 'utf8');
    expect(content).toContain('- Event_Id: evt-20260324-093000');
  });

  it('uses provided eventId instead of auto-generating', async () => {
    const res = await writeEpisode({
      timestamp: '2026-03-24T09:30:00+08:00',
      location: 'Home study',
      action: 'Reviewing tasks',
      emotionTags: ['calm'],
      appearance: 'light home top',
      eventId: 'evt-custom-id',
      filePath: tempFile,
    });

    expect(res.success).toBe(true);
    const content = fs.readFileSync(tempFile, 'utf8');
    expect(content).toContain('- Event_Id: evt-custom-id');
  });

  it('writes Parent_Event fields referencing event_id', async () => {
    const res = await writeEpisode({
      timestamp: '2026-03-31T08:00:00+08:00',
      location: '北京旧居',
      action: '打包行李',
      emotionTags: ['期待', '忙碌'],
      appearance: '宽松T恤和运动裤',
      estimatedDurationMinutes: 720,
      parentEventTag: 'evt-20260331-060000',
      parentEventPhase: 'packing',
      parentEventProgress: 0.1,
      filePath: tempFile,
    });

    expect(res.success).toBe(true);
    const content = fs.readFileSync(tempFile, 'utf8');
    expect(content).toContain('- Event_Id: evt-20260331-080000');
    expect(content).toContain('- Parent_Event: evt-20260331-060000');
    expect(content).toContain('- Parent_Event_Phase: packing');
    expect(content).toContain('- Parent_Event_Progress: 0.1');
  });

  it('omits Parent_Event fields when not provided but still writes Event_Id', async () => {
    const res = await writeEpisode({
      timestamp: '2026-03-22T14:30:00+08:00',
      location: 'bedroom',
      action: 'reading a book',
      emotionTags: ['calm'],
      appearance: 'pajamas',
      filePath: tempFile,
    });

    expect(res.success).toBe(true);
    const content = fs.readFileSync(tempFile, 'utf8');
    expect(content).toContain('- Event_Id: evt-20260322-143000');
    expect(content).not.toContain('Parent_Event:');
    expect(content).not.toContain('Parent_Event_Phase');
    expect(content).not.toContain('Parent_Event_Progress');
  });

  it('keeps chronological order when a past-time episode is written after a later one', async () => {
    // Write the later episode first
    await writeEpisode({
      timestamp: '2026-03-27T10:47:00+08:00',
      location: '书房',
      action: '处理邮件',
      emotionTags: ['专注', '沉静'],
      appearance: '深灰高领毛衣',
      filePath: tempFile,
    });

    // Write an earlier episode afterwards (simulating a past-time memory insertion)
    const res = await writeEpisode({
      timestamp: '2026-03-27T07:30:00+08:00',
      location: '家里餐桌',
      action: '吃早餐',
      emotionTags: ['平静'],
      appearance: '深灰高领毛衣',
      filePath: tempFile,
    });

    expect(res.success).toBe(true);
    expect(res.outcome).toBe('appended');

    const content = fs.readFileSync(tempFile, 'utf8');
    const idx0730 = content.indexOf('### [07:30:00]');
    const idx1047 = content.indexOf('### [10:47:00]');
    expect(idx0730).toBeGreaterThanOrEqual(0);
    expect(idx1047).toBeGreaterThanOrEqual(0);
    expect(idx0730).toBeLessThan(idx1047);
  });
});
