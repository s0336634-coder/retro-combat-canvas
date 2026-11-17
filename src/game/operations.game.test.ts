import { describe, expect, it, vi } from 'vitest';
import { Game } from './game';
import { FIELD_DEFAULTS } from './operations';
describe('live field controls', () => {
  it('clamps match goals and rejects unknown rules', () => {
    const g = Object.assign(Object.create(Game.prototype),{fieldRules:{...FIELD_DEFAULTS}});
    g.setFieldRule('captureGoal',50); expect(g.fieldRules.captureGoal).toBe(10);
    g.setFieldRule('respawnSeconds',0); expect(g.fieldRules.respawnSeconds).toBe(3);
    g.setFieldRule('pickupSeconds',20); expect(g.fieldRules.pickupSeconds).toBe(20);
    g.setFieldRule('unknown',1); expect(g.fieldRules.unknown).toBeUndefined();
  });
  it('pauses the clock and all simulation updates', () => {
    const g = Object.assign(Object.create(Game.prototype),{paused:true,time:5,readPlayerInput:vi.fn()});
    g.update(1); expect(g.time).toBe(5); expect(g.readPlayerInput).not.toHaveBeenCalled();
  });
  it('demolishes only the player-owned selected building', () => {
    const player = {id:1}; const mine = {id:4,owner:player}; const other = {id:5,owner:{id:2}};
    const g = Object.assign(Object.create(Game.prototype),{player,buildings:[mine,other],destroyBuilding:vi.fn(),logEvent:vi.fn()});
    g.demolishBuilding(5); expect(g.destroyBuilding).not.toHaveBeenCalled();
    g.demolishBuilding(4); expect(g.destroyBuilding).toHaveBeenCalledWith(mine,null);
  });
  it('orders reset only allied planning and expire after thirty seconds', () => {
    const ally = {team:0,brain:{thinkT:2,repathT:3}}; const enemy = {team:1,brain:{thinkT:2,repathT:3}};
    const g = Object.assign(Object.create(Game.prototype),{time:10,player:{team:0},actors:[ally,enemy],logEvent:vi.fn(),flash:vi.fn()});
    g.issueOrder('attack'); expect(g.orderUntil).toBe(40); expect(ally.brain.thinkT).toBe(0); expect(enemy.brain.thinkT).toBe(2);
    g.issueOrder('invalid'); expect(g.squadOrder).toBe('attack');
  });
});