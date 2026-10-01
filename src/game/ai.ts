// @ts-nocheck
import * as THREE from "three";
import type { Actor, Game, Team, Building, BldType } from "./game";
import type { NavNode } from "./map";

export type BotState = "IDLE" | "PATROL" | "PURSUE_OBJECTIVE" | "ENGAGE_ENEMY" | "RETREAT_FOR_HEALTH" | "DEFEND_CHOKE" | "BUILD_NEST";
export type Brain = {
  state: BotState; path: number[]; goal: number; goalPos: THREE.Vector3 | null; repathT: number; thinkT: number;
  target: Actor | null; targetBld: Building | null; seenT: number; reactT: number; strafe: number; strafeT: number;
  stuckT: number; lastPos: THREE.Vector3; bias: Map<string, number>; idleT: number; aimErr: THREE.Vector3;
  heardT: number; heardPos: THREE.Vector3 | null; buildStep: number; stickyT: number; home: string; lookYaw: number;
  reset: (g: Game) => void; hurtBy: (a: Actor, g: Game) => void;
};

const SEWER_EDGE = /SEWER|MOAT/;

export function makeBrain(a: Actor): Brain {
  const b: Brain = {
    state: "IDLE", path: [], goal: -1, goalPos: null, repathT: 0, thinkT: 0, target: null, targetBld: null, seenT: 0,
    reactT: 0, strafe: 1, strafeT: 0, stuckT: 0, lastPos: new THREE.Vector3(), bias: new Map(), idleT: 1 + Math.random(),
    aimErr: new THREE.Vector3(), heardT: 0, heardPos: null, buildStep: 0, stickyT: 0, home: "", lookYaw: 0,
    reset() { b.state = "IDLE"; b.path = []; b.goal = -1; b.target = null; b.idleT = 0.5 + Math.random(); b.buildStep = 0; b.stickyT = 0; b.lastPos.copy(a.pos); rollBias(); },
    hurtBy(from) { if (!b.target || Math.random() < 0.5) { b.target = from; b.seenT = 2.5; b.reactT = 0.15; } },
  };
  const rollBias = () => { b.bias.clear(); };
  return b;
}

// ---------- navigation ----------
function edgeCost(a: Actor, b: Brain, from: NavNode, to: NavNode) {
  const key = from.id < to.id ? `${from.id}-${to.id}` : `${to.id}-${from.id}`;
  let r = b.bias.get(key);
  if (r === undefined) { r = 0.7 + Math.random() * 0.9; b.bias.set(key, r); }
  let c = Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z) * r;
  const sewer = SEWER_EDGE.test(from.name) || SEWER_EDGE.test(to.name);
  if (a.cls === "scout" && sewer) c *= 0.5;
  if (a.cls === "spy" && sewer) c *= 0.7;
  return c;
}
export function astar(g: Game, a: Actor, start: number, goal: number): number[] {
  const N = g.map.nodes;
  const open = new Set([start]);
  const gs = new Map<number, number>([[start, 0]]);
  const fs = new Map<number, number>();
  const came = new Map<number, number>();
  const h = (i: number) => Math.hypot(N[i].x - N[goal].x, N[i].y - N[goal].y, N[i].z - N[goal].z);
  fs.set(start, h(start));
  while (open.size) {
    let cur = -1, bf = Infinity;
    for (const o of open) { const f = fs.get(o) ?? Infinity; if (f < bf) { bf = f; cur = o; } }
    if (cur === goal) {
      const path = [cur];
      while (came.has(cur)) { cur = came.get(cur)!; path.unshift(cur); }
      return path;
    }
    open.delete(cur);
    for (const nb of N[cur].edges) {
      const t = (gs.get(cur) ?? Infinity) + edgeCost(a, a.brain!, N[cur], N[nb]);
      if (t < (gs.get(nb) ?? Infinity)) { came.set(nb, cur); gs.set(nb, t); fs.set(nb, t + h(nb)); open.add(nb); }
    }
  }
  return [goal];
}
export function nearestNode(g: Game, p: THREE.Vector3, needLos = true) {
  let best = -1, bd = Infinity;
  for (const n of g.map.nodes) {
    const d = Math.hypot(n.x - p.x, (n.y - p.y) * 3, n.z - p.z);
    if (d < bd && (!needLos || d > 40 || g.los(new THREE.Vector3(p.x, p.y + 1, p.z), new THREE.Vector3(n.x, n.y + 1, n.z)))) { bd = d; best = n.id; }
  }
  if (best < 0) return nearestNode(g, p, false);
  return best;
}
const tn = (a: Actor | Team, name: string) => (typeof a === "number" ? (a === 0 ? "B_" : "R_") : a.team === 0 ? "B_" : "R_") + name;

