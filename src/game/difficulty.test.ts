import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { BOT_DIFFICULTIES, botAimError, botReactionTime } from './difficulty';
import type { BotDifficulty } from './difficulty';
import { botThink, chooseState, makeBrain } from './ai';
import type { Actor, Game } from './game';

function scenario(difficulty: BotDifficulty) {
  const actor = {
    id: 2, team: 0, cls: 'scout', pos: new THREE.Vector3(), vel: new THREE.Vector3(), h: 1.8,
    alive: true, hp: 125, maxHp: 125, yaw: 0, onGround: true, carrying: false,
    input: { yaw: 0, pitch: 0, wx: 0, wz: 0, fire: false, alt: false, jump: false, crouch: false, reload: false, slot: 0 },
  } as Actor;
  actor.brain = makeBrain(actor);
  actor.brain.idleT = 0;
  const enemy = { ...actor, id: 3, team: 1, pos: new THREE.Vector3(0, 0, -10), brain: null } as Actor;
  const game = {
    botDifficulty: difficulty, winner: null, actors: [actor, enemy], buildings: [], sounds: [], pickups: [], projectiles: [],
    flags: [{ state: 'AT_BASE' }, { state: 'AT_BASE' }],
    eye: (a: Actor) => a.pos.clone().add(new THREE.Vector3(0, 1.6, 0)),
    center: (a: Actor) => a.pos.clone().add(new THREE.Vector3(0, 0.99, 0)),
    dirOf: () => new THREE.Vector3(0, 0, -1), los: () => true,
    world: { overlaps: () => true },
  } as unknown as Game;
  return { actor, enemy, game };
}

afterEach(() => vi.restoreAllMocks());

describe('bot difficulty presets', () => {
  it('progressively reduces aim error without making hard snipers perfect', () => {
    expect(botAimError('easy', false, 0.9)).toBe(1.1);
    expect(botAimError('normal', false, 0.9)).toBe(0.45);
    expect(botAimError('hard', false, 0.9)).toBe(0.2);
    expect(botAimError('easy', true, 0.3)).toBe(4.5);
    expect(botAimError('normal', true, 0.3)).toBe(0.12);
    expect(botAimError('hard', true, 0.1)).toBe(4.5);
    const { actor, enemy, game } = scenario('easy');
    enemy.carrying = true;
    vi.spyOn(Math, 'random').mockReturnValue(0.75);
    botThink(actor, game, 0);
    expect(actor.brain?.aimErr.x).toBeCloseTo(0.275);
    game.botDifficulty = 'hard';
    if (actor.brain) actor.brain.thinkT = 0;
    botThink(actor, game, 0);
    expect(actor.brain?.aimErr.x).toBeCloseTo(0.05);
  });

  it.each(['easy', 'normal', 'hard'] as const)('delays %s attacks until its reaction time expires', (difficulty) => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { actor, enemy, game } = scenario(difficulty);
    enemy.carrying = true;
    botThink(actor, game, 0);
    expect(actor.brain?.reactT).toBe(BOT_DIFFICULTIES[difficulty].reactionTime);
    expect(actor.input.fire).toBe(false);
    botThink(actor, game, BOT_DIFFICULTIES[difficulty].reactionTime - 0.01);
    expect(actor.input.fire).toBe(false);
    botThink(actor, game, 0.02);
    expect(actor.input.fire).toBe(true);
  });

  it('does not restart reaction delay on repeated damage from the same target', () => {
    const { actor, enemy, game } = scenario('easy');
    actor.brain?.hurtBy(enemy, game);
    expect(actor.brain?.reactT).toBe(botReactionTime('easy', false, true));
    if (actor.brain) actor.brain.reactT = 0.05;
    actor.brain?.hurtBy(enemy, game);
    expect(actor.brain?.reactT).toBe(0.05);
  });

  it('increases intel commitment from easy to hard while preserving carrier delivery', () => {
    const { actor, enemy, game } = scenario('easy');
    if (actor.brain) actor.brain.target = enemy;
    expect(chooseState(game, actor)).toBe('ENGAGE_ENEMY');
    game.botDifficulty = 'hard';
    expect(chooseState(game, actor)).toBe('PURSUE_OBJECTIVE');
    actor.carrying = true;
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      game.botDifficulty = difficulty;
      expect(chooseState(game, actor)).toBe('PURSUE_OBJECTIVE');
    }
  });

  it('keeps engineer nest-building and medic healing independent of combat reaction delays', () => {
    const { actor, enemy, game } = scenario('easy');
    actor.cls = 'engineer';
    game.actors = [actor];
    expect(chooseState(game, actor)).toBe('BUILD_NEST');
    actor.cls = 'medic';
    enemy.team = 0;
    enemy.pos.z = -5;
    game.actors.push(enemy);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    if (actor.brain) actor.brain.reactT = 1;
    botThink(actor, game, 0);
    expect(actor.input.slot).toBe(1);
    expect(actor.input.fire).toBe(true);
  });
});