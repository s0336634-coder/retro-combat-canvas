// @ts-nocheck
import * as THREE from "three";
import type { Actor, Game, Team, Building, BldType } from "./game";
import type { NavNode } from "./map";
import { BOT_DIFFICULTIES, botAimError, botReactionTime, objectiveUtility } from './difficulty';
import { BUILD_COST } from './classes';

export type BotState = "IDLE" | "PATROL" | "PURSUE_OBJECTIVE" | "ENGAGE_ENEMY" | "RETREAT_FOR_HEALTH" | "DEFEND_CHOKE" | "BUILD_NEST";
export type Brain = {
  state: BotState; path: number[]; goal: number; goalPos: THREE.Vector3 | null; repathT: number; thinkT: number;
  target: Actor | null; targetBld: Building | null; seenT: number; reactT: number; strafe: number; strafeT: number;
  stuckT: number; lastPos: THREE.Vector3; bias: Map<string, number>; idleT: number; aimErr: THREE.Vector3;
  heardT: number; heardPos: THREE.Vector3 | null; buildStep: number; stickyT: number; home: string; lookYaw: number;
  reset: (g: Game) => void; hurtBy: (a: Actor, g: Game) => void;
  lastSeen: THREE.Vector3 | null; steerT: number; steer: THREE.Vector3; blockedEdges: Map<string, number>;
};

const SEWER_EDGE = /SEWER|MOAT/;

export function makeBrain(a: Actor): Brain {
  const b: Brain = {
    state: "IDLE", path: [], goal: -1, goalPos: null, repathT: 0, thinkT: 0, target: null, targetBld: null, seenT: 0,
    reactT: 0, strafe: 1, strafeT: 0, stuckT: 0, lastPos: new THREE.Vector3(), bias: new Map(), idleT: 1 + Math.random(),
    aimErr: new THREE.Vector3(), heardT: 0, heardPos: null, buildStep: 0, stickyT: 0, home: "", lookYaw: 0,
    lastSeen: null, steerT: 0, steer: new THREE.Vector3(), blockedEdges: new Map(),
    reset() { b.state = "IDLE"; b.path = []; b.goal = -1; b.goalPos = null; b.repathT = 0; b.target = null; b.targetBld = null; b.seenT = 0; b.heardT = 0; b.lastSeen = null; b.steerT = 0; b.blockedEdges.clear(); b.stuckT = 0; b.unstuckT = 0; b.idleT = 0.5 + Math.random(); b.buildStep = 0; b.stickyT = 0; b.lastPos.copy(a.pos); rollBias(); },
    hurtBy(from, g) { if (b.target === from) { b.seenT = 2.5; return; } if (!b.target || Math.random() < 0.5) { b.target = from; b.seenT = 2.5; b.reactT = botReactionTime(g.botDifficulty, a.cls === 'sniper', true); } },
  };
  const rollBias = () => { b.bias.clear(); };
  return b;
}

// ---------- navigation ----------
function edgeCost(a: Actor, b: Brain, from: NavNode, to: NavNode, time: number) {
  const key = from.id < to.id ? `${from.id}-${to.id}` : `${to.id}-${from.id}`;
  let r = b.bias.get(key);
  if (r === undefined) { r = 0.7 + Math.random() * 0.9; b.bias.set(key, r); }
  let c = Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z) * r;
  const sewer = SEWER_EDGE.test(from.name) || SEWER_EDGE.test(to.name);
  if (a.cls === "scout" && sewer) c *= 0.5;
  if (a.cls === "spy" && sewer) c *= 0.7;
  if ((b.blockedEdges.get(key) ?? 0) > time) c *= 8;
  return c;
}
export function astar(g: Game, a: Actor, start: number, goal: number): number[] {
  const N = g.map.nodes;
  const brain = a.brain;
  if (!brain || !N[start] || !N[goal]) return [];
  const open = new Set([start]);
  const gs = new Map<number, number>([[start, 0]]);
  const fs = new Map<number, number>();
  const came = new Map<number, number>();
  const h = (i: number) => Math.hypot(N[i].x - N[goal].x, N[i].y - N[goal].y, N[i].z - N[goal].z) * 0.35;
  fs.set(start, h(start));
  while (open.size) {
    let cur = -1, bf = Infinity;
    for (const o of open) { const f = fs.get(o) ?? Infinity; if (f < bf) { bf = f; cur = o; } }
    if (cur === goal) {
      const path = [cur];
      while (came.has(cur)) { const previous = came.get(cur); if (previous === undefined) break; cur = previous; path.unshift(cur); }
      return path;
    }
    open.delete(cur);
    for (const nb of N[cur].edges) {
      const t = (gs.get(cur) ?? Infinity) + edgeCost(a, brain, N[cur], N[nb], g.time ?? 0);
      if (t < (gs.get(nb) ?? Infinity)) { came.set(nb, cur); gs.set(nb, t); fs.set(nb, t + h(nb)); open.add(nb); }
    }
  }
  return [];
}
export function nearestNode(g: Game, p: THREE.Vector3, needLos = true) {
  let best = -1, bd = Infinity;
  for (const n of g.map.nodes) {
    // Strong floor weighting prevents courtyard bots from selecting sewer nodes
    // that happen to be directly beneath them.
    const d = Math.hypot(n.x - p.x, (n.y - p.y) * 10, n.z - p.z);
    if (d < bd && (!needLos || d > 40 || g.los(new THREE.Vector3(p.x, p.y + 1, p.z), new THREE.Vector3(n.x, n.y + 1, n.z)))) { bd = d; best = n.id; }
  }
  if (best < 0) return nearestNode(g, p, false);
  return best;
}
const tn = (a: Actor | Team, name: string) => (typeof a === "number" ? (a === 0 ? "B_" : "R_") : a.team === 0 ? "B_" : "R_") + name;