function goTo(g: Game, a: Actor, nodeName: string | number, pos?: THREE.Vector3) {
  const b = a.brain!;
  const id = typeof nodeName === "number" ? nodeName : g.map.nodeIdx[nodeName];
  if (b.goal !== id || b.repathT <= 0 || !b.path.length) {
    b.goal = id;
    b.path = astar(g, a, nearestNode(g, a.pos), id);
    b.repathT = 3;
  }
  b.goalPos = pos ?? null;
}
function followPath(g: Game, a: Actor): THREE.Vector3 | null {
  const b = a.brain!;
  while (b.path.length) {
    const n = g.map.nodes[b.path[0]];
    const dx = n.x - a.pos.x, dz = n.z - a.pos.z;
    if (Math.hypot(dx, dz) < 1.3 && Math.abs(n.y - a.pos.y) < 2.2) { b.path.shift(); continue; }
    return new THREE.Vector3(n.x, n.y, n.z);
  }
  return b.goalPos;
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
    b.thinkT = 0.25;
    const per = perceive(g, a);
    if (per.enemy) { if (b.target !== per.enemy) b.reactT = a.cls === "sniper" ? 0.25 : 0.2; b.target = per.enemy; b.seenT = 1.5; }
    else if (b.seenT <= 0) b.target = null;
    if (b.target && !b.target.alive) b.target = null;
    b.targetBld = per.bld;
    b.state = chooseState(g, a);
    const sniperMiss = a.cls === "sniper" && Math.random() < 0.28;
    b.aimErr.set((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(sniperMiss ? 4.5 : a.cls === "sniper" ? 0.12 : 0.45);
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
      if (a.carrying) goTo(g, a, tn(a, "INTEL_VAULT"), own.home);
      else if (own.state !== "AT_BASE" && own.carrier) { goTo(g, a, nearestNode(g, own.carrier.pos, false), own.carrier.pos); }
      else if (own.state === "DROPPED") goTo(g, a, nearestNode(g, own.pos, false), own.pos);
      else if (enemyFlag.state === "CARRIED" && enemyFlag.carrier) goTo(g, a, nearestNode(g, enemyFlag.carrier.pos, false), enemyFlag.carrier.pos.clone().add(new THREE.Vector3(2, 0, 2)));
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
      goTo(g, a, b.goal >= 0 ? b.goal : tn(a, "COURTYARD"));
      moveTo = followPath(g, a);
      if (!moveTo) b.goal = g.map.nodes.filter((n) => n.team === a.team)[Math.floor(Math.random() * 20)].id;
    }
  }
  // medics override: always heal
  if (a.cls === "medic" && b.state !== "RETREAT_FOR_HEALTH") {
    const r = medicFollow(g, a);
    if (b.state !== "ENGAGE_ENEMY" || a.healTarget) { moveTo = r.move ?? moveTo; look = r.look ?? look; }
  }
  // steering
  if (moveTo) {
    const d = new THREE.Vector3(moveTo.x - a.pos.x, 0, moveTo.z - a.pos.z);
    const L = d.length();
    if (L > 0.3) { d.divideScalar(L); inp.wx = d.x; inp.wz = d.z; } else { inp.wx = inp.wz = 0; }
    if (!look) look = new THREE.Vector3(moveTo.x, a.pos.y + a.h - 0.2 + (moveTo.y - a.pos.y) * 0.3, moveTo.z);
    if (a.inWater) inp.jump = moveTo.y > a.pos.y + 0.5 || a.pos.y + a.h < -2.2;
  } else if (b.state !== "ENGAGE_ENEMY") { inp.wx = inp.wz = 0; }
  // stuck detection
  if (Math.hypot(inp.wx, inp.wz) > 0.1) {
    b.stuckT += dt;
    if (b.stuckT > 0.8) {
      if (a.pos.distanceTo(b.lastPos) < 0.8) { inp.jump = true; if (b.stuckT > 2.5) { b.repathT = 0; b.path = []; b.stuckT = 0; inp.wx = -inp.wz; } }
      else { b.stuckT = 0; b.lastPos.copy(a.pos); }
    }
  }
  if (look) aimAt(g, a, look, dt);
}

