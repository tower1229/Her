import { resolveAppearance } from './inherit-appearance';
import { ParsedEpisode } from './types';

describe('resolveAppearance', () => {
  const dummyEpisodes: ParsedEpisode[] = [
    {
      timestamp: '2026-03-22 08:00:00',
      location: 'bedroom',
      action: 'waking up',
      emotionTags: ['sleepy'],
      appearance: 'pajamas',
      parseLevel: 'A',
      confidence: 1.0
    }
  ];

  it('inherits appearance from the latest known same-day episode', () => {
    const res = resolveAppearance(dummyEpisodes, 'casual clothes');
    expect(res.appearance).toBe('pajamas');
    expect(res.overridden).toBe(false);
    expect(res.transition).toBe('unknown');
  });

  it('keeps the LLM-provided appearance when no earlier same-day appearance exists', () => {
    const emptyEpisodes: ParsedEpisode[] = [];
    const res = resolveAppearance(emptyEpisodes, 'sportswear');
    expect(res.appearance).toBe('sportswear');
    expect(res.overridden).toBe(true);
    expect(res.reason).toContain('LLM-provided');
  });

  it('keeps the generated appearance when scene semantics require an outfit change', () => {
    const res = resolveAppearance(dummyEpisodes, 'sportswear', {
      transition: 'change_required',
      changeReason: 'exercise',
      outfitMode: 'sportswear',
    });

    expect(res.appearance).toBe('sportswear');
    expect(res.overridden).toBe(true);
    expect(res.reason).toContain('transition required');
    expect(res.sourceEpisodeTimestamp).toBe('2026-03-22 08:00:00');
  });
});