function goTo(g: Game, a: Actor, nodeName: string | number, pos?: THREE.Vector3) {
  const b = a.brain!;
  const id = typeof nodeName === "number" ? nodeName : g.map.nodeIdx[nodeName];
  if (b.goal !== id || b.repathT <= 0) {
    b.goal = id;
    b.path = astar(g, a, nearestNode(g, a.pos), id);
    // Skip the start node when we're already past it toward the next one, so repaths don't drag bots backwards.
    if (b.path.length > 1) {
      const n0 = g.map.nodes[b.path[0]], n1 = g.map.nodes[b.path[1]];
      const dSelf = Math.hypot(n1.x - a.pos.x, n1.z - a.pos.z), dSeg = Math.hypot(n1.x - n0.x, n1.z - n0.z);
      if (dSelf < dSeg && Math.abs(n1.y - a.pos.y) < 2.5 && walkClear(g, a, new THREE.Vector3(n1.x, n1.y, n1.z))) b.path.shift();
    }
    b.repathT = pos ? 1.5 : 3;
  }
  b.goalPos = pos ?? null;
}
function followPath(g: Game, a: Actor): THREE.Vector3 | null {
  const b = a.brain!;
  while (b.path.length) {
    const n = g.map.nodes[b.path[0]];
    const dx = n.x - a.pos.x, dz = n.z - a.pos.z;
    const stair = /STAIR/.test(n.name);
    if (Math.hypot(dx, dz) < (stair ? 0.45 : 1.3) && Math.abs(n.y - a.pos.y) < (stair ? 0.7 : 1.2)) { b.path.shift(); continue; }
    return new THREE.Vector3(n.x, n.y, n.z);
  }
  return b.goalPos;
}

// Test the actor's full width, support and step clearance, not just an eye ray.
export function walkClear(g: Game, a: Actor, target: THREE.Vector3) {
  if (!g.world.ray) return true;
  const distance = Math.hypot(target.x - a.pos.x, target.z - a.pos.z);
  const steps = Math.max(1, Math.ceil(distance / 0.45));
  let y = a.pos.y;
  for (let i = 1; i <= steps; i++) {
    const x = a.pos.x + (target.x - a.pos.x) * i / steps, z = a.pos.z + (target.z - a.pos.z) * i / steps;
    const support = g.world.ray(x, y + 0.75, z, 0, -1, 0, 2);
    if (!support) { if (a.inWater) continue; return false; }
    const nextY = y + 0.75 - support.t;
    if (nextY - y > 0.71 || y - nextY > 1.1 || g.world.overlaps(x, nextY + 0.71, z, a.h)) return false;
    y = nextY;
  }
  return true;
}

function nearestHelpers(g: Game, a: Actor, pos: THREE.Vector3, count: number) {
  return g.actors.filter(o => o.alive && o.team === a.team && !o.carrying && o.cls !== 'engineer' && o.cls !== 'medic')
    .sort((p, q) => p.pos.distanceTo(pos) - q.pos.distanceTo(pos) || p.id - q.id).slice(0, count).includes(a);
}

function steerToward(g: Game, a: Actor, desired: THREE.Vector3, dt: number) {
  const b = a.brain;
  if (!b) return desired;
  b.steerT -= dt;
  if (b.steerT > 0) return b.steer;
  b.steerT = 0.12;
  let best = new THREE.Vector3(), score = -Infinity;
  for (const angle of [0, 0.4, -0.4, 0.85, -0.85, 1.4, -1.4, Math.PI]) {
    const v = desired.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    const probe = a.pos.clone().addScaledVector(v, 1.25);
    if (!walkClear(g, a, probe)) continue;
    let value = v.dot(desired) * 3 + v.dot(b.steer) * 0.4;
    for (const o of g.actors) {
      if (o === a || !o.alive || Math.abs(o.pos.y - a.pos.y) > 1.5) continue;
      const predicted = o.pos.clone().addScaledVector(o.vel, 0.15);
      value -= Math.max(0, 1.4 - probe.distanceTo(predicted)) * 2;
    }
    if (value > score) { best = v; score = value; }
  }
  b.steer.copy(best);
  return b.steer;
}

