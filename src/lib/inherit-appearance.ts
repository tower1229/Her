import { ParsedEpisode } from './types';

export function resolveAppearance(
  dayEpisodes: ParsedEpisode[],
  defaultAppearance: string,
): { appearance: string; overridden: boolean; reason: string } {
  const latestKnownAppearance = [...dayEpisodes]
    .reverse()
    .find((episode) => episode.appearance && episode.appearance !== 'unknown')
    ?.appearance;

  if (latestKnownAppearance) {
    return {
      appearance: latestKnownAppearance,
      overridden: false,
      reason: 'inherited from latest known same-day appearance',
    };
  }

  return {
    appearance: defaultAppearance,
    overridden: true,
    reason: 'no prior same-day appearance found; kept the LLM-provided appearance',
  };
}
