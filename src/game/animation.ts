/** Rendering-only motion curves; no simulation or renderer dependencies. */
export const MOTION = { recoilDecay: 9, swayDamping: 12, strideRate: 2.6 };

export function weaponPose(kick: number, reload: number, melee: boolean, speed: number, time: number, motion = true) {
  const swing = Math.sin(Math.min(1, Math.max(0, kick)) * Math.PI);
  const reloadArc = Math.sin(Math.min(1, Math.max(0, reload)) * Math.PI);
  const bob = motion ? Math.sin(time * 9) * Math.min(speed / 8, 1) : 0;
  return {
    x: melee ? swing * -0.13 : bob * 0.012,
    y: -reloadArc * 0.18 + (motion ? Math.abs(bob) * 0.014 + Math.sin(time * 1.8) * 0.003 : 0),
    z: melee ? -swing * 0.18 : kick * 0.14 + reloadArc * 0.08,
    rx: melee ? -swing * 1.1 : kick * 0.17 - reloadArc * 0.4,
    ry: melee ? swing * 0.6 : 0,
    rz: melee ? -swing * 0.9 : reloadArc * -0.55 + bob * 0.012,
  };
}

export function reloadProgress(remaining: number, duration: number) {
  return duration > 0 ? Math.max(0, Math.min(1, 1 - remaining / duration)) : 0;
}