function chooseState(g: Game, a: Actor): import("./ai").BotState {
  const b = a.brain!;
  const own = g.flags[a.team];
  const u: Record<string, number> = { PATROL: 10, PURSUE_OBJECTIVE: 0, ENGAGE_ENEMY: 0, RETREAT_FOR_HEALTH: 0, DEFEND_CHOKE: 0, BUILD_NEST: 0 };
  const role = a.cls;
  if (["scout", "soldier", "spy", "pyro"].includes(role)) u.PURSUE_OBJECTIVE = 40;
  if (["heavy", "demoman", "sniper"].includes(role)) u.DEFEND_CHOKE = 40;
  if (role === "pyro" && a.id % 2 === 0) u.DEFEND_CHOKE = 45;
  if (role === "heavy" && g.actors.some((m) => m.alive && m.healTarget === a)) u.PURSUE_OBJECTIVE = 60; // pocketed heavy pushes
  if (role === "engineer") u.BUILD_NEST = 45;
  if (a.carrying) u.PURSUE_OBJECTIVE = 150;
  if (own.state !== "AT_BASE") u.PURSUE_OBJECTIVE = Math.max(u.PURSUE_OBJECTIVE, role === "sniper" || role === "engineer" ? 30 : 90);
  if (b.target) u.ENGAGE_ENEMY = 70 + (b.target.carrying ? 100 : 0) - (a.carrying ? 90 : 0);
  if (a.cls === "spy" && b.target && a.cloaked && !b.target.carrying) u.ENGAGE_ENEMY = 30;
  if (a.cls === "spy" && b.targetBld && b.targetBld.type === "sentry") u.ENGAGE_ENEMY = 90;
  if (b.targetBld && ["soldier", "demoman"].includes(a.cls)) u.ENGAGE_ENEMY = Math.max(u.ENGAGE_ENEMY, 60);
  const healed = g.actors.some((m) => m.alive && m.healTarget === a);
  if (a.hp < a.maxHp * 0.3 && !healed) u.RETREAT_FOR_HEALTH = a.carrying ? 60 : 95;
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
  const rate = a.cls === "sniper" && a.scoped ? 3 : 9;
  a.input.yaw += Math.sign(d) * Math.min(Math.abs(d), rate * dt * (0.4 + Math.min(1, Math.abs(d))));
  a.input.pitch += (Math.max(-1.4, Math.min(1.4, wantPitch)) - a.input.pitch) * Math.min(1, 8 * dt);
}

