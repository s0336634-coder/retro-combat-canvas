import { describe, expect, it } from 'vitest';
import { FIELD_DEFAULTS, UPGRADE_LIST, reloadDuration, regeneratedHealth, floorLabel, fieldReport } from './operations';
describe('field operations', () => {
  it('contains exactly thirty distinct upgrades', () => { expect(new Set(UPGRADE_LIST).size).toBe(30); });
  it('retains classic capture, respawn and pickup defaults', () => { expect([FIELD_DEFAULTS.captureGoal, FIELD_DEFAULTS.respawnSeconds, FIELD_DEFAULTS.pickupSeconds]).toEqual([3,10,10]); });
  it('halves reload duration only in rapid reload', () => { expect(reloadDuration(0.9,true)).toBe(0.45); expect(reloadDuration(0.9,false)).toBe(0.9); });
  it('regenerates after five damage-free seconds, never reviving or removing overheal', () => { expect(regeneratedHealth(50,125,4.9,1,true)).toBe(50); expect(regeneratedHealth(50,125,5,1,true)).toBe(60); expect(regeneratedHealth(120,125,6,1,true)).toBe(125); expect(regeneratedHealth(0,125,6,1,true)).toBe(0); expect(regeneratedHealth(150,125,6,1,true)).toBe(150); expect(regeneratedHealth(50,125,6,1,false)).toBe(50); });
  it('marks objective floor differences', () => { expect(floorLabel(0,-6)).toBe('BELOW'); expect(floorLabel(0,6)).toBe('ABOVE'); expect(floorLabel(0,0)).toBe('SAME FLOOR'); });
  it('calculates concrete performance values safely', () => { expect(fieldReport({kills:4,assists:2,damage:600,healing:250,captures:1,returns:2},3,120)).toEqual({efficiency:'2.00',damagePerMinute:300,support:250,objectives:3}); });
});