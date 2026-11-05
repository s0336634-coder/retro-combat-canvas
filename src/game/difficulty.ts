export const BOT_DIFFICULTIES = {
  easy: { label: 'Easy', aimError: 1.1, sniperAimError: 0.3, sniperMissChance: 0.5, reactionTime: 0.55, thinkInterval: 0.35, turnSpeed: 0.7, objectivePressure: 0.65 },
  normal: { label: 'Normal', aimError: 0.45, sniperAimError: 0.12, sniperMissChance: 0.28, reactionTime: 0.2, thinkInterval: 0.25, turnSpeed: 1, objectivePressure: 1 },
  hard: { label: 'Hard', aimError: 0.2, sniperAimError: 0.06, sniperMissChance: 0.15, reactionTime: 0.1, thinkInterval: 0.15, turnSpeed: 1.2, objectivePressure: 2 },
} as const;

export type BotDifficulty = keyof typeof BOT_DIFFICULTIES;
export const DIFFICULTY_ORDER: BotDifficulty[] = ['easy', 'normal', 'hard'];

export function botReactionTime(difficulty: BotDifficulty, sniper = false, hurt = false) {
  return BOT_DIFFICULTIES[difficulty].reactionTime * (sniper ? 1.25 : 1) * (hurt ? 0.75 : 1);
}

export function botAimError(difficulty: BotDifficulty, sniper: boolean, roll: number) {
  const preset = BOT_DIFFICULTIES[difficulty];
  return sniper ? (roll < preset.sniperMissChance ? 4.5 : preset.sniperAimError) : preset.aimError;
}

export function objectiveUtility(difficulty: BotDifficulty, base: number, carrying: boolean) {
  return carrying ? base : base * BOT_DIFFICULTIES[difficulty].objectivePressure;
}