// ---------- combat routines ----------
function combat(g: Game, a: Actor, dt: number): { move: THREE.Vector3 | null; look: THREE.Vector3 | null } {
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
        look = t.pos.clone().add(lead).add(new THREE.Vector3(0, 0.1, 0)); // rockets at the feet
        if (t.pos.y > a.pos.y + 4 && t.cls === "sniper" && a.onGround && d < 22 && a.hp > 120) { look = a.pos.clone().add(new THREE.Vector3(0, -1, 0)); inp.jump = true; inp.fire = a.input.pitch < -1.1; return { move: tc, look }; }
      }
      inp.fire = b.reactT <= 0 && Math.abs(angleTo(a, g, look)) < 0.3 && (d > 3 || a.hp > 100); break;
    }
    case "pyro": {
      pref = 2.5; inp.slot = d > 9 ? 1 : 0;
      for (const p of g.projectiles) {
        if (p.team === a.team || p.kind === "syringe") continue;
        if (p.pos.distanceTo(g.eye(a)) < 5) { look = p.pos.clone(); inp.alt = !a.altPrev; break; }
      }
      inp.fire = (inp.slot === 0 ? d < 7 : canShoot) && Math.abs(angleTo(a, g, look)) < 0.4;
      move = tc; break;
    }
    case "demoman":
      pref = 11; inp.slot = d < 2.5 ? 2 : 0;
      if (inp.slot === 0) look = t.pos.clone().add(new THREE.Vector3(0, d * d * 0.012 + 0.2, 0));
      inp.fire = b.reactT <= 0 && Math.abs(angleTo(a, g, look)) < 0.3 && d > 3;
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
      if (d < 7) { inp.slot = d < 2 ? 2 : 1; inp.fire = canShoot; break; }
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
    if (d > 40) continue;
    let s = -d + (o.cls === "heavy" ? 25 : o.cls === "soldier" ? 18 : 0) + (1 - o.hp / o.maxHp) * 30 + (o.carrying ? 30 : 0);
    if (a.healTarget === o) s += 15;
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
  if (todo && a.metal < 100 && !mine("dispenser")) { goTo(g, a, tn(a, "SPAWN")); return followPath(g, a); }
  if (todo && a.metal >= 50) {
    const [type, where] = todo;
    goTo(g, a, tn(a, where));
    const np = nodePos(g, tn(a, where));
    const mv = followPath(g, a);
    if (a.pos.distanceTo(np) < 2.2 || !mv) {
      const off = type === "dispenser" ? new THREE.Vector3(0, 0, 1.6) : type === "sentry" ? new THREE.Vector3(a.team === 0 ? 1 : -1, 0, -0.8) : new THREE.Vector3(0.9, 0, 0.9);
      const pos = new THREE.Vector3(a.pos.x, a.pos.y, a.pos.z).add(off);
      const down = g.world.ray(pos.x, a.pos.y + 1, pos.z, 0, -1, 0, 3);
      if (down) pos.y = a.pos.y + 1 - down.t;
      const yaw = a.team === 0 ? -Math.PI / 2 : Math.PI / 2;
      if (!g.placeBuilding(a, type, pos, yaw)) { b.buildStep++; if (b.buildStep > 40) { a.pos.x += (Math.random() - 0.5); b.buildStep = 0; } }
      return null;
    }
    return mv;
  }
  // maintain: whack the most damaged / un-upgraded building
  const blds = g.buildings.filter((x) => x.owner === a && x.type !== "tele_in" && x.type !== "tele_out");
  let job = blds.find((x) => x.sappedBy) ?? blds.sort((p, q) => p.hp / p.maxHp - q.hp / q.maxHp)[0];
  const s = mine("sentry");
  if (job && job.hp >= job.maxHp && s && s.level < 3 && a.metal > 0) job = s;
  if (!job) return null;
  if (a.metal <= 0 && !mine("dispenser")) { goTo(g, a, tn(a, "SPAWN")); return followPath(g, a); }
  inp.slot = 2;
  const jp = job.pos.clone().add(new THREE.Vector3(0, 0.5, 0));
  if (jp.distanceTo(a.pos) > 1.8) { b.goalPos = jp; return jp; }
  aimAt(g, a, jp, dt);
  inp.fire = true;
  return null;
}
