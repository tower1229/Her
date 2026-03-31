export const ACTIVITY_MODES = [
  'sleep',
  'bath',
  'meal',
  'work_or_study',
  'commute',
  'exercise',
  'social',
  'shopping',
  'leisure',
  'domestic',
  'errands',
  'transition',
  'rest',
  'unknown',
] as const;

export type ActivityMode = typeof ACTIVITY_MODES[number];

export const CONTINUITY_RELATIONS = [
  'same_day_continuation',
  'same_scene_continuation',
  'shifted_scene',
  'return_home',
  'fresh_moment',
  'unknown',
] as const;

export type ContinuityRelation = typeof CONTINUITY_RELATIONS[number];

export const APPEARANCE_TRANSITIONS = [
  'inherit',
  'change_required',
  'change_allowed',
  'unknown',
] as const;

export type AppearanceTransition = typeof APPEARANCE_TRANSITIONS[number];

export const OUTFIT_MODES = [
  'casual_home',
  'casual_outing',
  'workwear',
  'sportswear',
  'sleepwear',
  'bathrobe',
  'dressed_up',
  'fresh_purchase',
  'unknown',
] as const;

export type OutfitMode = typeof OUTFIT_MODES[number];

export interface SceneSemantics {
  activityMode: ActivityMode;
  continuityRelation: ContinuityRelation;
  rationale: string;
  estimatedDurationMinutes?: number;
  parentEventTag?: string;
  parentEventPhase?: string;
  parentEventProgress?: number;
}

export interface AppearanceLogic {
  transition: AppearanceTransition;
  changeReason: string;
  outfitMode: OutfitMode;
}

function includesValue<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value);
}

export function isActivityMode(value: unknown): value is ActivityMode {
  return typeof value === 'string' && includesValue(ACTIVITY_MODES, value);
}

export function isContinuityRelation(value: unknown): value is ContinuityRelation {
  return typeof value === 'string' && includesValue(CONTINUITY_RELATIONS, value);
}

export function isAppearanceTransition(value: unknown): value is AppearanceTransition {
  return typeof value === 'string' && includesValue(APPEARANCE_TRANSITIONS, value);
}

export function isOutfitMode(value: unknown): value is OutfitMode {
  return typeof value === 'string' && includesValue(OUTFIT_MODES, value);
}
