/** Match additions independent of React and WebGL. */
import { DISPLAY_DEFAULTS } from './operations';
export type MatchMode = 'classic' | 'melee' | 'lowGravity';
export const MATCH_MODES = { classic: { label: 'Classic', gravity: 1 }, melee: { label: 'Melee only', gravity: 1 }, lowGravity: { label: 'Low gravity', gravity: 0.45 } };
export const DEFAULT_PREFERENCES = { ...DISPLAY_DEFAULTS, emptySwitch: false, toggleCrouch: false, invertY: false, fov: 80, weaponBob: true, hudScale: 1, crosshair: 'cross' as 'cross' | 'dot' | 'ring', minimap: true };
export type Preferences = typeof DEFAULT_PREFERENCES;
export function cycleSlot(slot: number, direction: number, count: number) { return count > 0 ? (slot + Math.sign(direction) + count) % count : 0; }
export function availableSlot(weapons: { clip: number; def: { clip: number } }[], slot: number) {
  return weapons.findIndex((w, i) => i !== slot && (w.def.clip === 0 || w.clip > 0));
}
export function assistEligible(hitTime: number, now: number, attacker: number, killer: number, victim: number) { return now - hitTime <= 8 && now >= hitTime && attacker !== killer && attacker !== victim; }
export type MatchStats = { assists: number; captures: number; returns: number; healing: number; damage: number; kills: number };
export const freshStats = (): MatchStats => ({ assists: 0, captures: 0, returns: 0, healing: 0, damage: 0, kills: 0 });
export const CHALLENGES = [
  { id: 'kills', label: 'Frontline', target: 5 },
  { id: 'damage', label: 'Firepower', target: 1000 },
  { id: 'captures', label: 'Courier', target: 1 },
] as const;
export function earnedMedals(stats: MatchStats) {
  return [stats.kills >= 5 && 'Frontline', stats.assists >= 3 && 'Wingman', stats.captures >= 1 && 'Courier', stats.returns >= 1 && 'Guardian', stats.healing >= 500 && 'Lifesaver'].filter((x): x is string => Boolean(x));
}