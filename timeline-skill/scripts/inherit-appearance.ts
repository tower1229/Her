import { ParsedEpisode } from './types';

export const OUTFIT_CHANGE_SIGNALS: Record<string, string[]> = {
  sport: ['gym', 'swim', 'run', '运动', '健身', '跑步', '锻炼', '瑜伽'],
  formal: ['formal', 'wedding', 'dinner', '正装', '晚宴', '面试', '酒会'],
  wakeup: ['wake up', '起床', '刚起', 'morning routine'],
  bath: ['shower', 'bath', '洗澡', '换衣', '浴袍', '沐浴', '泡澡'],
  sleep: ['sleep', 'bedtime', '睡觉', '就寝', '睡衣', '晚安'],
  shopping: ['shopping', 'try on', '购物', '逛街', '买衣服', '试穿', '换装'],
  home: ['home', 'relax', '回家', '换便装', '居家服', '休息', '葛优瘫']
};

export function resolveAppearance(
  dayEpisodes: ParsedEpisode[],
  newAction: string,
  defaultInference: string // Fallback generated via LLM inference
): { appearance: string; overridden: boolean; reason: string } {
  let anchorAppearance: string | null = null;

  // Find the earliest episode that is not "unknown"
  // Assuming episodes are chronologically sorted (or we can just find the earliest timestamp)
  for (const ep of dayEpisodes) {
    if (ep.appearance !== 'unknown') {
      anchorAppearance = ep.appearance;
      break;
    }
  }

  // Check outfit change keywords
  for (const [category, keywords] of Object.entries(OUTFIT_CHANGE_SIGNALS)) {
    for (const keyword of keywords) {
      if (newAction.toLowerCase().includes(keyword.toLowerCase())) {
        return {
          appearance: defaultInference,
          overridden: true,
          reason: `action contains change signal [${keyword}] for category [${category}]`
        };
      }
    }
  }

  if (anchorAppearance) {
    return {
      appearance: anchorAppearance,
      overridden: false,
      reason: 'inherited from day anchor'
    };
  }

  return {
    appearance: defaultInference,
    overridden: true,
    reason: 'no anchor found; applied default inference'
  };
}