// ---------- perception ----------
function perceive(g: Game, a: Actor) {
  const eye = g.eye(a), fwd = g.dirOf(a.yaw, 0);
  let best: Actor | null = null, bs = -Infinity;
  for (const o of g.actors) {
    if (!o.alive || o.team === a.team) continue;
    const c = g.center(o), to = c.clone().sub(eye), d = to.length();
    if (d > 55) continue;
    if (o.cloaked && d > 2.5) continue;
    if (o.disguised && d > 1.5 && a.brain!.target !== o && !(a.cls === "pyro" && d < 4)) continue;
    const ang = to.normalize().dot(fwd);
    const hurt = a.lastAttacker === o && a.brain!.seenT > 0;
    if (ang < 0.5 && !hurt && d > 4) continue; // 120° vision
    if (!g.los(eye, c)) continue;
    let s = 100 - d;
    if (o.carrying) s += 100;
    if (o.hp < o.maxHp * 0.3) s += 20;
    if (o.cls === "medic") s += 15;
    if (o.cls === "sniper" && (a.cls === "spy" || a.cls === "scout")) s += 20;
    if (s > bs) { bs = s; best = o; }
  }
  let bld: Building | null = null;
  for (const bb of g.buildings) {
    if (bb.team === a.team) continue;
    const p = bb.pos.clone().add(new THREE.Vector3(0, 0.6, 0));
    if (p.distanceTo(eye) < 30 && g.los(eye, p)) { bld = bb; break; }
  }
  // hearing
  const b = a.brain!;
  for (const s of g.sounds) {
    if (s.team === a.team) continue;
    if (Math.hypot(s.x - a.pos.x, s.y - a.pos.y, s.z - a.pos.z) < s.r) { b.heardPos = new THREE.Vector3(s.x, s.y, s.z); b.heardT = 1.5; }
  }
  return { enemy: best, bld };
}

