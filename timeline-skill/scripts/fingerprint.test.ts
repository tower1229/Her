import { computeFingerprint, checkReadOnlyHit } from './fingerprint';
import { ParsedEpisode } from './types';

describe('fingerprint', () => {
  it('should compute fingerprint string correctly', () => {
    const f1 = computeFingerprint('2026-03-22', '家里书房靠窗的桌子', '把最近的零碎念头整理进 Obsidian 的第二大脑', '2026-03-22 14:35:00');
    expect(f1).toBe('20260322|家里书房靠窗的桌子|把最近的零碎念头整理进obsidian的第二大脑|14:30');
  });

  it('should treat times within same 30-min bucket as same fingerprint', () => {
    const ep: ParsedEpisode = {
      timestamp: '2026-03-22 14:40:00',
      location: '书房',
      action: '读书',
      emotionTags: ['平静'],
      appearance: '睡衣',
      parseLevel: 'A',
      confidence: 1.0,
    };
    
    // Check with 14:50 (same 30-min bucket)
    const resultHit = checkReadOnlyHit([ep], {
      date: '2026-03-22',
      location: '书 房', // test spacing normalisation
      action: '读 书',
      timestamp: '2026-03-22 14:50:00'
    });
    expect(resultHit.hit).toBe(true);
    expect(resultHit.matchedEpisode).toBe(ep);

    // Check with 15:10 (different 30-min bucket)
    const resultMiss = checkReadOnlyHit([ep], {
      date: '2026-03-22',
      location: '书房',
      action: '读书',
      timestamp: '2026-03-22 15:10:00'
    });
    expect(resultMiss.hit).toBe(false);
  });
});
