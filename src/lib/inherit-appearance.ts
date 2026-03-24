import { ParsedEpisode } from './types';
import { AppearanceLogic } from './timeline_semantics';

export function resolveAppearance(
  dayEpisodes: ParsedEpisode[],
  defaultAppearance: string,
  appearanceLogic?: AppearanceLogic,
): {
  appearance: string;
  overridden: boolean;
  reason: string;
  sourceEpisodeTimestamp?: string;
  transition: string;
  outfitMode: string;
  changeReason: string;
} {
  const latestKnownEpisode = [...dayEpisodes]
    .reverse()
    .find((episode) => episode.appearance && episode.appearance !== 'unknown');
  const latestKnownAppearance = latestKnownEpisode?.appearance;
  const transition = appearanceLogic?.transition || 'unknown';
  const outfitMode = appearanceLogic?.outfitMode || 'unknown';
  const changeReason = appearanceLogic?.changeReason || 'unspecified';

  if (transition === 'change_required') {
    return {
      appearance: defaultAppearance,
      overridden: true,
      reason: latestKnownAppearance
        ? 'explicit appearance transition required by generated scene semantics'
        : 'explicit appearance transition required and no prior same-day appearance was available',
      sourceEpisodeTimestamp: latestKnownEpisode?.timestamp,
      transition,
      outfitMode,
      changeReason,
    };
  }

  if (latestKnownAppearance) {
    return {
      appearance: latestKnownAppearance,
      overridden: false,
      reason: transition === 'change_allowed'
        ? 'kept the latest known same-day appearance because no forced outfit change was required'
        : 'inherited from latest known same-day appearance',
      sourceEpisodeTimestamp: latestKnownEpisode?.timestamp,
      transition,
      outfitMode,
      changeReason,
    };
  }

  return {
    appearance: defaultAppearance,
    overridden: true,
    reason: 'no prior same-day appearance found; kept the LLM-provided appearance',
    transition,
    outfitMode,
    changeReason,
  };
}