// ---------- main think ----------
export function botThink(a: Actor, g: Game, dt: number) {
  const b = a.brain!, inp = a.input;
  b.repathT -= dt; b.thinkT -= dt; b.seenT -= dt; b.heardT -= dt; b.strafeT -= dt; b.reactT -= dt; b.stickyT -= dt;
  inp.fire = false; inp.alt = false; inp.jump = false; inp.crouch = false; inp.reload = false;
  if (g.winner !== null) { inp.wx = inp.wz = 0; return; }
  if (b.idleT > 0) { b.idleT -= dt; b.state = "IDLE"; inp.wx = inp.wz = 0; return; }

  if (b.thinkT <= 0) {
    b.thinkT = BOT_DIFFICULTIES[g.botDifficulty].thinkInterval;
    const per = perceive(g, a);
    if (per.enemy) { if (b.target !== per.enemy) b.reactT = botReactionTime(g.botDifficulty, a.cls === 'sniper'); b.target = per.enemy; b.lastSeen = per.enemy.pos.clone(); b.seenT = 1.5; }
    else if (b.seenT <= 0) b.target = null;
    if (b.target && !b.target.alive) b.target = null;
    if (per.bld && b.targetBld !== per.bld && !b.target) b.reactT = botReactionTime(g.botDifficulty, a.cls === 'sniper');
    b.targetBld = per.bld;
    b.state = chooseState(g, a);
    const error = botAimError(g.botDifficulty, a.cls === 'sniper', Math.random());
    b.aimErr.set((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(error);
  }

  let moveTo: THREE.Vector3 | null = null;
  let look: THREE.Vector3 | null = null;
  const own = g.flags[a.team], enemyFlag = g.flags[1 - a.team];

  switch (b.state) {
    case "RETREAT_FOR_HEALTH": {
      let best: THREE.Vector3 | null = null, bd = Infinity;
      for (const p of g.pickups) if (p.active && p.type.startsWith("hp")) { const d = p.pos.distanceTo(a.pos) + Math.abs(p.pos.y - a.pos.y) * 4; if (d < bd) { bd = d; best = p.pos; } }
      if (best && bd < 40) { goTo(g, a, nearestNode(g, best, false), best); }
      else goTo(g, a, tn(a, "SPAWN"));
      moveTo = followPath(g, a);
      break;
    }
    case "PURSUE_OBJECTIVE": {
      if (a.carrying && own.state === "AT_BASE") goTo(g, a, tn(a, "INTEL_VAULT"), own.home);
      else if (a.carrying) goTo(g, a, tn(a, "HALL")); // hold safely until our intel is returned
      else if (own.state !== "AT_BASE" && own.carrier && nearestHelpers(g, a, own.carrier.pos, 3)) { goTo(g, a, nearestNode(g, own.carrier.pos, false), own.carrier.pos); }
      else if (own.state === "DROPPED" && nearestHelpers(g, a, own.pos, 2)) goTo(g, a, nearestNode(g, own.pos, false), own.pos);
      else if (enemyFlag.state === "CARRIED" && enemyFlag.carrier) {
        const carrier = enemyFlag.carrier;
        const escort = carrier.pos.clone().add(new THREE.Vector3((a.id % 2 ? 1 : -1) * 2, 0, 1.5));
        goTo(g, a, nearestNode(g, carrier.pos, false), walkClear(g, a, escort) ? escort : carrier.pos);
      }
      else goTo(g, a, nearestNode(g, enemyFlag.pos, false), enemyFlag.pos);
      if (a.cls === "spy" && !b.target) {
        const enemySide = Math.sign(a.pos.x) !== Math.sign(a.team === 0 ? -1 : 1) || Math.abs(a.pos.x) < 30;
        if (enemySide && !a.cloaked && a.cloak > 0.6 && Math.abs(a.pos.x) < 30) inp.alt = !a.altPrev;
        if (a.cloaked && Math.abs(a.pos.x) > 40 && a.cloak < 0.9) { inp.alt = !a.altPrev; }
        if (!a.cloaked && !a.disguised) { a.disguised = true; g.refreshLook(a); }
      }
      moveTo = followPath(g, a);
      break;
    }
    case "DEFEND_CHOKE": {
      const spot = defendSpot(a);
      goTo(g, a, tn(a, spot));
      moveTo = followPath(g, a);
      if (!moveTo || a.pos.distanceTo(nodePos(g, tn(a, spot))) < 1.5) {
        moveTo = null;
        look = lookOut(g, a);
        if (a.cls === "demoman" && b.stickyT <= 0 && countStickies(g, a) < 4) {
          a.input.slot = 1;
          const tgt = nodePos(g, tn(a, a.cls === "demoman" ? "TRENCH_BOT" : spot));
          look = tgt.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3));
          if (Math.abs(angleTo(a, g, look)) < 0.15) { inp.fire = true; b.stickyT = 0.8; }
        }
        if (a.cls === "heavy" && b.heardT > 0 && b.heardPos && b.heardPos.distanceTo(a.pos) < 15) { inp.alt = true; look = b.heardPos; }
        if (a.cls === "pyro" && Math.random() < 0.02) inp.fire = true; // spy-check puff
        if (a.cls === "sniper") { a.input.slot = 0; if (!a.scoped && a.onGround) inp.alt = !a.altPrev; }
      }
      break;
    }
    case "BUILD_NEST": moveTo = engineerLogic(g, a, dt); look = b.goalPos && !moveTo ? lookOut(g, a) : null; break;
    case "ENGAGE_ENEMY": { const r = combat(g, a, dt); moveTo = r.move; look = r.look; break; }
    case "PATROL": case "IDLE": default: {
      if (a.cls === "medic") { const r = medicFollow(g, a); moveTo = r.move; look = r.look; break; }
      if (b.heardT > 0 && b.heardPos) goTo(g, a, nearestNode(g, b.heardPos), b.heardPos);
      else goTo(g, a, b.goal >= 0 ? b.goal : tn(a, "COURTYARD"));
      moveTo = followPath(g, a);
      if (!moveTo) { const nodes = g.map.nodes.filter((n) => n.team === a.team); const next = nodes[Math.floor(Math.random() * nodes.length)]; if (next) { b.goal = next.id; b.repathT = 0; } }
    }
  }
  // medics override: always heal
  if (a.cls === "medic" && b.state !== "RETREAT_FOR_HEALTH" && !a.carrying && (b.state !== 'ENGAGE_ENEMY' || a.healTarget || !b.target || b.target.pos.distanceTo(a.pos) > 8)) {
    const r = medicFollow(g, a);
    moveTo = r.move ?? moveTo; look = r.look ?? look;
  }
  // steering
  if (g.squadOrder === 'regroup' && g.orderUntil > g.time && a.team === g.player?.team && !a.carrying && b.state !== 'RETREAT_FOR_HEALTH' && !b.target && a.cls !== 'engineer' && a.cls !== 'medic') {
    const rally = g.player.pos.clone().add(new THREE.Vector3((a.id % 3 - 1) * 2,0,2));
    if (a.pos.distanceTo(g.player.pos) > 5) { goTo(g,a,nearestNode(g,rally),rally); moveTo = followPath(g,a); }
    else moveTo = null;
  }
  if (moveTo) {
    const d = new THREE.Vector3(moveTo.x - a.pos.x, 0, moveTo.z - a.pos.z);
    const L = d.length();
    const stopRadius = b.state === "PURSUE_OBJECTIVE" ? 0.1 : 0.3;
    if (L > stopRadius) {
      d.divideScalar(L);
      d.copy(steerToward(g, a, d, dt));
      const n = Math.hypot(d.x, d.z) || 1;
      inp.wx = d.x / n; inp.wz = d.z / n;
    } else { inp.wx = inp.wz = 0; }
    if (!look) look = new THREE.Vector3(moveTo.x, a.pos.y + a.h - 0.2 + (moveTo.y - a.pos.y) * 0.3, moveTo.z);
    if (a.inWater) inp.jump = moveTo.y > a.pos.y + 0.5 || a.pos.y + a.h < -2.2;
  } else if (b.state !== "ENGAGE_ENEMY") { inp.wx = inp.wz = 0; }
  // stuck detection with a timed sidestep so bots slide around corners instead of jittering
  b.unstuckT = (b.unstuckT ?? 0) - dt;
  if (b.unstuckT > 0 && Math.hypot(inp.wx, inp.wz) > 0.1) {
    const s = b.unstuckSide ?? 1, wx = inp.wx;
    inp.wx = -inp.wz * s * 0.9 + wx * 0.3; inp.wz = wx * s * 0.9 + inp.wz * 0.3;
  }
  if (Math.hypot(inp.wx, inp.wz) > 0.1) {
    b.stuckT += dt;
    if (b.stuckT > 0.7) {
      if (a.pos.distanceTo(b.lastPos) < 0.6) {
        if (a.onGround) inp.jump = true;
        b.unstuckT = 0.6; b.unstuckSide = Math.random() < 0.5 ? -1 : 1;
        if (b.stuckT > 2.2) {
          const start = nearestNode(g, a.pos), next = b.path[0];
          if (next !== undefined && start !== next) b.blockedEdges.set(start < next ? `${start}-${next}` : `${next}-${start}`, (g.time ?? 0) + 12);
          b.repathT = 0; b.path = []; b.steerT = 0; b.stuckT = 0; b.lastPos.copy(a.pos); if (b.state === "PATROL") b.goal = -1;
        }
      } else { b.stuckT = 0; b.lastPos.copy(a.pos); }
    }
  } else { b.stuckT = 0; b.lastPos.copy(a.pos); }
  // reload during downtime
  const weapon = a.weapons?.[inp.slot];
  if (weapon && weapon.def.reload && weapon.clip < weapon.def.clip && (!b.target || weapon.clip === 0)) inp.reload = true;
  if (weapon && weapon.def.clip > 0 && weapon.clip === 0 && weapon.reserve === 0) {
    const fallback = a.weapons.findIndex(w => w.def.clip === 0 || w.clip > 0 || w.reserve > 0);
    if (fallback >= 0) inp.slot = fallback;
  }
  if (a.scoped && b.state !== 'ENGAGE_ENEMY' && moveTo && a.pos.distanceTo(moveTo) > 3) inp.alt = !a.altPrev;
  if (look) aimAt(g, a, look, dt);
}

