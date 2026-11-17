/** Session-only match tuning and field telemetry, independent of rendering. */
export type SquadOrder = 'balanced' | 'attack' | 'defend' | 'regroup';
export const FIELD_DEFAULTS = {
  captureGoal: 3, respawnSeconds: 10, pickupSeconds: 10,
  regeneration: false, rapidReload: false, endlessAmmo: false,
  safeJumps: false, fastMovement: false,
};
export type FieldRules = typeof FIELD_DEFAULTS;
export const DISPLAY_DEFAULTS = {
  autoReload: false, scopeSensitivity: 1, leftHanded: false,
  showWeapon: true, showKillfeed: true, showDamage: true, showFps: true,
};
export function reloadDuration(duration: number, rapid: boolean) { return duration * (rapid ? 0.5 : 1); }
export function regeneratedHealth(hp: number, max: number, sinceHit: number, dt: number, enabled: boolean) {
  return enabled && sinceHit >= 5 && hp > 0 && hp < max ? Math.min(max, hp + 10 * dt) : hp;
}
export function floorLabel(playerY: number, targetY: number) { return targetY - playerY > 2 ? 'ABOVE' : playerY - targetY > 2 ? 'BELOW' : 'SAME FLOOR'; }
export function fieldReport(stats: { kills: number; assists: number; damage: number; healing: number; captures: number; returns: number }, deaths: number, seconds: number) {
  return { efficiency: ((stats.kills + stats.assists) / Math.max(1, deaths)).toFixed(2),
    damagePerMinute: Math.round(stats.damage / Math.max(1, seconds / 60)),
    support: Math.round(stats.healing), objectives: stats.captures + stats.returns };
}
export const UPGRADE_LIST = [
  'Softer bot aim', 'True match pause', 'Adjustable bot roster', 'Switch teams',
  'Attack orders', 'Defend orders', 'Regroup orders', 'Capture goal',
  'Respawn timing', 'Pickup timing', 'Health regeneration', 'Rapid reload',
  'Endless ammunition', 'Safe rocket jumps', 'Fast movement', 'Partial auto-reload',
  'Scope sensitivity', 'Left-handed weapons', 'Hide viewmodel', 'Hide killfeed',
  'Hide damage numbers', 'Hide FPS counter', 'Objective distance and floor',
  'Oxygen gauge', 'Stickybomb counter', 'Spawn protection', 'Death recap',
  'Match performance report', 'Building demolition', 'Weapon inspection',
] as const;