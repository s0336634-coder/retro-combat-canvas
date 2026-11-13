import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { astar, botThink, makeBrain, walkClear } from './ai';
import { buildMap } from './map';
import { World } from './physics';
import { CLASSES } from './classes';
import type { Actor, Game } from './game';

function fixture(cls: Actor['cls'] = 'scout') {
  const map = buildMap();
  const a = { id: 2, cls, team: 0, alive: true, pos: new THREE.Vector3(-75, 0, 16), vel: new THREE.Vector3(), hp: CLASSES[cls].hp, maxHp: CLASSES[cls].hp, yaw: 0, h: 1.8, onGround: true, carrying: false, slot: 0, metal: 120,
    weapons: CLASSES[cls].weapons.map(def => ({ def, clip: def.clip, reserve: def.reserve })), input: { wx: 0, wz: 0, yaw: 0, pitch: 0, slot: 0, fire: false, alt: false, jump: false, crouch: false, reload: false } } as Actor;
  const brain = makeBrain(a); a.brain = brain; brain.idleT = 0;
  const g = { map, world: new World(map.boxes), time: 0, botDifficulty: 'normal', winner: null, actors: [a], buildings: [], sounds: [], projectiles: [], pickups: [],
    flags: map.intelHome.map(home => ({ state: 'AT_BASE', home: new THREE.Vector3(home.x, home.y, home.z), pos: new THREE.Vector3(home.x, home.y, home.z) })),
    eye: (o: Actor) => o.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), center: (o: Actor) => o.pos.clone().add(new THREE.Vector3(0, 0.9, 0)), dirOf: () => new THREE.Vector3(0, 0, -1), los: () => true } as unknown as Game;
  return { a, brain, g };
}

describe('bot tactical regressions', () => {
  it('routes both teams along all ten vault treads instead of cutting through the rail', () => {
    const { a, g } = fixture();
    for (const prefix of ['B_', 'R_']) {
      const start = g.map.nodeIdx[prefix + 'TRENCH_TOP'], goal = g.map.nodeIdx[prefix + 'TRENCH_BOT'];
      if (start === undefined || goal === undefined) throw new Error('Missing vault waypoints');
      const route = astar(g, a, start, goal);
      expect(route.filter(id => g.map.nodes[id]?.name.includes('VAULT_STAIR_'))).toHaveLength(10);
    }
  });
  it('does not invent a direct route to a disconnected goal', () => {
    const { a, g } = fixture();
    g.map.nodes.forEach(n => { n.edges = []; });
    expect(astar(g, a, 0, 1)).toEqual([]);
  });
  it('rejects courtyard shortcuts through a wall but permits the spawn-room exit', () => {
    const { a, g } = fixture();
    expect(walkClear(g, a, new THREE.Vector3(-62, 0, 12))).toBe(true);
    a.pos.set(-45, 0, 10);
    expect(walkClear(g, a, new THREE.Vector3(-35, 0, 10))).toBe(false);
  });
  it('lets Demoman actually swing his bottle in close combat', () => {
    const { a, brain, g } = fixture('demoman');
    a.pos.set(-30, 0, 0);
    const enemy = { ...a, id: 3, team: 1, carrying: true, pos: new THREE.Vector3(-30, 0, -1.2), brain: null } as Actor;
    g.actors.push(enemy); brain.target = enemy; brain.reactT = 0; brain.thinkT = 1; brain.state = 'ENGAGE_ENEMY';
    botThink(a, g, 0);
    expect(a.input.slot).toBe(2); expect(a.input.fire).toBe(true);
  });
  it('sends an Engineer with 120 metal to resupply rather than retrying a 130-metal sentry', () => {
    const { a, brain, g } = fixture('engineer'); a.pos.set(-50, 0, 0);
    botThink(a, g, 0);
    expect(brain.goal).toBe(g.map.nodeIdx['B_SPAWN']);
    expect(a.metal).toBe(120);
  });
  it('keeps a Medic carrier delivering instead of following a patient', () => {
    const { a, brain, g } = fixture('medic'); a.carrying = true;
    g.actors.push({ ...a, cls: 'heavy', carrying: false, pos: new THREE.Vector3(-50, 0, 16), id: 5 } as Actor);
    botThink(a, g, 0);
    expect(brain.goal).toBe(g.map.nodeIdx['B_INTEL_VAULT']);
  });
  it('clears stale pursuit and navigation memory on respawn', () => {
    const { brain, g } = fixture(); brain.lastSeen = new THREE.Vector3(50, 0, 0); brain.blockedEdges.set('0-1', 12); brain.stuckT = 4;
    brain.reset(g);
    expect(brain.lastSeen).toBeNull(); expect(brain.blockedEdges.size).toBe(0); expect(brain.stuckT).toBe(0);
  });
});