export function chooseState(g: Game, a: Actor): import("./ai").BotState {
  const b = a.brain!;
  const own = g.flags[a.team], enemyFlag = g.flags[1 - a.team];
  const u: Record<string, number> = { PATROL: 10, PURSUE_OBJECTIVE: 0, ENGAGE_ENEMY: 0, RETREAT_FOR_HEALTH: 0, DEFEND_CHOKE: 0, BUILD_NEST: 0 };
  const role = a.cls;
  if (["scout", "soldier", "spy", "pyro"].includes(role)) u.PURSUE_OBJECTIVE = 40;
  if (["heavy", "demoman", "sniper"].includes(role)) u.DEFEND_CHOKE = 40;
  if (["heavy", "demoman"].includes(role) && (Math.floor((g.time ?? 0) / 25) + a.id) % 3 !== 0) u.PURSUE_OBJECTIVE = 65;
  if (role === "pyro" && a.id % 2 === 0) u.DEFEND_CHOKE = 45;
  if (role === "heavy" && g.actors.some((m) => m.alive && m.healTarget === a)) u.PURSUE_OBJECTIVE = 60; // pocketed heavy pushes
  if (role === "engineer") u.BUILD_NEST = 45;
  if (a.carrying) u.PURSUE_OBJECTIVE = 150;
  if (enemyFlag.state === "CARRIED" && enemyFlag.carrier?.team === a.team) {
    // Push with the carrier instead of leaving them to cross the map alone.
    u.PURSUE_OBJECTIVE = Math.max(u.PURSUE_OBJECTIVE, role === "engineer" || role === "sniper" ? 35 : 85);
  }
  const recoveryPos = own.carrier?.pos ?? own.pos;
  if (own.state !== "AT_BASE" && recoveryPos && nearestHelpers(g, a, recoveryPos, own.carrier ? 3 : 2)) u.PURSUE_OBJECTIVE = Math.max(u.PURSUE_OBJECTIVE, 110);
  u.PURSUE_OBJECTIVE = objectiveUtility(g.botDifficulty, u.PURSUE_OBJECTIVE, a.carrying);
  if (g.orderUntil > g.time && a.team === g.player?.team && !a.carrying && role !== 'engineer' && role !== 'medic') {
    if (g.squadOrder === 'attack') u.PURSUE_OBJECTIVE += 100;
    if (g.squadOrder === 'defend') u.DEFEND_CHOKE += 110;
  }
  if (b.target) u.ENGAGE_ENEMY = 70 + (b.target.carrying ? 100 : 0) - (a.carrying ? 90 : 0);
  if (a.cls === "spy" && b.target && a.cloaked && !b.target.carrying) u.ENGAGE_ENEMY = 30;
  if (a.cls === "spy" && b.targetBld && b.targetBld.type === "sentry") u.ENGAGE_ENEMY = 90;
  if (b.targetBld && ["soldier", "demoman"].includes(a.cls)) u.ENGAGE_ENEMY = Math.max(u.ENGAGE_ENEMY, 60);
  const healed = g.actors.some((m) => m.alive && m.healTarget === a);
  if (a.hp < a.maxHp * 0.3 && !healed) u.RETREAT_FOR_HEALTH = a.carrying ? 60 : 95;
  // hysteresis: keep the current plan unless another clearly wins, stops state flicker
  if (b.state in u && b.state !== "IDLE") u[b.state] += 8;
  let best = "PATROL", bv = -1;
  for (const k in u) if (u[k] > bv) { bv = u[k]; best = k; }
  return best as BotState;
}

