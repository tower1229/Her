import * as fs from 'fs';
import * as path from 'path';
import { writeEpisode } from './write-episode';
import { getHoliday } from '../lib/holidays';

jest.mock('../lib/holidays');

describe('writeEpisode', () => {
  const tempFile = path.join(__dirname, 'mock_memory.md');
  const tempLog = path.join(__dirname, '.timeline-run.log');

  beforeEach(() => {
    (getHoliday as jest.Mock).mockReturnValue(null);
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    if (fs.existsSync(tempLog)) fs.unlinkSync(tempLog);
  });

  afterAll(() => {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    if (fs.existsSync(tempLog)) fs.unlinkSync(tempLog);
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
      naturalText: 'I just woke up and it feels good.',
      filePath: tempFile,
      windowPreset: 'now_today'
    });

    expect(res.success).toBe(true);

    const content = fs.readFileSync(tempFile, 'utf8');
    expect(content).toContain('### [14:30:00] waking up...');
    expect(content).toContain('- Timestamp: 2026-03-22 14:30:00');
    expect(content).toContain('- Appearance: pajamas');
    expect(content).toContain('- Internal_Monologue: Need coffee');
    expect(content).toContain('I just woke up and it feels good.');

    // Hooks
    if (res.world_hooks) {
        expect(res.world_hooks.weekday).toBe(false); // Sunday
        expect(res.world_hooks.holiday_key).toBe(null); // 2026-03-22 is not a holiday
    }

    const logContent = fs.readFileSync(tempLog, 'utf8');
    expect(logContent).toContain('"mode":"generated_new"');
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
});
