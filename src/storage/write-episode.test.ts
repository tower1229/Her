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
});