function defendSpot(a: Actor) {
  switch (a.cls) {
    case "heavy": return "TRENCH_BOT";
    case "demoman": return "INTEL_VAULT";
    case "sniper": return a.id % 2 ? "BATT_A" : "BATT_B";
    case "pyro": return "ROOM_SIDE";
    default: return "INSIDE_DOOR";
  }
}
function nodePos(g: Game, name: string) { const n = g.map.nodes[g.map.nodeIdx[name]]; return new THREE.Vector3(n.x, n.y, n.z); }
function lookOut(g: Game, a: Actor) {
  const b = a.brain!;
  if (b.heardT > 0 && b.heardPos) return b.heardPos.clone().add(new THREE.Vector3(0, 1, 0));
  const s = a.team === 0 ? 1 : -1;
  if (a.cls === "sniper") return new THREE.Vector3(a.pos.x + s * 30, a.pos.y - 3, Math.sin(g.time * 0.3 + a.id) * 12);
  if (a.pos.y < -3) return new THREE.Vector3(a.pos.x + s * 5 * (Math.abs(a.pos.x) > 70 ? -1 : 1), a.pos.y + 1.5, Math.sin(g.time * 0.5) * 6);
  return new THREE.Vector3(a.pos.x + s * 10, a.pos.y + 1.5, a.pos.z + Math.sin(g.time * 0.5 + a.id) * 8);
}
function countStickies(g: Game, a: Actor) { return g.projectiles.filter((p) => p.owner === a && p.kind === "sticky").length; }
function angleTo(a: Actor, g: Game, p: THREE.Vector3) {
  const e = g.eye(a); const want = Math.atan2(-(p.x - e.x), -(p.z - e.z));
  let d = want - a.input.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d;
}
function aimAt(g: Game, a: Actor, p: THREE.Vector3, dt: number) {
  const e = g.eye(a);
  const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z;
  const wantYaw = Math.atan2(-dx, -dz), wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
  let d = wantYaw - a.input.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
  const speed = BOT_DIFFICULTIES[g.botDifficulty].turnSpeed;
  const rate = (a.cls === "sniper" && a.scoped ? 3 : 9) * speed;
  a.input.yaw += Math.sign(d) * Math.min(Math.abs(d), rate * dt * (0.4 + Math.min(1, Math.abs(d))));
  a.input.pitch += (Math.max(-1.4, Math.min(1.4, wantPitch)) - a.input.pitch) * Math.min(1, 8 * speed * dt);
}

// ---------- combat routines ----------
function combat(g: Game, a: Actor, dt: number): { move: THREE.Vector3 | null; look: THREE.Vector3 | null } {
  const b = a.brain;
  if (b?.target && !g.los(g.eye(a), g.center(b.target))) {
    if (b.lastSeen) { goTo(g, a, nearestNode(g, b.lastSeen), b.lastSeen); return { move: followPath(g, a), look: b.lastSeen.clone().add(new THREE.Vector3(0, 1, 0)) }; }
    return { move: null, look: null };
  }
  const result = combatRoutine(g, a, dt);
  // Gate every hostile primary attack, including flames, backstabs, and building attacks.
  // Healing and Engineer maintenance are handled outside this combat boundary.
  if (a.brain?.reactT > 0) a.input.fire = false;
  const def = a.weapons?.[a.input.slot]?.def;
  if (a.input.fire && result.look && !g.los(g.eye(a), result.look)) a.input.fire = false;
  if (a.input.fire && def?.splash && result.look && result.look.distanceTo(g.eye(a)) < def.splash && a.hp < a.maxHp * 0.6) a.input.fire = false;
  return result;
}

