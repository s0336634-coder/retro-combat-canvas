import { describe, expect, it } from 'vitest';
import { cycleSlot, availableSlot, assistEligible, earnedMedals, freshStats, MATCH_MODES, CHALLENGES } from './extras';
describe('new match rules', () => {
  it('wraps wheel cycling in both directions', () => { expect(cycleSlot(2, 1, 3)).toBe(0); expect(cycleSlot(0, -1, 3)).toBe(2); });
  it('falls back to loaded guns or melee, not another empty gun', () => { expect(availableSlot([{clip:0,def:{clip:6}},{clip:0,def:{clip:12}},{clip:0,def:{clip:0}}],0)).toBe(2); });
  it('credits recent non-killer contributors only', () => { expect(assistEligible(2,10,1,2,3)).toBe(true); expect(assistEligible(1,10,1,2,3)).toBe(false); expect(assistEligible(2,10,2,2,3)).toBe(false); });
  it('awards medals only at their thresholds', () => { expect(earnedMedals(freshStats())).toEqual([]); expect(earnedMedals({...freshStats(),kills:5,assists:3,captures:1,returns:1,healing:500})).toEqual(['Frontline','Wingman','Courier','Guardian','Lifesaver']); });
  it('keeps gravity classic unless low gravity is selected', () => { expect(MATCH_MODES.classic.gravity).toBe(1); expect(MATCH_MODES.melee.gravity).toBe(1); expect(MATCH_MODES.lowGravity.gravity).toBe(0.45); });
  it('sets three concrete challenge goals', () => { expect(CHALLENGES.map(x=>x.target)).toEqual([5,1000,1]); });
});