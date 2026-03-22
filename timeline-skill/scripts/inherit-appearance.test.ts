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

  it('inherits appearance correctly from earlier episode', () => {
    const res = resolveAppearance(dummyEpisodes, 'reading a book', 'casual clothes');
    expect(res.appearance).toBe('pajamas'); // Should inherit from single episode
    expect(res.overridden).toBe(false);
  });

  it('overwrites appearance when there are change signals (e.g. gym)', () => {
    const res = resolveAppearance(dummyEpisodes, 'going to gym', 'sportswear');
    expect(res.appearance).toBe('sportswear');
    expect(res.overridden).toBe(true);
    expect(res.reason).toContain('gym');
  });

  it('applies default inference and overrides when no previous anchor found', () => {
    const emptyEpisodes: ParsedEpisode[] = [];
    const res = resolveAppearance(emptyEpisodes, 'running in the park', 'sportswear');
    expect(res.appearance).toBe('sportswear');
    expect(res.overridden).toBe(true);
  });
});