function combatRoutine(g: Game, a: Actor, dt: number): { move: THREE.Vector3 | null; look: THREE.Vector3 | null } {
  const b = a.brain!, inp = a.input;
  // spies & explosive classes vs buildings
  if (b.targetBld && (a.cls === "spy" || (!b.target && ["soldier", "demoman", "heavy", "scout", "pyro", "sniper"].includes(a.cls)))) {
    const bp = b.targetBld.pos.clone().add(new THREE.Vector3(0, 0.6, 0));
    if (a.cls === "spy") {
      inp.slot = 2;
      if (a.cloaked && bp.distanceTo(a.pos) < 4) inp.alt = !a.altPrev;
      if (bp.distanceTo(g.eye(a)) < 2.4 && !a.cloaked) inp.fire = true;
      return { move: b.targetBld.sappedBy ? null : bp, look: bp };
    }
    inp.slot = a.cls === "demoman" ? 0 : a.cls === "sniper" ? 0 : 0;
    bp.addScaledVector(b.aimErr, Math.min(1.5, bp.distanceTo(g.eye(a)) * 0.05));
    if (Math.abs(angleTo(a, g, bp)) < 0.2) inp.fire = true;
    if (a.cls === "sniper" && !a.scoped) inp.alt = !a.altPrev;
    return { move: null, look: bp };
  }
  const t = b.target;
  if (!t) return { move: null, look: null };
  const tc = g.center(t), d = tc.distanceTo(g.eye(a));
  const aimP = tc.clone().addScaledVector(b.aimErr, Math.min(1.5, d * 0.05));
  let look = aimP, move: THREE.Vector3 | null = null;
  let pref = 8;
  const canShoot = b.reactT <= 0 && Math.abs(angleTo(a, g, aimP)) < 0.25;
  if (b.strafeT <= 0) { b.strafe = Math.random() < 0.5 ? -1 : 1; b.strafeT = 0.6 + Math.random(); }

  switch (a.cls) {
    case "scout":
      pref = 4; inp.slot = d < 2 ? 2 : d > 15 ? 1 : 0;
      if (Math.random() < 0.04) inp.jump = true;
      if (!a.onGround && a.airJump && Math.random() < 0.1) inp.jump = true;
      inp.fire = canShoot && d < 25; break;
    case "soldier": {
      pref = 9; inp.slot = d < 2.5 ? 2 : 0;
      if (inp.slot === 0) {
        const lead = t.vel.clone().multiplyScalar(d / 28);
        look = t.pos.clone().add(lead).add(new THREE.Vector3(0, 0.1, 0)).addScaledVector(b.aimErr, Math.min(1.5, d * 0.05)); // rockets at the feet
        if (t.pos.y > a.pos.y + 4 && t.cls === "sniper" && a.onGround && d < 22 && a.hp > 120) { look = a.pos.clone().add(new THREE.Vector3(0, -1, 0)); inp.jump = true; inp.fire = a.input.pitch < -1.1; return { move: tc, look }; }
      }
      inp.fire = b.reactT <= 0 && Math.abs(angleTo(a, g, look)) < 0.3 && (d > 3 || a.hp > 100); break;
    }
    case "pyro": {
      pref = 2.5; inp.slot = d > 9 ? 1 : 0;
      for (const p of g.projectiles) {
        if (p.team === a.team || p.kind === "syringe") continue;
        if (p.pos.distanceTo(g.eye(a)) < 5) { inp.slot = 0; look = p.pos.clone(); inp.alt = !a.altPrev; break; }
      }
      inp.fire = b.reactT <= 0 && (inp.slot === 0 ? d < 7 : canShoot) && Math.abs(angleTo(a, g, look)) < 0.4;
      move = tc; break;
    }
    case "demoman":
      pref = 11; inp.slot = d < 2.5 ? 2 : 0;
      if (inp.slot === 0) look = t.pos.clone().add(new THREE.Vector3(0, d * d * 0.012 + 0.2, 0)).addScaledVector(b.aimErr, Math.min(1.5, d * 0.05));
      inp.fire = b.reactT <= 0 && Math.abs(angleTo(a, g, look)) < 0.3 && (inp.slot === 2 ? d < 2.6 : d > 3);
      // detonate stickies near enemy
      for (const p of g.projectiles) if (p.owner === a && p.kind === "sticky" && p.stuck && p.pos.distanceTo(tc) < 3) { inp.alt = !a.altPrev; break; }
      break;
    case "heavy":
      pref = 9; inp.slot = d < 1.8 ? 2 : 0;
      inp.alt = true; inp.fire = canShoot && d < 30; break;
    case "engineer": {
      pref = 6; inp.slot = d < 2 ? 2 : 0; inp.fire = canShoot && d < 20;
      const sentry = g.buildings.find((x) => x.owner === a && x.type === "sentry");
      if (sentry && sentry.pos.distanceTo(a.pos) > 3) move = sentry.pos.clone().add(new THREE.Vector3(a.team === 0 ? -1.5 : 1.5, 0, 0));
      break;
    }
    case "medic":
      pref = 10;
      if (!a.healTarget || d < 5) { inp.slot = d < 2 ? 2 : 0; inp.fire = canShoot; }
      if (a.healTarget && (a.hp < a.maxHp * 0.25 || a.healTarget.hp < a.healTarget.maxHp * 0.4) && a.uber >= 1) inp.alt = !a.altPrev;
      break;
    case "sniper": {
      pref = 30;
      if (d < 7) { if (a.scoped) inp.alt = !a.altPrev; inp.slot = d < 2 ? 2 : 1; inp.fire = canShoot; break; }
      inp.slot = 0;
      if (!a.scoped && a.onGround) inp.alt = !a.altPrev;
      const hy = t.pos.y + t.h - 0.2;
      look = new THREE.Vector3(t.pos.x, hy, t.pos.z).add(b.aimErr);
      inp.fire = a.scoped && b.reactT <= 0 && (a.charge > 0.6 || t.hp < 60) && Math.abs(angleTo(a, g, look)) < 0.03;
      return { move: null, look };
    }
    case "spy": {
      // sneak into rear arc for backstab
      const tf = new THREE.Vector3(-Math.sin(t.yaw), 0, -Math.cos(t.yaw));
      const behind = t.pos.clone().addScaledVector(tf, -1.2);
      const toT = new THREE.Vector3(t.pos.x - a.pos.x, 0, t.pos.z - a.pos.z).normalize();
      const inRear = tf.dot(toT) > 0.2;
      if (d < 7 && !t.brain?.target) {
        if (a.cloaked && d < 5) inp.alt = !a.altPrev;
        inp.slot = 1; move = d < 2 && inRear ? t.pos.clone() : behind;
        look = tc;
        inp.fire = !a.cloaked && d < 2 && inRear;
      } else if (t.brain?.target === a || a.hp < 60) {
        inp.slot = 0; inp.fire = canShoot && !a.cloaked;
        if (d < 2) { inp.slot = 1; inp.fire = true; }
      } else { move = behind; inp.slot = 1; inp.fire = !a.cloaked && d < 2 && inRear; }
      return { move, look };
    }
  }
  if (!move) {
    const toT = new THREE.Vector3(t.pos.x - a.pos.x, 0, t.pos.z - a.pos.z); const L = toT.length() || 1; toT.divideScalar(L);
    const side = new THREE.Vector3(-toT.z, 0, toT.x).multiplyScalar(b.strafe);
    const approach = L > pref + 2 ? 1 : L < pref - 2 ? -0.6 : 0;
    const v = side.addScaledVector(toT, approach);
    // don't strafe off ledges into the moat unintentionally
    const probe = a.pos.clone().addScaledVector(v, 1.2);
    if (!g.world.overlaps(probe.x, probe.y - 1.2, probe.z, 1.1, 0.2)) v.multiplyScalar(-1);
    move = a.pos.clone().addScaledVector(v, 3);
  }
  void dt;
  return { move, look };
}

