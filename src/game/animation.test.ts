import { describe, expect, it } from 'vitest';
import { reloadProgress, weaponPose } from './animation';

describe('reload progress', () => {
  it('reports elapsed fraction and clamps completed reloads', () => {
    expect(reloadProgress(1, 2)).toBe(0.5);
    expect(reloadProgress(-1, 2)).toBe(1);
    expect(reloadProgress(4, 2)).toBe(0);
    expect(reloadProgress(0, 0)).toBe(0);
  });
});
describe('weapon motion', () => {
  it('returns to rest after a melee swing', () => {
    expect(weaponPose(0, 0, true, 0, 0, false).rx).toBe(0);
    expect(weaponPose(0.5, 0, true, 0, 0, false).rx).toBe(-1.1);
  });
  it('disables walking bob with reduced motion', () => {
    expect(weaponPose(0, 0, false, 8, 1, false).y).toBe(0);
    expect(weaponPose(0, 0, false, 8, 1, true).y).not.toBe(0);
  });
});