function medicFollow(g: Game, a: Actor): { move: THREE.Vector3 | null; look: THREE.Vector3 | null } {
  let pat: Actor | null = null, bs = -Infinity;
  for (const o of g.actors) {
    if (!o.alive || o.team !== a.team || o === a || (o.cls === "medic")) continue;
    const d = o.pos.distanceTo(a.pos);
    if (d > 170) continue;
    let s = -d + (o.cls === "heavy" ? 25 : o.cls === "soldier" ? 18 : 0) + (1 - o.hp / o.maxHp) * 30 + (o.carrying ? 30 : 0);
    if (a.healTarget === o) s += 15;
    if (g.medicCall?.actor === o && g.medicCall.until > g.time) s += 80;
    if (s > bs) { bs = s; pat = o; }
  }
  if (!pat) return { move: null, look: null };
  a.input.slot = 1; a.input.fire = true;
  const pc = g.center(pat);
  if (a.healTarget && a.uber >= 1 && (a.hp < a.maxHp * 0.25 || g.buildings.some((b) => b.team !== a.team && b.type === "sentry" && b.pos.distanceTo(pat!.pos) < 18))) a.input.alt = !a.altPrev;
  const d = pat.pos.distanceTo(a.pos);
  if (d > 9 || !g.los(g.eye(a), pc)) {
    a.brain!.goalPos = pat.pos.clone();
    goTo(g, a, nearestNode(g, pat.pos, false), pat.pos.clone());
    return { move: followPath(g, a) ?? pat.pos.clone(), look: pc };
  }
  // stand ~4 units behind patient
  const back = pat.pos.clone().sub(a.pos).setY(0).normalize();
  return { move: d > 4.5 ? pat.pos.clone().addScaledVector(back, -4) : d < 3 ? a.pos.clone().addScaledVector(back, -2) : null, look: pc };
}

function engineerLogic(g: Game, a: Actor, dt: number): THREE.Vector3 | null {
  const b = a.brain!, inp = a.input;
  const mine = (t: BldType) => g.buildings.find((x) => x.owner === a && x.type === t);
  const nest = a.id % 2 ? "INTEL_CORNER" : "COURTYARD";
  const plan: [BldType, string][] = [["sentry", nest], ["dispenser", nest], ["tele_in", "SPAWN"], ["tele_out", "INSIDE_DOOR"]];
  const todo = plan.find(([t]) => !mine(t));
  if (todo && a.metal < BUILD_COST[todo[0]]) {
    const dispenser = mine('dispenser');
    if (dispenser && dispenser.buildT <= 0 && !dispenser.sappedBy) { goTo(g, a, nearestNode(g, dispenser.pos), dispenser.pos); return a.pos.distanceTo(dispenser.pos) > 2 ? followPath(g, a) : null; }
    goTo(g, a, tn(a, "SPAWN")); return followPath(g, a);
  }
  if (todo && a.metal >= BUILD_COST[todo[0]]) {
    const [type, where] = todo;
    goTo(g, a, tn(a, where));
    const np = nodePos(g, tn(a, where));
    const mv = followPath(g, a);
    if (a.pos.distanceTo(np) < 2.2 || !mv) {
      const angle = b.buildStep * 0.7;
      const off = new THREE.Vector3(Math.cos(angle) * 2.2, 0, Math.sin(angle) * 2.2);
      const pos = new THREE.Vector3(a.pos.x, a.pos.y, a.pos.z).add(off);
      const down = g.world.ray(pos.x, a.pos.y + 1, pos.z, 0, -1, 0, 3);
      if (down) pos.y = a.pos.y + 1 - down.t;
      const yaw = a.team === 0 ? -Math.PI / 2 : Math.PI / 2;
      if (!g.placeBuilding(a, type, pos, yaw)) b.buildStep++; else b.buildStep = 0;
      return null;
    }
    return mv;
  }
  // maintain: whack the most damaged / un-upgraded building
  const blds = g.buildings.filter((x) => x.team === a.team && (x.owner === a || x.sappedBy || x.hp < x.maxHp * 0.5));
  let job = blds.find((x) => x.sappedBy) ?? blds.sort((p, q) => p.hp / p.maxHp - q.hp / q.maxHp)[0];
  const s = mine("sentry"), dsp = mine("dispenser");
  if (job && job.hp >= job.maxHp && s && s.level < 3 && a.metal > 0) job = s;
  else if (job && job.hp >= job.maxHp && dsp && dsp.level < 3 && a.metal > 0) job = dsp;
  if (!job) return null;
  if (a.metal <= 0 && !mine("dispenser")) { goTo(g, a, tn(a, "SPAWN")); return followPath(g, a); }
  inp.slot = 2;
  const jp = job.pos.clone().add(new THREE.Vector3(0, 0.5, 0));
  if (jp.distanceTo(a.pos) > 1.8) { goTo(g, a, nearestNode(g, job.pos), job.pos); return walkClear(g, a, job.pos) ? job.pos : followPath(g, a); }
  aimAt(g, a, jp, dt);
  inp.fire = true;
  return null;
}
