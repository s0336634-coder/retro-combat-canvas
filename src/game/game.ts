// @ts-nocheck
import * as THREE from "three";
import { buildMap, TEAM_SIGN, WATER_Y, MOAT_X, type GameMap } from "./map";
import { World, rayBox } from "./physics";
import { CLASSES, CLASS_ORDER, BASE_SPEED, BUILD_COST, type ClassId, type WeaponDef } from "./classes";
import { botThink, makeBrain, type Brain } from "./ai";

export type Team = 0 | 1;
export const TEAM_NAME = ["BLU", "RED"];
export const TEAM_COLOR = [0x4f86b3, 0xc0453a];
export type Input = { wx: number; wz: number; jump: boolean; crouch: boolean; fire: boolean; alt: boolean; yaw: number; pitch: number; slot: number; reload: boolean };
export type WState = { def: WeaponDef; clip: number; reserve: number };
export type BldType = "sentry" | "dispenser" | "tele_in" | "tele_out";

export type Actor = {
  id: number; name: string; team: Team; cls: ClassId; pendingCls: ClassId | null; isBot: boolean;
  pos: THREE.Vector3; vel: THREE.Vector3; yaw: number; pitch: number; hp: number; maxHp: number;
  alive: boolean; respawnT: number; onGround: boolean; h: number; slot: number; weapons: WState[];
  nextFire: number; reloadT: number; airJump: boolean; jumpHeld: boolean; altPrev: boolean;
  burnT: number; burnBy: Actor | null; burnTick: number; uber: number; uberT: number; invulnT: number;
  metal: number; cloaked: boolean; cloak: number; disguised: boolean; revT: number; scoped: boolean; charge: number;
  healTarget: Actor | null; air: number; drownTick: number; input: Input; mesh: THREE.Group; bodyMat: THREE.MeshLambertMaterial;
  mats: THREE.MeshLambertMaterial[]; gunMesh: THREE.Group; brain: Brain | null; kills: number; deaths: number; streak: number;
  carrying: boolean; buildMode: BldType | null; lastAttacker: Actor | null; airblastT: number; inWater: boolean; weaponAnim: number;
};
export type Building = {
  id: number; type: BldType; team: Team; owner: Actor; pos: THREE.Vector3; hp: number; maxHp: number; level: number;
  upgrade: number; sappedBy: Actor | null; mesh: THREE.Group; head: THREE.Object3D | null; nextFire: number; rocketT: number;
  yaw: number; buildT: number; tickT: number;
};
export type Projectile = {
  kind: "rocket" | "grenade" | "sticky" | "syringe"; team: Team; owner: Actor; pos: THREE.Vector3; vel: THREE.Vector3;
  mesh: THREE.Mesh; life: number; stuck: boolean; dmg: number; radius: number; dead: boolean;
};
export type FlagState = "AT_BASE" | "CARRIED" | "DROPPED";
export type Flag = { team: Team; state: FlagState; pos: THREE.Vector3; home: THREE.Vector3; carrier: Actor | null; returnT: number; mesh: THREE.Group };
export type Pickup = { type: string; pos: THREE.Vector3; active: boolean; respawnT: number; mesh: THREE.Mesh; temp: number };
export type Sound = { x: number; y: number; z: number; r: number; team: Team; t: number };
export type HudState = ReturnType<Game["getHud"]>;

const G = 20;
const FLAG_RETURN = 60;
const RESPAWN = 10;
const WIN_CAPS = 3;

export class Game {
  map: GameMap = buildMap();
  world = new World(this.map.boxes);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(80, 1, 0.05, 400);
  renderer: THREE.WebGLRenderer;
  actors: Actor[] = [];
  buildings: Building[] = [];
  projectiles: Projectile[] = [];
  pickups: Pickup[] = [];
  flags: Flag[] = [];
  sounds: Sound[] = [];
  scores = [0, 0];
  killfeed: { text: string; team: Team; t: number }[] = [];
  message = ""; messageT = 0;
  winner: Team | null = null; winT = 0;
  time = 0;
  player!: Actor;
  keys = new Set<string>();
  mouse = { l: false, r: false };
  locked = false;
  private raf = 0;
  private last = 0;
  private fx: { obj: THREE.Object3D; t: number; life: number; kind: string; vel?: THREE.Vector3 }[] = [];
  private beams = new Map<Actor, THREE.Line>();
  private ghost: THREE.Mesh;
  private ghostValid = false;
  private ghostPos = new THREE.Vector3();
  private viewmodel: THREE.Group;
  private viewmodelKey = "";
  private idc = 1;
  private hitT = 0;
  private minimap: HTMLCanvasElement | null;
  private matCache = new Map<number, THREE.MeshLambertMaterial>();
  private disposers: (() => void)[] = [];
  private hurtDirection = 0;

  constructor(private canvas: HTMLCanvasElement, minimap: HTMLCanvasElement | null, team: Team, cls: ClassId) {
    this.minimap = minimap;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color(0x9cc4dd);
    this.scene.fog = new THREE.Fog(0x9cc4dd, 60, 170);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);
    this.buildWorld();
    const gm = new THREE.MeshBasicMaterial({ color: 0x33ff66, transparent: true, opacity: 0.4 });
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), gm);
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.viewmodel = new THREE.Group();
    this.viewmodel.position.set(0.32, -0.28, -0.7);
    this.camera.add(this.viewmodel);

    // actors
    this.player = this.spawnActor(team, cls, false, "You");
    for (const t of [0, 1] as Team[]) {
      let roster = [...CLASS_ORDER];
      if (t === team) roster = roster.filter((c, i) => c !== cls || i === -1);
      for (const c of roster) this.spawnActor(t, c, true, `${TEAM_NAME[t]} ${CLASSES[c].name}`);
    }
    this.bindInput();
    this.resize();
  }

  // ---------------- world construction ----------------
  mat(color: number) {
    let m = this.matCache.get(color);
    if (!m) { m = new THREE.MeshLambertMaterial({ color }); this.matCache.set(color, m); }
    return m;
  }
  makeWeaponModel(def: WeaponDef, team: Team, firstPerson = false) {
    const g = new THREE.Group();
    const base = new THREE.MeshLambertMaterial({ color: def.color });
    const dark = new THREE.MeshLambertMaterial({ color: 0x242424 });
    const metal = new THREE.MeshLambertMaterial({ color: 0x8a8d89 });
    const accent = new THREE.MeshLambertMaterial({ color: TEAM_COLOR[team] });
    const wood = new THREE.MeshLambertMaterial({ color: 0x704729 });
    const box = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); mesh.position.set(x, y, z); g.add(mesh); return mesh;
    };
    const tube = (r: number, len: number, mat: THREE.Material, x = 0, y = 0, z = 0, sides = 10) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, sides), mat); mesh.rotation.x = Math.PI / 2; mesh.position.set(x, y, z); g.add(mesh); return mesh;
    };
    const melee = ["melee", "knife", "wrench"].includes(def.kind);
    if (melee) {
      if (def.name === "Fists") {
        for (const x of [-0.18, 0.18]) { const fist = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), base); fist.position.set(x, -0.02, -0.5); g.add(fist); }
      } else {
        box(0.07, 0.08, 0.68, def.name === "Bottle" ? base : wood, 0, -0.03, -0.02);
        if (def.kind === "knife" || def.name === "Kukri") {
          const blade = box(def.name === "Kukri" ? 0.1 : 0.045, 0.13, 0.48, metal, 0, 0.02, -0.57); blade.rotation.x = def.name === "Kukri" ? -0.22 : -0.08;
        } else if (def.kind === "wrench") {
          box(0.12, 0.07, 0.36, metal, 0, 0.02, -0.5); box(0.3, 0.08, 0.12, metal, 0, 0.02, -0.69);
        } else if (def.name === "Shovel") {
          const spade = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.1, 0.3, 4), metal); spade.rotation.x = Math.PI / 2; spade.position.z = -0.58; g.add(spade);
        } else if (def.name === "Fire Axe") {
          const axe = box(0.48, 0.22, 0.1, base, 0, 0.02, -0.58); axe.rotation.z = -0.1;
        } else if (def.name === "Bonesaw") {
          box(0.09, 0.28, 0.42, metal, 0, 0.05, -0.55); for (let i = 0; i < 4; i++) box(0.035, 0.08, 0.08, metal, 0, -0.12, -0.4 - i * 0.1);
        } else if (def.name === "Bottle") {
          tube(0.13, 0.38, base, 0, 0, -0.47, 8); tube(0.06, 0.18, base, 0, 0, -0.75, 8);
        } else { tube(0.09, 0.5, base, 0, 0, -0.46, def.name === "Bat" ? 10 : 8); }
      }
    } else if (def.kind === "minigun") {
      tube(0.22, 0.48, base, 0, 0, -0.12, 12); box(0.28, 0.28, 0.28, dark, 0, 0, 0.18);
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; tube(0.025, 0.62, metal, Math.cos(a) * 0.11, Math.sin(a) * 0.11, -0.62, 6); }
      tube(0.16, 0.05, dark, 0, 0, -0.95, 10);
    } else if (def.proj === "rocket") {
      tube(0.17, 0.95, base, 0, 0, -0.28, 12); tube(0.2, 0.12, dark, 0, 0, -0.8, 12);
      box(0.08, 0.13, 0.5, wood, 0, -0.17, 0.05); box(0.05, 0.12, 0.12, metal, 0, 0.19, -0.22);
    } else if (def.kind === "sniper") {
      box(0.13, 0.16, 0.95, wood, 0, 0, -0.25); tube(0.045, 0.72, metal, 0, 0.03, -0.92, 8);
      tube(0.075, 0.42, dark, 0, 0.16, -0.33, 10); box(0.06, 0.18, 0.3, wood, 0, -0.16, 0.02);
    } else if (def.kind === "flame") {
      box(0.24, 0.28, 0.48, base, 0, 0, -0.1); tube(0.08, 0.65, metal, 0, 0.02, -0.64, 10);
      tube(0.13, 0.12, dark, 0, 0.02, -1.01, 10); tube(0.11, 0.3, accent, 0.2, 0.02, 0.02, 10);
    } else if (def.kind === "medigun") {
      box(0.3, 0.3, 0.52, base, 0, 0, -0.12); tube(0.09, 0.45, accent, 0, 0.01, -0.58, 10);
      box(0.12, 0.12, 0.15, dark, 0, -0.18, 0.02);
    } else if (def.proj === "grenade" || def.proj === "sticky") {
      box(0.28, 0.25, 0.62, base, 0, 0, -0.2); tube(0.17, 0.32, dark, 0, -0.02, -0.58, 8);
      for (let i = 0; i < 3; i++) tube(0.045, 0.38, metal, (i - 1) * 0.1, 0.15, -0.15, 8);
    } else {
      box(0.18, 0.2, def.name === "Pistol" || def.name === "Revolver" ? 0.52 : 0.72, base, 0, 0, -0.2);
      tube(0.045, 0.38, metal, 0, 0.03, -0.68, 8); box(0.09, 0.24, 0.2, wood, 0, -0.18, -0.03);
      if (def.pellets && def.pellets > 1) tube(0.07, 0.12, dark, 0, 0.03, -0.92, 10);
    }
    g.scale.setScalar(firstPerson ? 0.58 : 0.72);
    g.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.userData.weaponPart = true; } });
    g.userData.weaponKey = def.name;
    return g;
  }
  buildWorld() {
    const hemi = new THREE.HemisphereLight(0xdfefff, 0x5a5040, 1.3);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
    sun.position.set(30, 60, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -90; sc.right = 90; sc.top = 40; sc.bottom = -40; sc.far = 200;
    this.scene.add(sun);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (const b of this.map.boxes) {
      const m = new THREE.Mesh(geo, this.mat(b.color));
      m.scale.set(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0);
      m.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
      m.castShadow = b.y1 > 0.5; m.receiveShadow = true;
      this.scene.add(m);
    }
    const water = new THREE.Mesh(new THREE.BoxGeometry(MOAT_X * 2, 0.05, 60),
      new THREE.MeshLambertMaterial({ color: 0x2d6f8f, transparent: true, opacity: 0.6 }));
    water.position.set(0, WATER_Y, 0);
    this.scene.add(water);
    // intel flags
    for (const t of [0, 1] as Team[]) {
      const home = new THREE.Vector3(this.map.intelHome[t].x, this.map.intelHome[t].y, this.map.intelHome[t].z);
      const g = new THREE.Group();
      const brief = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.25), new THREE.MeshLambertMaterial({ color: TEAM_COLOR[t], emissive: TEAM_COLOR[t], emissiveIntensity: 0.4 }));
      brief.position.y = 0.4;
      g.add(brief);
      this.scene.add(g);
      this.flags.push({ team: t, state: "AT_BASE", pos: home.clone(), home, carrier: null, returnT: 0, mesh: g });
    }
    for (const p of this.map.pickups) this.addPickup(p.type, new THREE.Vector3(p.x, p.y, p.z), 0);
  }
  addPickup(type: string, pos: THREE.Vector3, temp: number) {
    const hp = type.startsWith("hp");
    const size = type.endsWith("_s") ? 0.35 : type.endsWith("_m") ? 0.5 : 0.7;
    const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size),
      new THREE.MeshLambertMaterial({ color: hp ? 0xf2f2f2 : 0x6b6b3a, emissive: hp ? 0x661111 : 0x222200 }));
    m.position.copy(pos).add(new THREE.Vector3(0, size / 2 + 0.1, 0));
    this.scene.add(m);
    this.pickups.push({ type, pos: pos.clone(), active: true, respawnT: 0, mesh: m, temp });
  }

  makeActorMesh(team: Team, cls: ClassId) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: TEAM_COLOR[team] });
    const skin = new THREE.MeshLambertMaterial({ color: 0xe0b48c });
    const dark = new THREE.MeshLambertMaterial({ color: 0x3a3028 });
    const hatM = new THREE.MeshLambertMaterial({ color: CLASSES[cls].hat });
    const big = cls === "heavy" ? 1.25 : cls === "scout" || cls === "spy" ? 0.9 : 1;
    const limb = (x: number, y: number, h: number, mat: THREE.Material) => { const pivot = new THREE.Group(); pivot.position.set(x, y, 0); const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.22 * big, h, 0.25), mat); mesh.position.y = -h / 2; mesh.castShadow = true; pivot.add(mesh); g.add(pivot); return pivot; };
    const leftLeg = limb(-0.2 * big, 0.82, 0.78, dark), rightLeg = limb(0.2 * big, 0.82, 0.78, dark);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.76 * big, cls === "heavy" ? 0.78 : 0.68, 0.48 * big), bodyMat); torso.position.y = 1.15;
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.79 * big, 0.12, 0.5 * big), dark); belt.position.y = 0.88;
    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25, 1), skin); head.position.y = 1.65;
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(cls === "soldier" ? 0.3 : 0.24, 0.26, cls === "pyro" ? 0.28 : 0.14, cls === "engineer" ? 6 : 10), hatM); hat.position.y = 1.89;
    const leftArm = limb(-0.48 * big, 1.42, 0.62, bodyMat), rightArm = limb(0.48 * big, 1.42, 0.62, bodyMat);
    const gunMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
    const gun = new THREE.Group(); gun.position.set(0.35 * big, 1.1, -0.35);
    for (const m of [torso, belt, head, hat]) { m.castShadow = true; g.add(m); }
    if (cls === "medic") { const pack = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.24), hatM); pack.position.set(0, 1.2, 0.34); g.add(pack); }
    if (cls === "engineer") { const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 8), hatM); brim.position.y = 1.82; g.add(brim); }
    if (cls === "pyro") { const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.68, 8), gunMat); tank.position.set(0, 1.18, 0.38); g.add(tank); }
    if (cls === "demoman") for (let i = 0; i < 3; i++) { const grenade = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), gunMat); grenade.position.set(-0.18 + i * 0.18, 1.22, -0.27); g.add(grenade); }
    if (cls === "sniper") { const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 10), hatM); brim.position.y = 1.83; g.add(brim); }
    g.userData.leftLeg = leftLeg; g.userData.rightLeg = rightLeg; g.userData.leftArm = leftArm; g.userData.rightArm = rightArm;
    g.add(gun);
    this.scene.add(g);
    return { g, bodyMat, mats: [bodyMat, skin, dark, hatM, gunMat], gun };
  }

  spawnActor(team: Team, cls: ClassId, isBot: boolean, name: string): Actor {
    const m = this.makeActorMesh(team, cls);
    const a: Actor = {
      id: this.idc++, name, team, cls, pendingCls: null, isBot, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
      yaw: 0, pitch: 0, hp: 1, maxHp: 1, alive: false, respawnT: 0, onGround: false, h: 1.8, slot: 0, weapons: [],
      nextFire: 0, reloadT: 0, airJump: true, jumpHeld: false, altPrev: false, burnT: 0, burnBy: null, burnTick: 0,
      uber: 0, uberT: 0, invulnT: 0, metal: 200, cloaked: false, cloak: 1, disguised: false, revT: 0, scoped: false, charge: 0,
      healTarget: null, air: 12, drownTick: 0, input: { wx: 0, wz: 0, jump: false, crouch: false, fire: false, alt: false, yaw: 0, pitch: 0, slot: 0, reload: false },
      mesh: m.g, bodyMat: m.bodyMat, mats: m.mats, gunMesh: m.gun, brain: null, kills: 0, deaths: 0, streak: 0, carrying: false,
      buildMode: null, lastAttacker: null, airblastT: 0, inWater: false, weaponAnim: 0,
    };
    if (isBot) a.brain = makeBrain(a);
    this.actors.push(a);
    this.respawn(a);
    if (!isBot) a.mesh.visible = false;
    return a;
  }

  respawn(a: Actor) {
    if (a.pendingCls && a.pendingCls !== a.cls) this.changeClassNow(a, a.pendingCls);
    a.pendingCls = null;
    const c = CLASSES[a.cls];
    // pick a free, spread-out spot in the spawn room so bots don't stack and jam
    const sx = this.map.spawns[a.team][0].x > 0 ? 1 : -1;
    let bestP = null, bestScore = -Infinity;
    for (let i = 0; i < 24; i++) {
      const x = sx * (70.5 + Math.random() * 6.5), z = 11.5 + Math.random() * 4.5;
      if (this.world.overlaps(x, 0.05, z, 1.8, 0.5)) continue;
      let near = 99;
      for (const o of this.actors) if (o !== a && o.alive) near = Math.min(near, Math.hypot(o.pos.x - x, o.pos.z - z));
      if (near > bestScore) { bestScore = near; bestP = { x, z }; }
    }
    const sp = this.map.spawns[a.team][Math.floor(Math.random() * this.map.spawns[a.team].length)];
    if (bestP) a.pos.set(bestP.x, 0, bestP.z); else a.pos.set(sp.x, sp.y, sp.z);
    a.vel.set(0, 0, 0);
    a.yaw = a.team === 0 ? -Math.PI / 2 : Math.PI / 2; // face enemy side
    a.pitch = 0;
    a.input.yaw = a.yaw; a.input.pitch = 0;
    a.hp = a.maxHp = c.hp;
    a.weapons = c.weapons.map((def) => ({ def, clip: def.clip, reserve: def.reserve }));
    a.slot = 0; a.input.slot = 0;
    a.alive = true; a.uber = a.cls === "medic" ? a.uber * 0 : 0; a.uberT = 0; a.invulnT = 0;
    a.metal = 200; a.cloaked = false; a.cloak = 1; a.disguised = false; a.scoped = false; a.charge = 0; a.revT = 0;
    a.burnT = 0; a.air = 12; a.healTarget = null; a.buildMode = null; a.carrying = false;
    a.mesh.visible = !a.isBot ? false : true;
    if (a.isBot) this.syncActorWeapon(a);
    this.refreshLook(a);
    if (a.brain) a.brain.reset(this);
  }
  changeClassNow(a: Actor, cls: ClassId) {
    for (const b of this.buildings.filter((b) => b.owner === a)) this.destroyBuilding(b, null);
    this.scene.remove(a.mesh);
    const m = this.makeActorMesh(a.team, cls);
    a.mesh = m.g; a.bodyMat = m.bodyMat; a.mats = m.mats; a.gunMesh = m.gun; a.cls = cls;
    a.gunMesh.userData.weaponKey = "";
    if (!a.isBot) a.mesh.visible = false;
  }
  requestClass(cls: ClassId) {
    const a = this.player;
    if (!a.alive) { a.pendingCls = cls; return; }
    const inSpawn = this.inResupply(a);
    if (inSpawn) { a.pendingCls = cls; this.respawnInPlace(a); }
    else { a.pendingCls = cls; this.flash(`You will respawn as ${CLASSES[cls].name}`); }
  }
  respawnInPlace(a: Actor) { this.respawn(a); }

  // ---------------- input ----------------
  bindInput() {
    const kd = (e: KeyboardEvent) => {
      this.keys.add(e.code);
      if (!this.locked) return;
      const p = this.player;
      if (e.code.startsWith("Digit")) {
        const n = parseInt(e.code.slice(5));
        if (n >= 1 && n <= 3) { p.input.slot = n - 1; p.buildMode = null; }
        if (p.cls === "engineer" && n >= 4 && n <= 6) {
          const t: BldType = n === 4 ? "sentry" : n === 5 ? "dispenser" : this.buildings.some((b) => b.owner === p && b.type === "tele_in") ? "tele_out" : "tele_in";
          p.buildMode = p.buildMode === t ? null : t;
        }
        if (p.cls === "spy" && n === 4) { p.disguised = !p.disguised; this.refreshLook(p); this.flash(p.disguised ? "Disguised as enemy" : "Disguise removed"); }
      }
      if (e.code === "KeyQ") { p.input.slot = p.slot === 0 ? 1 : 0; }
      if (e.code === "Space" || e.code === "Tab") e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => this.keys.delete(e.code);
    const mm = (e: MouseEvent) => {
      if (!this.locked) return;
      const s = this.player.scoped ? 0.0006 : 0.0022;
      this.player.input.yaw -= e.movementX * s;
      this.player.input.pitch = Math.max(-1.5, Math.min(1.5, this.player.input.pitch - e.movementY * s));
    };
    const md = (e: MouseEvent) => {
      if (!this.locked) return;
      if (e.button === 0) this.mouse.l = true;
      if (e.button === 2) this.mouse.r = true;
    };
    const mu = (e: MouseEvent) => {
      if (e.button === 0) this.mouse.l = false;
      if (e.button === 2) this.mouse.r = false;
    };
    const ctx = (e: Event) => e.preventDefault();
    const plc = () => { this.locked = document.pointerLockElement === this.canvas; if (!this.locked) { this.mouse.l = this.mouse.r = false; this.keys.clear(); } };
    const rs = () => this.resize();
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    document.addEventListener("mousemove", mm); document.addEventListener("mousedown", md); document.addEventListener("mouseup", mu);
    document.addEventListener("contextmenu", ctx); document.addEventListener("pointerlockchange", plc); window.addEventListener("resize", rs);
    this.disposers.push(() => {
      window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku);
      document.removeEventListener("mousemove", mm); document.removeEventListener("mousedown", md); document.removeEventListener("mouseup", mu);
      document.removeEventListener("contextmenu", ctx); document.removeEventListener("pointerlockchange", plc); window.removeEventListener("resize", rs);
    });
  }
  lock() { this.canvas.requestPointerLock(); }
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  start() {
    this.last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
      this.drawMinimap();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  dispose() {
    cancelAnimationFrame(this.raf);
    this.disposers.forEach((d) => d());
    this.renderer.dispose();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // ---------------- helpers ----------------
  eye(a: Actor) { return new THREE.Vector3(a.pos.x, a.pos.y + a.h - 0.2, a.pos.z); }
  center(a: Actor) { return new THREE.Vector3(a.pos.x, a.pos.y + a.h * 0.55, a.pos.z); }
  dirOf(yaw: number, pitch: number) { return new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)); }
  los(from: THREE.Vector3, to: THREE.Vector3) {
    const d = to.clone().sub(from); const L = d.length(); if (L < 0.01) return true; d.divideScalar(L);
    return !this.world.ray(from.x, from.y, from.z, d.x, d.y, d.z, L - 0.1);
  }
  sound(p: THREE.Vector3, r: number, team: Team) { this.sounds.push({ x: p.x, y: p.y, z: p.z, r, team, t: this.time }); }
  flash(msg: string) { this.message = msg; this.messageT = 3; }
  feed(text: string, team: Team) { this.killfeed.unshift({ text, team, t: this.time }); this.killfeed.length = Math.min(this.killfeed.length, 6); }
  inResupply(a: Actor) {
    const r = this.map.resupply[a.team];
    return a.pos.x > r.x0 && a.pos.x < r.x1 && a.pos.z > r.z0 && a.pos.z < r.z1 && a.pos.y > r.y0 && a.pos.y < r.y1;
  }
  apparentTeam(a: Actor): Team { return a.disguised ? ((1 - a.team) as Team) : a.team; }
  refreshLook(a: Actor) {
    a.bodyMat.color.setHex(TEAM_COLOR[this.apparentTeam(a)]);
    const op = a.cloaked ? 0.06 : 1;
    for (const m of a.mats) { m.transparent = op < 1; m.opacity = op; }
  }
  isInvuln(a: Actor) { return a.uberT > 0 || a.invulnT > 0; }

  // ---------------- update ----------------
  update(dt: number) {
    this.time += dt;
    if (this.messageT > 0) this.messageT -= dt;
    this.sounds = this.sounds.filter((s) => this.time - s.t < 1.2);
    if (this.winner !== null) {
      this.winT -= dt;
      if (this.winT <= 0) this.resetRound();
    }
    this.readPlayerInput();
    for (const a of this.actors) {
      if (!a.alive) {
        a.respawnT -= dt;
        if (a.respawnT <= 0) this.respawn(a);
        continue;
      }
      if (a.brain) botThink(a, this, dt);
      this.simulate(a, dt);
    }
    this.updateProjectiles(dt);
    this.updateBuildings(dt);
    this.updateFlags(dt);
    this.updatePickups(dt);
    this.updateFx(dt);
    this.updateVisuals(dt);
  }

  readPlayerInput() {
    const p = this.player, k = this.keys, i = p.input;
    const f = (k.has("KeyW") ? 1 : 0) - (k.has("KeyS") ? 1 : 0);
    const r = (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0);
    const fx = -Math.sin(i.yaw), fz = -Math.cos(i.yaw), rx = Math.cos(i.yaw), rz = -Math.sin(i.yaw);
    let wx = fx * f + rx * r, wz = fz * f + rz * r;
    const L = Math.hypot(wx, wz); if (L > 0) { wx /= L; wz /= L; }
    i.wx = wx; i.wz = wz;
    i.jump = k.has("Space"); i.crouch = k.has("KeyC") || k.has("ControlLeft");
    i.fire = this.mouse.l; i.alt = this.mouse.r; i.reload = k.has("KeyR");
  }

  simulate(a: Actor, dt: number) {
    const c = CLASSES[a.cls], inp = a.input;
    a.yaw = inp.yaw; a.pitch = inp.pitch;
    // status effects
    if (a.uberT > 0) a.uberT -= dt;
    if (a.invulnT > 0) a.invulnT -= dt;
    if (a.airblastT > 0) a.airblastT -= dt;
    if (a.burnT > 0) {
      a.burnT -= dt; a.burnTick -= dt;
      if (a.burnTick <= 0) { a.burnTick = 0.5; this.damage(a, 4, a.burnBy, "afterburn"); if (!a.alive) return; }
    }
    if (a.cls === "medic" && a.hp < a.maxHp) a.hp = Math.min(a.maxHp, a.hp + 3 * dt);
    if (a.hp > a.maxHp) a.hp = Math.max(a.maxHp, a.hp - a.maxHp * 0.05 * dt);
    if (a.cloaked) { a.cloak -= dt / 10; if (a.cloak <= 0) { a.cloaked = false; this.refreshLook(a); } }
    else a.cloak = Math.min(1, a.cloak + dt / 20);
    if (this.inResupply(a)) this.resupplyActor(a);

    // weapon switch
    if (inp.slot !== a.slot && inp.slot < a.weapons.length) { a.slot = inp.slot; a.nextFire = Math.max(a.nextFire, this.time + 0.3); a.reloadT = 0; a.scoped = false; a.revT = 0; }

    // movement
    let speed = BASE_SPEED * c.speed;
    const w = a.weapons[a.slot];
    if (w.def.kind === "minigun" && a.revT > 0) speed *= 0.37 / 0.77;
    if (a.scoped) speed *= 0.3;
    const wantCrouch = inp.crouch;
    if (wantCrouch) a.h = 1.25;
    else if (a.h < 1.8 && !this.world.overlaps(a.pos.x, a.pos.y, a.pos.z, 1.8)) a.h = 1.8;
    if (a.h < 1.8) speed *= 0.4;
    const headY = a.pos.y + a.h;
    a.inWater = Math.abs(a.pos.x) < MOAT_X && a.pos.y < WATER_Y - 0.3;
    if (a.inWater) { speed *= 0.65; a.burnT = 0; }
    const acc = a.onGround || a.inWater ? 12 : 2.2;
    const t = Math.min(1, acc * dt);
    a.vel.x += (inp.wx * speed - a.vel.x) * t;
    a.vel.z += (inp.wz * speed - a.vel.z) * t;
    // jump
    if (inp.jump && !a.jumpHeld) {
      if (a.onGround) { a.vel.y = 7.2; a.onGround = false; }
      else if (a.cls === "scout" && a.airJump && !a.inWater) { a.vel.y = 7; a.airJump = false; a.vel.x = inp.wx * speed; a.vel.z = inp.wz * speed; }
    }
    a.jumpHeld = inp.jump;
    if (a.inWater) {
      a.vel.y -= G * 0.2 * dt; a.vel.y *= 1 - Math.min(1, 2 * dt);
      if (inp.jump) a.vel.y = 3.2;
      if (headY < WATER_Y) {
        a.air -= dt;
        if (a.air < 0) { a.drownTick -= dt; if (a.drownTick <= 0) { a.drownTick = 1; this.damage(a, 5, null, "drowning"); if (!a.alive) return; } }
      } else a.air = Math.min(12, a.air + dt * 3);
    } else { a.vel.y -= G * dt; a.air = Math.min(12, a.air + dt * 3); }
    this.moveBody(a, dt);
    if (a.pos.y < -30) this.damage(a, 9999, null, "fell");
  }

  moveBody(a: Actor, dt: number) {
    const steps = Math.max(1, Math.ceil((a.vel.length() * dt) / 0.3));
    const sdt = dt / steps;
    const W = this.world;
    a.onGround = false;
    for (let s = 0; s < steps; s++) {
      // horizontal axes with step-up
      for (const ax of ["x", "z"] as const) {
        const d = a.vel[ax] * sdt;
        if (d === 0) continue;
        const nx = ax === "x" ? a.pos.x + d : a.pos.x, nz = ax === "z" ? a.pos.z + d : a.pos.z;
        if (!W.overlaps(nx, a.pos.y, nz, a.h)) { a.pos.x = nx; a.pos.z = nz; continue; }
        let stepped = false;
        if (a.vel.y <= 0.5) for (const up of [0.35, 0.7]) {
          if (!W.overlaps(nx, a.pos.y + up, nz, a.h)) { a.pos.x = nx; a.pos.z = nz; a.pos.y += up; stepped = true; break; }
        }
        if (!stepped) a.vel[ax] = 0;
      }
      const dy = a.vel.y * sdt;
      const ny = a.pos.y + dy;
      const hit = W.overlaps(a.pos.x, ny, a.pos.z, a.h);
      if (!hit) a.pos.y = ny;
      else {
        if (dy < 0) {
          a.pos.y = Math.max(ny, hit.y1);
          if (W.overlaps(a.pos.x, a.pos.y, a.pos.z, a.h)) a.pos.y = ny - dy;
          a.onGround = true; a.airJump = true;
        }
        a.vel.y = 0;
      }
    }
    if (!a.onGround && a.vel.y <= 0 && W.overlaps(a.pos.x, a.pos.y - 0.05, a.pos.z, 0.1)) { a.onGround = true; a.airJump = true; }
  }

  resupplyActor(a: Actor) {
    a.hp = Math.max(a.hp, a.maxHp);
    for (const w of a.weapons) { w.clip = w.def.clip; w.reserve = w.def.reserve; }
    a.metal = 200; a.burnT = 0; a.cloak = 1;
  }

  // ---------------- weapons ----------------
  syncActorWeapon(a: Actor) {
    const def = a.weapons[a.slot]?.def;
    if (!def || a.gunMesh.userData.weaponKey === def.name) return;
    a.gunMesh.clear();
    const model = this.makeWeaponModel(def, a.team);
    a.gunMesh.add(model);
    a.gunMesh.userData.weaponKey = def.name;
  }
  syncViewmodel(a: Actor) {
    const def = a.weapons[a.slot]?.def;
    if (!def || this.viewmodelKey === def.name) return;
    this.viewmodel.clear();
    const model = this.makeWeaponModel(def, a.team, true);
    this.viewmodel.add(model);
    this.viewmodelKey = def.name;
  }
  fireLogic(a: Actor, dt: number) {
    const inp = a.input, w = a.weapons[a.slot], def = w.def;
    const altEdge = inp.alt && !a.altPrev;
    a.altPrev = inp.alt;
    // reload
    if (a.reloadT > 0) {
      a.reloadT -= dt;
      if (a.reloadT <= 0) { const need = def.clip - w.clip; const got = Math.min(need, w.reserve); w.clip += got; w.reserve -= got; }
    } else if (def.reload && def.clip > 0 && w.reserve > 0 && (w.clip === 0 || (inp.reload && w.clip < def.clip))) a.reloadT = def.reload;

    // class alt-fires
    if (a.cls === "spy" && altEdge && (a.cloaked || a.cloak > 0.1)) { a.cloaked = !a.cloaked; this.refreshLook(a); }
    if (a.cls === "demoman" && altEdge) this.detonate(a);
    if (a.cls === "medic" && altEdge && a.uber >= 1) { a.uberT = 8; a.uber = 0; this.flash(a.isBot ? "" : "ÜberCharge deployed!"); }
    if (def.kind === "sniper" && altEdge && a.onGround) { a.scoped = !a.scoped; a.charge = 0; }
    if (a.cls === "engineer" && inp.alt) a.buildMode = null;
    if (a.scoped) a.charge = Math.min(1, a.charge + dt / 3.3);
    if (def.kind === "minigun") {
      if (inp.alt || inp.fire) a.revT = Math.min(1, a.revT + dt); else a.revT = Math.max(0, a.revT - dt * 2);
    }
    if (a.uberT > 0 && a.cls === "medic" && a.healTarget) a.healTarget.invulnT = 0.3;

    // medigun beam
    if (def.kind === "medigun") {
      if (inp.fire) this.medigun(a, dt); else a.healTarget = null;
      return;
    } else a.healTarget = null;
    if (def.kind === "flame" && altEdge && a.airblastT <= 0 && w.clip >= 20) { w.clip -= 20; a.airblastT = 0.75; this.airblast(a); }

    if (a.buildMode) {
      if (inp.fire && this.time >= a.nextFire && !a.isBot) {
        a.nextFire = this.time + 0.4;
        if (this.ghostValid) { this.placeBuilding(a, a.buildMode, this.ghostPos.clone(), a.yaw); a.buildMode = null; }
      }
      return;
    }
    if (!inp.fire || this.time < a.nextFire || a.cloaked) return;
    if (def.kind === "minigun" && a.revT < 0.8) return;
    if (def.clip > 0 && w.clip <= 0) return;
    if (a.reloadT > 0 && w.clip <= 0) return;
    a.reloadT = 0;
    a.nextFire = this.time + def.rate;
    a.weaponAnim = 1;
    if (def.clip > 0) w.clip--;
    if (a.disguised && def.kind !== "sapper") { a.disguised = false; this.refreshLook(a); }
    const eye = this.eye(a), dir = this.dirOf(a.yaw, a.pitch);
    this.sound(eye, def.kind === "melee" || def.kind === "knife" ? 6 : 25, a.team);
    switch (def.kind) {
      case "hitscan": case "minigun": {
        for (let p = 0; p < (def.pellets ?? 1); p++) {
          const d = dir.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2).multiplyScalar(def.spread ?? 0)).normalize();
          const hit = this.trace(a, eye, d, 80);
          const fall = hit.t < 6 ? 1.3 - hit.t * 0.05 : Math.max(0.45, 1 - (hit.t - 6) / 40);
          if (hit.actor) this.damage(hit.actor, def.dmg * fall, a, def.name);
          if (hit.bld) this.damageBuilding(hit.bld, def.dmg * fall, a);
          if (p < 3) this.tracer(eye.clone().add(new THREE.Vector3(0, -0.15, 0)), eye.clone().addScaledVector(d, hit.t));
        }
        break;
      }
      case "sniper": {
        const hit = this.trace(a, eye, dir, 200);
        let dmg = a.scoped ? 50 + 100 * a.charge : 50;
        if (hit.actor) { if (hit.head && a.scoped) dmg *= 3; this.damage(hit.actor, dmg, a, hit.head && a.scoped ? "Headshot" : def.name); }
        if (hit.bld) this.damageBuilding(hit.bld, dmg, a);
        this.tracer(eye.clone().add(new THREE.Vector3(0, -0.1, 0)), eye.clone().addScaledVector(dir, hit.t), 0xffffff);
        a.charge = 0;
        break;
      }
      case "projectile": this.fireProjectile(a, def, eye, dir); break;
      case "flame": {
        for (const o of this.actors) {
          if (!o.alive || o.team === a.team) continue;
          const to = this.center(o).sub(eye); const L = to.length();
          if (L < 6.5 && to.normalize().dot(dir) > 0.93 && this.los(eye, this.center(o))) {
            this.damage(o, def.dmg * (L < 3 ? 1.4 : 1), a, def.name);
            if (!this.isInvuln(o)) { o.burnT = 4; o.burnBy = a; }
            if (o.cloaked || o.disguised) { o.cloaked = false; o.disguised = false; this.refreshLook(o); }
          }
        }
        for (const b of this.buildings) {
          if (b.team === a.team) continue;
          const to = b.pos.clone().add(new THREE.Vector3(0, 0.5, 0)).sub(eye);
          if (to.length() < 6.5 && to.normalize().dot(dir) > 0.9) this.damageBuilding(b, def.dmg, a);
        }
        this.flameFx(eye, dir);
        break;
      }
      case "melee": case "knife": case "wrench": case "sapper": this.melee(a, def, eye, dir); break;
    }
  }

  trace(a: Actor | null, o: THREE.Vector3, d: THREE.Vector3, range: number, team: Team | -1 = a ? a.team : -1) {
    const wh = this.world.ray(o.x, o.y, o.z, d.x, d.y, d.z, range);
    let best = wh ? wh.t : range;
    let actor: Actor | null = null, bld: Building | null = null, head = false;
    for (const t of this.actors) {
      if (!t.alive || t === a || t.team === team) continue;
      const hy = t.pos.y + t.h;
      const hh = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, t.pos.x - 0.28, hy - 0.5, t.pos.z - 0.28, t.pos.x + 0.28, hy + 0.05, t.pos.z + 0.28);
      if (hh && hh.t < best) { best = hh.t; actor = t; head = true; bld = null; }
      const bh = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, t.pos.x - 0.45, t.pos.y, t.pos.z - 0.45, t.pos.x + 0.45, hy - 0.5, t.pos.z + 0.45);
      if (bh && bh.t < best) { best = bh.t; actor = t; head = false; bld = null; }
    }
    for (const b of this.buildings) {
      if (b.team === team) continue;
      const s = this.bldSize(b);
      const bh = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, b.pos.x - s.w, b.pos.y, b.pos.z - s.w, b.pos.x + s.w, b.pos.y + s.h, b.pos.z + s.w);
      if (bh && bh.t < best) { best = bh.t; bld = b; actor = null; }
    }
    return { t: best, actor, bld, head, world: !actor && !bld && !!wh };
  }

  melee(a: Actor, def: WeaponDef, eye: THREE.Vector3, dir: THREE.Vector3) {
    // own buildings (wrench)
    if (def.kind === "wrench") {
      for (const b of this.buildings) {
        if (b.team !== a.team) continue;
        const to = b.pos.clone().add(new THREE.Vector3(0, 0.5, 0)).sub(eye);
        if (to.length() < 2.4 && to.normalize().dot(dir) > 0.6) { this.wrenchHit(a, b); return; }
      }
    }
    if (def.kind === "sapper") {
      for (const b of this.buildings) {
        if (b.team === a.team || b.sappedBy) continue;
        const to = b.pos.clone().add(new THREE.Vector3(0, 0.5, 0)).sub(eye);
        if (to.length() < 2.6) { b.sappedBy = a; this.feed(`${a.name} sapped a ${b.type.replace("_", " ")}`, a.team); return; }
      }
      return;
    }
    const hit = this.trace(a, eye, dir, 2.2);
    if (hit.actor) {
      const t = hit.actor;
      let dmg = def.dmg;
      if (def.kind === "knife") {
        const tf = new THREE.Vector2(-Math.sin(t.yaw), -Math.cos(t.yaw));
        const to = new THREE.Vector2(t.pos.x - a.pos.x, t.pos.z - a.pos.z).normalize();
        if (tf.dot(to) > 0.2) { dmg = t.hp * 6; this.damage(t, dmg, a, "Backstab"); return; }
      }
      this.damage(t, dmg, a, def.name);
    } else if (hit.bld) this.damageBuilding(hit.bld, def.dmg, a);
  }

  medigun(a: Actor, dt: number) {
    let t = a.healTarget;
    const eye = this.eye(a);
    if (t && (!t.alive || t.pos.distanceTo(a.pos) > 14 || !this.los(eye, this.center(t)))) t = null;
    if (!t) {
      const dir = this.dirOf(a.yaw, a.pitch);
      let best = 0.9;
      for (const o of this.actors) {
        if (o === a || !o.alive || o.team !== a.team) continue;
        const to = this.center(o).sub(eye); const L = to.length();
        if (L > 10) continue;
        const dd = to.normalize().dot(dir);
        if (dd > best && this.los(eye, this.center(o))) { best = dd; t = o; }
      }
    }
    a.healTarget = t;
    if (!t) return;
    const max = t.maxHp * 1.5;
    if (t.hp < max) t.hp = Math.min(max, t.hp + (t.hp < t.maxHp ? 30 : 12) * dt);
    t.burnT = 0;
    if (a.uberT <= 0) a.uber = Math.min(1, a.uber + dt / (t.hp < t.maxHp ? 32 : 60));
  }

  airblast(a: Actor) {
    const eye = this.eye(a), dir = this.dirOf(a.yaw, a.pitch);
    for (const p of this.projectiles) {
      if (p.team === a.team || p.dead) continue;
      const to = p.pos.clone().sub(eye); const L = to.length();
      if (L < 6 && to.normalize().dot(dir) > 0.6) {
        p.team = a.team; p.owner = a; p.stuck = false;
        p.vel.copy(dir).multiplyScalar(Math.max(18, p.vel.length() * 1.1));
        p.life = Math.max(p.life, 2);
      }
    }
    for (const o of this.actors) {
      if (!o.alive || o.team === a.team) continue;
      const to = this.center(o).sub(eye); const L = to.length();
      if (L < 6 && to.normalize().dot(dir) > 0.7) { o.vel.addScaledVector(dir, 14); o.vel.y += 5; o.onGround = false; }
    }
    this.burst(eye.clone().addScaledVector(dir, 1.5), 0xffffff, 1.2);
  }

  fireProjectile(a: Actor, def: WeaponDef, eye: THREE.Vector3, dir: THREE.Vector3) {
    const kind = def.proj!;
    const size = kind === "rocket" ? 0.18 : kind === "syringe" ? 0.06 : 0.15;
    const mesh = new THREE.Mesh(kind === "rocket" ? new THREE.BoxGeometry(size, size, size * 3) : new THREE.SphereGeometry(size, 6, 6),
      new THREE.MeshLambertMaterial({ color: kind === "sticky" ? TEAM_COLOR[a.team] : kind === "syringe" ? 0xaaddff : 0x333333, emissive: kind === "rocket" ? 0x441100 : 0 }));
    const start = eye.clone().addScaledVector(dir, 0.5).add(new THREE.Vector3(0, -0.2, 0));
    const vel = dir.clone().multiplyScalar(def.speed ?? 20);
    if (kind === "grenade" || kind === "sticky") vel.y += 3;
    mesh.position.copy(start);
    this.scene.add(mesh);
    if (kind === "sticky") {
      const mine = this.projectiles.filter((p) => p.owner === a && p.kind === "sticky" && !p.dead);
      if (mine.length >= 8) { mine[0].dead = true; this.scene.remove(mine[0].mesh); }
    }
    this.projectiles.push({ kind, team: a.team, owner: a, pos: start, vel, mesh, life: kind === "grenade" ? 2.3 : kind === "sticky" ? 999 : 6, stuck: false, dmg: def.dmg, radius: def.splash ?? 0, dead: false });
  }
  detonate(a: Actor) {
    for (const p of this.projectiles) if (p.owner === a && p.kind === "sticky" && !p.dead) this.explode(p);
  }

  updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      if (p.dead) continue;
      p.life -= dt;
      if (p.life <= 0) { if (p.kind === "syringe" || p.kind === "sticky") this.killProj(p); else this.explode(p); continue; }
      if (p.stuck) continue;
      if (p.kind === "grenade" || p.kind === "sticky") p.vel.y -= G * 0.8 * dt;
      if (p.kind === "syringe") p.vel.y -= 4 * dt;
      const L = p.vel.length() * dt; const d = p.vel.clone().normalize();
      const hit = this.trace(p.owner, p.pos, d, L + 0.1, p.team);
      if (hit.actor || hit.bld) {
        if (p.kind === "syringe") { if (hit.actor) this.damage(hit.actor, p.dmg, p.owner, "Syringe Gun"); else if (hit.bld) this.damageBuilding(hit.bld, p.dmg, p.owner); this.killProj(p); continue; }
        if (p.kind !== "sticky") { p.pos.addScaledVector(d, hit.t); this.explode(p, hit.actor); continue; }
      }
      const wh = this.world.ray(p.pos.x, p.pos.y, p.pos.z, d.x, d.y, d.z, L + 0.05);
      if (wh) {
        p.pos.addScaledVector(d, Math.max(0, wh.t - 0.05));
        if (p.kind === "rocket") { this.explode(p); continue; }
        if (p.kind === "syringe") { this.killProj(p); continue; }
        if (p.kind === "sticky") { p.stuck = true; p.vel.set(0, 0, 0); continue; }
        // grenade bounce
        const n = new THREE.Vector3(...wh.n);
        p.vel.reflect(n).multiplyScalar(0.45);
        continue;
      }
      p.pos.addScaledVector(p.vel, dt);
      if (Math.abs(p.pos.x) < MOAT_X && p.pos.y < WATER_Y && p.kind === "rocket") p.vel.multiplyScalar(1 - dt);
    }
    for (const p of this.projectiles) if (!p.dead) { p.mesh.position.copy(p.pos); if (p.kind === "rocket") p.mesh.lookAt(p.pos.clone().add(p.vel)); }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }
  killProj(p: Projectile) { p.dead = true; this.scene.remove(p.mesh); }

  explode(p: Projectile, direct: Actor | null = null) {
    this.killProj(p);
    this.explosion(p.pos, p.team, p.owner, p.dmg, p.radius, p.kind === "rocket" ? "Rocket" : p.kind === "grenade" ? "Grenade" : "Stickybomb", direct);
  }
  explosion(pos: THREE.Vector3, team: Team, owner: Actor, dmg: number, radius: number, name: string, direct: Actor | null = null) {
    this.burst(pos, 0xff8a2a, radius);
    this.sound(pos, 35, team);
    for (const o of this.actors) {
      if (!o.alive) continue;
      const self = o === owner;
      if (o.team === team && !self) continue;
      const c = this.center(o); const d = c.distanceTo(pos);
      if (d > radius + 0.4 && o !== direct) continue;
      if (o !== direct && !this.los(pos.clone().add(new THREE.Vector3(0, 0.2, 0)), c)) continue;
      const fall = o === direct ? 1 : 1 - 0.5 * Math.min(1, d / radius);
      const kb = c.clone().sub(pos); if (kb.lengthSq() < 0.01) kb.set(0, 1, 0); kb.normalize();
      if (self) {
        this.damage(o, dmg * fall * 0.4, owner, name);
        o.vel.addScaledVector(kb, 15 * fall); o.vel.y += 6 * fall; o.onGround = false;
      } else {
        this.damage(o, dmg * fall, owner, name);
        if (!this.isInvuln(o)) { o.vel.addScaledVector(kb, 7 * fall); o.vel.y += 3 * fall; o.onGround = false; }
      }
    }
    for (const b of this.buildings) {
      if (b.team === team) continue;
      const d = b.pos.clone().add(new THREE.Vector3(0, 0.5, 0)).distanceTo(pos);
      if (d < radius + 0.5) this.damageBuilding(b, dmg * (1 - 0.5 * Math.min(1, d / radius)), owner);
    }
  }

  damage(t: Actor, amount: number, from: Actor | null, weapon: string) {
    if (!t.alive || this.isInvuln(t) || amount <= 0) return;
    if (from && from !== t && from.team === t.team) return;
    t.hp -= amount;
    if (from && from !== t) {
      if (from === this.player) this.hitT = 0.15;
      t.lastAttacker = from;
      if (t.brain) t.brain.hurtBy(from, this);
      if (t.cls === "spy" && t.disguised && Math.random() < 0.3) { t.disguised = false; this.refreshLook(t); }
    }
    if (t === this.player) {
      this.hurtFlash = 0.35;
      if (from) {
        const dx = from.pos.x - t.pos.x, dz = from.pos.z - t.pos.z;
        let delta = Math.atan2(-dx, -dz) - t.yaw;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        this.hurtDirection = delta;
      }
    }
    if (t.hp <= 0) this.kill(t, from && from !== t ? from : t.lastAttacker && t.lastAttacker !== t ? t.lastAttacker : null, weapon);
  }
  hurtFlash = 0;

  kill(t: Actor, by: Actor | null, weapon: string) {
    t.alive = false; t.hp = 0; t.deaths++;
    t.respawnT = RESPAWN;
    t.mesh.visible = false;
    t.scoped = false; t.cloaked = false; t.healTarget = null; t.carrying = false;
    t.streak = 0;
    if (by) { by.kills++; by.streak++; if (by.streak === 3 || by.streak === 5 || by.streak === 10) this.feed(`${by.name} is on a ${by.streak} killstreak!`, by.team); }
    this.feed(by ? `${by.name}  [${weapon}]  ${t.name}` : `${t.name} died (${weapon})`, by ? by.team : t.team);
    for (const f of this.flags) if (f.carrier === t) { f.state = "DROPPED"; f.carrier = null; f.returnT = FLAG_RETURN; f.pos.copy(t.pos); this.feed(`${t.name} dropped the ${TEAM_NAME[f.team]} intel`, t.team); }
    this.addPickup("ammo_m", t.pos.clone(), 20);
    for (const p of this.projectiles) if (p.owner === t && p.kind === "sticky") this.killProj(p);
    this.burst(this.center(t), 0xaa2222, 0.8);
  }

  // ---------------- buildings ----------------
  bldSize(b: Building) {
    if (b.type === "sentry") return { w: 0.45, h: 0.9 + b.level * 0.15 };
    if (b.type === "dispenser") return { w: 0.45, h: 1.3 };
    return { w: 0.6, h: 0.25 };
  }
  canBuild(a: Actor, type: BldType, pos: THREE.Vector3) {
    if (a.metal < BUILD_COST[type]) return false;
    if (this.buildings.some((b) => b.owner === a && b.type === type)) return false;
    if (this.world.overlaps(pos.x, pos.y + 0.05, pos.z, 1.1, 0.5)) return false;
    if (!this.world.overlaps(pos.x, pos.y - 0.2, pos.z, 0.15, 0.3)) return false;
    return !this.buildings.some((b) => b.pos.distanceTo(pos) < 1.2);
  }
  placeBuilding(a: Actor, type: BldType, pos: THREE.Vector3, yaw: number) {
    if (!this.canBuild(a, type, pos)) return false;
    a.metal -= BUILD_COST[type];
    const g = new THREE.Group();
    const m = (w: number, h: number, d: number, color: number, y: number) => {
      const mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
      mm.position.y = y; mm.castShadow = true; g.add(mm); return mm;
    };
    let head: THREE.Object3D | null = null;
    const col = TEAM_COLOR[a.team];
    if (type === "sentry") {
      m(0.8, 0.5, 0.8, 0x555555, 0.25);
      const hg = new THREE.Group(); hg.position.y = 0.75;
      const hb = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.6), new THREE.MeshLambertMaterial({ color: col })); hg.add(hb);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.7), new THREE.MeshLambertMaterial({ color: 0x222222 })); barrel.position.z = -0.5; hg.add(barrel);
      const pods = new THREE.Group(); pods.name = "rocket-pods"; pods.visible = false;
      for (const x of [-0.38, 0.38]) { const pod = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.45), new THREE.MeshLambertMaterial({ color: 0x444444 })); pod.position.set(x, 0.05, -0.08); pods.add(pod); for (const y of [-0.07, 0.07]) { const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.32, 8), new THREE.MeshLambertMaterial({ color: 0x252525 })); tube.rotation.x = Math.PI / 2; tube.position.set(x, y + 0.05, -0.38); pods.add(tube); } }
      hg.add(pods);
      g.add(hg); head = hg;
      const l2 = new THREE.Group(); l2.name = "sentry-l2"; l2.visible = false;
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.7), new THREE.MeshLambertMaterial({ color: 0x222222 }));
      b2.position.set(0.14, 0, -0.5); barrel.position.x = -0.14; l2.add(b2);
      const ammo = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.3), new THREE.MeshLambertMaterial({ color: 0x6b5a2a })); ammo.position.set(0, 0, 0.35); l2.add(ammo);
      hg.add(l2);
    } else if (type === "dispenser") {
      m(0.8, 1.3, 0.8, col, 0.65); m(0.5, 0.3, 0.05, 0xffffcc, 0.9).position.z = -0.42;
      m(0.86, 0.08, 0.86, 0x333333, 1.32); // lid
      for (const x of [-0.2, 0.2]) m(0.12, 0.35, 0.12, 0x888888, 0.18).position.set(x, 0.18, -0.42); // ammo slots
      const mk = (name: string, color: number, y: number) => {
        const grp = new THREE.Group(); grp.name = name; grp.visible = false;
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.1, 0.84), new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.4 }));
        band.position.y = y; grp.add(band);
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), new THREE.MeshLambertMaterial({ color: 0x999999 }));
        ant.position.set(name === "disp-l2" ? 0.28 : -0.28, 1.6, 0.28); grp.add(ant);
        g.add(grp);
      };
      mk("disp-l2", 0xd8c070, 0.4); mk("disp-l3", 0x66ffaa, 1.1);
      const glow = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 4, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35 }));
      glow.name = "disp-ring"; glow.rotation.x = Math.PI / 2; glow.position.y = 0.05; g.add(glow);
    } else {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.25, 12), new THREE.MeshLambertMaterial({ color: type === "tele_in" ? col : 0xeeeeee, emissive: col, emissiveIntensity: 0.3 }));
      c.position.y = 0.12; g.add(c);
    }
    g.position.copy(pos);
    g.rotation.y = yaw;
    this.scene.add(g);
    const hp = type === "sentry" ? 150 : type === "dispenser" ? 150 : 150;
    this.buildings.push({ id: this.idc++, type, team: a.team, owner: a, pos: pos.clone(), hp: hp * 0.5, maxHp: hp, level: 1, upgrade: 0, sappedBy: null, mesh: g, head, nextFire: 0, rocketT: 0, yaw, buildT: 2.5, tickT: 0 });
    return true;
  }
  wrenchHit(a: Actor, b: Building) {
    if (b.sappedBy) { b.sappedBy = null; return; }
    if (b.hp < b.maxHp && a.metal > 0) { const use = Math.min(20, a.metal, Math.ceil((b.maxHp - b.hp) / 5)); b.hp = Math.min(b.maxHp, b.hp + use * 5); a.metal -= use; return; }
    if (b.buildT > 0) { b.buildT = Math.max(0, b.buildT - 0.8); return; }
    if (b.level < 3 && a.metal > 0 && (b.type === "sentry" || b.type === "dispenser")) {
      const use = Math.min(25, a.metal); b.upgrade += use; a.metal -= use;
      if (b.upgrade >= 200) {
        b.upgrade = 0; b.level++; b.maxHp = b.level === 2 ? 180 : 216; b.hp = b.maxHp;
        b.mesh.scale.setScalar(1 + (b.level - 1) * (b.type === "sentry" ? 0.15 : 0.08));
        const show = (n: string, v: boolean) => { const o = b.mesh.getObjectByName(n); if (o) o.visible = v; };
        show("rocket-pods", b.level === 3); show("sentry-l2", b.level >= 2);
        show("disp-l2", b.level >= 2); show("disp-l3", b.level >= 3);
        this.burst(b.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xffdd55, 1);
        this.feed(`${a.name} upgraded ${b.type} to level ${b.level}`, a.team);
      }
    }
  }
  damageBuilding(b: Building, dmg: number, from: Actor | null) {
    if (from === this.player) this.hitT = 0.15;
    b.hp -= dmg;
    if (b.hp <= 0) this.destroyBuilding(b, from);
  }
  destroyBuilding(b: Building, by: Actor | null) {
    this.scene.remove(b.mesh);
    this.buildings = this.buildings.filter((x) => x !== b);
    this.burst(b.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), 0xffaa33, 1.5);
    if (by) this.feed(`${by.name} destroyed ${b.owner.name}'s ${b.type.replace("_", " ")}`, by.team);
  }
  updateBuildings(dt: number) {
    for (const b of [...this.buildings]) {
      if (b.sappedBy) { b.hp -= 25 * dt; if (b.hp <= 0) { this.destroyBuilding(b, b.sappedBy); continue; } }
      if (b.buildT > 0) { b.buildT -= dt; b.hp = Math.min(b.maxHp, b.hp + (b.maxHp * 0.5 / 2.5) * dt); continue; }
      if (b.sappedBy) continue;
      if (b.type === "sentry") {
        const hp = b.pos.clone().add(new THREE.Vector3(0, 0.8, 0));
        let target: Actor | null = null, best = 22;
        for (const o of this.actors) {
          if (!o.alive || o.team === b.team || o.cloaked || o.disguised) continue;
          const d = this.center(o).distanceTo(hp);
          if (d < best && this.los(hp, this.center(o))) { best = d; target = o; }
        }
        if (target) {
          const to = this.center(target).sub(hp);
          const want = Math.atan2(-to.x, -to.z);
          let diff = want - b.yaw; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
          b.yaw += Math.sign(diff) * Math.min(Math.abs(diff), 6 * dt);
          if (Math.abs(diff) < 0.25 && this.time >= b.nextFire) {
            b.nextFire = this.time + (b.level === 1 ? 0.25 : 0.12);
            this.damage(target, 8, b.owner, "Sentry Gun");
            this.tracer(hp, this.center(target), 0xffee88);
            this.sound(hp, 25, b.team);
            if (b.level === 3 && this.time >= b.rocketT) {
              b.rocketT = this.time + 3;
              const rocketDir = this.center(target).sub(hp).normalize();
              this.fireProjectile(b.owner, { name: "Sentry Rockets", kind: "projectile", proj: "rocket", dmg: 60, splash: 2.5, speed: 24, rate: 3, clip: 0, reserve: 0, color: TEAM_COLOR[b.team] }, hp, rocketDir);
            }
          }
        } else b.yaw += dt * 0.6;
        if (b.head) b.head.rotation.y = b.yaw - b.mesh.rotation.y;
      } else if (b.type === "dispenser") {
        const ring = b.mesh.getObjectByName("disp-ring");
        const radius = 3.5 + b.level * 0.75;
        if (ring) { ring.scale.setScalar(radius / b.mesh.scale.x); ring.rotation.z += dt; }
        b.tickT -= dt;
        if (b.tickT <= 0) {
          b.tickT = 1;
          const heal = [0, 12, 18, 26][b.level], ammoF = [0, 0.1, 0.15, 0.2][b.level];
          for (const o of this.actors) {
            if (!o.alive || o.team !== b.team || o.pos.distanceTo(b.pos) > radius) continue;
            o.hp = Math.min(Math.max(o.hp, o.maxHp), o.hp + heal);
            for (const w of o.weapons) w.reserve = Math.min(w.def.reserve, w.reserve + Math.ceil(w.def.reserve * ammoF)), w.clip = w.def.reserve === 0 ? Math.min(w.def.clip, w.clip + Math.ceil(w.def.clip * ammoF)) : w.clip;
            if (o.cls === "engineer") o.metal = Math.min(200, o.metal + 10 + b.level * 10);
          }
        }
      } else if (b.type === "tele_in") {
        const exit = this.buildings.find((x) => x.owner === b.owner && x.type === "tele_out" && x.buildT <= 0 && !x.sappedBy);
        if (!exit || this.time < b.nextFire) continue;
        for (const o of this.actors) {
          if (!o.alive || o.team !== b.team) continue;
          if (Math.hypot(o.pos.x - b.pos.x, o.pos.z - b.pos.z) < 0.7 && Math.abs(o.pos.y - b.pos.y - 0.25) < 0.4) {
            o.pos.copy(exit.pos).add(new THREE.Vector3(0, 0.3, 0)); o.vel.set(0, 0, 0);
            b.nextFire = this.time + 8;
            this.burst(exit.pos.clone().add(new THREE.Vector3(0, 1, 0)), TEAM_COLOR[b.team], 1);
            break;
          }
        }
      }
    }
  }

  // ---------------- flags / pickups ----------------
  updateFlags(dt: number) {
    for (const f of this.flags) {
      const enemy = (1 - f.team) as Team;
      if (f.state === "CARRIED" && f.carrier) {
        const c = f.carrier;
        f.pos.set(c.pos.x + Math.sin(c.yaw) * 0.4, c.pos.y + 1.1, c.pos.z + Math.cos(c.yaw) * 0.4);
        // capture?
        const own = this.flags[c.team];
        if (own.state === "AT_BASE" && c.pos.distanceTo(own.home) < 3.5) {
          this.scores[c.team]++;
          this.feed(`${c.name} captured the ${TEAM_NAME[f.team]} intel!`, c.team);
          this.flash(`${TEAM_NAME[c.team]} team captured the intelligence!`);
          c.carrying = false; this.returnFlag(f);
          if (this.scores[c.team] >= WIN_CAPS && this.winner === null) { this.winner = c.team; this.winT = 8; }
        }
        continue;
      }
      if (f.state === "DROPPED") {
        f.returnT -= dt;
        if (f.returnT <= 0) { this.returnFlag(f); this.feed(`${TEAM_NAME[f.team]} intel returned`, f.team); continue; }
      }
      for (const a of this.actors) {
        if (!a.alive || this.winner !== null) continue;
        if (Math.hypot(a.pos.x - f.pos.x, a.pos.z - f.pos.z) > 2 || Math.abs(a.pos.y - f.pos.y) > 2) continue;
        if (a.team === enemy && !this.isInvuln(a)) {
          f.state = "CARRIED"; f.carrier = a; a.carrying = true;
          if (a.cloaked || a.disguised) { a.cloaked = false; a.disguised = false; this.refreshLook(a); }
          this.feed(`${a.name} picked up the ${TEAM_NAME[f.team]} intel`, a.team);
          if (a === this.player) this.flash("You have the enemy intelligence! Return it to your base!");
          break;
        } else if (a.team === f.team && f.state === "DROPPED") {
          this.returnFlag(f); this.feed(`${a.name} returned the ${TEAM_NAME[f.team]} intel`, a.team); break;
        }
      }
    }
    for (const f of this.flags) { f.mesh.position.copy(f.pos); f.mesh.rotation.y = this.time; }
  }
  returnFlag(f: Flag) {
    if (f.carrier) f.carrier.carrying = false;
    f.state = "AT_BASE"; f.carrier = null; f.pos.copy(f.home);
  }
  updatePickups(dt: number) {
    for (const p of this.pickups) {
      if (p.temp > 0) { p.temp -= dt; if (p.temp <= 0) { p.active = false; this.scene.remove(p.mesh); p.temp = -1; continue; } }
      if (!p.active) { if (p.temp === 0) { p.respawnT -= dt; if (p.respawnT <= 0) { p.active = true; p.mesh.visible = true; } } continue; }
      p.mesh.rotation.y += dt * 1.5;
      for (const a of this.actors) {
        if (!a.alive || a.pos.distanceTo(p.pos) > 1.1) continue;
        const frac = p.type.endsWith("_s") ? 0.205 : p.type.endsWith("_m") ? 0.5 : 1;
        if (p.type.startsWith("hp")) {
          if (a.hp >= a.maxHp) continue;
          a.hp = Math.min(a.maxHp, a.hp + a.maxHp * frac); a.burnT = 0;
        } else {
          const need = a.weapons.some((w) => w.reserve < w.def.reserve || (w.def.reserve === 0 && w.clip < w.def.clip)) || a.metal < 200;
          if (!need) continue;
          for (const w of a.weapons) { if (w.def.reserve > 0) w.reserve = Math.min(w.def.reserve, w.reserve + Math.ceil(w.def.reserve * frac)); else w.clip = Math.min(w.def.clip, w.clip + Math.ceil(w.def.clip * frac)); }
          a.metal = Math.min(200, a.metal + 200 * frac);
        }
        p.active = false; p.mesh.visible = false; p.respawnT = 10;
        if (p.temp > 0) { this.scene.remove(p.mesh); p.temp = -1; }
        break;
      }
    }
    this.pickups = this.pickups.filter((p) => p.temp !== -1);
  }
  resetRound() {
    this.winner = null; this.scores = [0, 0];
    for (const f of this.flags) this.returnFlag(f);
    for (const b of [...this.buildings]) this.destroyBuilding(b, null);
    for (const a of this.actors) this.respawn(a);
    this.flash("New round! Capture the enemy intelligence 3 times.");
  }

  // ---------------- effects ----------------
  tracer(a: THREE.Vector3, b: THREE.Vector3, color = 0xffe08a) {
    const g = new THREE.BufferGeometry().setFromPoints([a, b]);
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 }));
    this.scene.add(l); this.fx.push({ obj: l, t: 0, life: 0.07, kind: "tracer" });
  }
  burst(p: THREE.Vector3, color: number, r: number) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }));
    m.position.copy(p); m.scale.setScalar(0.2); this.scene.add(m);
    this.fx.push({ obj: m, t: 0, life: 0.35, kind: "burst", vel: new THREE.Vector3(r, 0, 0) });
  }
  flameFx(o: THREE.Vector3, d: THREE.Vector3) {
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.18, 5, 4), new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? 0xff7a1a : 0xffc42a, transparent: true, opacity: 0.85 }));
      m.position.copy(o).addScaledVector(d, 0.6).add(new THREE.Vector3(0, -0.2, 0));
      this.scene.add(m);
      const v = d.clone().multiplyScalar(14).add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3));
      this.fx.push({ obj: m, t: 0, life: 0.4, kind: "flame", vel: v });
    }
  }
  updateFx(dt: number) {
    for (const f of this.fx) {
      f.t += dt;
      const k = f.t / f.life;
      const mat = (f.obj as THREE.Mesh).material as THREE.Material & { opacity: number };
      if (f.kind === "burst") { f.obj.scale.setScalar(0.2 + k * f.vel!.x); mat.opacity = 0.8 * (1 - k); }
      else if (f.kind === "flame") { f.obj.position.addScaledVector(f.vel!, dt); f.obj.scale.setScalar(1 + k * 3); mat.opacity = 0.85 * (1 - k); }
      else mat.opacity = 0.8 * (1 - k);
      if (f.t >= f.life) { this.scene.remove(f.obj); ((f.obj as THREE.Mesh).geometry as THREE.BufferGeometry).dispose(); }
    }
    this.fx = this.fx.filter((f) => f.t < f.life);
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.hitT > 0) this.hitT -= dt;
  }

  updateVisuals(dt: number) {
    for (const a of this.actors) {
      if (!a.alive) continue;
      // weapons that fire continuously are handled here too
      this.fireLogic(a, dt);
      if (a.isBot) {
        a.mesh.position.copy(a.pos);
        a.mesh.rotation.y = a.yaw;
        a.mesh.scale.y = a.h / 1.8;
        this.syncActorWeapon(a);
        const moving = Math.hypot(a.vel.x, a.vel.z) > 0.5 && a.onGround;
        const stride = moving ? Math.sin(this.time * 9 + a.id) * 0.55 : 0;
        a.mesh.userData.leftLeg.rotation.x = stride; a.mesh.userData.rightLeg.rotation.x = -stride;
        a.mesh.userData.leftArm.rotation.x = -stride * 0.45; a.mesh.userData.rightArm.rotation.x = stride * 0.45;
        a.weaponAnim = Math.max(0, a.weaponAnim - dt * 5);
        const melee = ["melee", "knife", "wrench"].includes(a.weapons[a.slot]?.def.kind);
        a.gunMesh.rotation.set(melee ? -a.weaponAnim * 1.4 : a.weaponAnim * 0.12, 0, melee ? -a.weaponAnim * 0.8 : 0);
        a.gunMesh.position.z = -0.35 + (melee ? 0 : a.weaponAnim * 0.16);
        const glow = this.isInvuln(a) ? 0.8 : 0;
        a.bodyMat.emissive.setHex(glow ? TEAM_COLOR[a.team] : 0);
        a.bodyMat.emissiveIntensity = glow;
      }
      // medigun beams
      let beam = this.beams.get(a);
      if (a.healTarget) {
        if (!beam) { beam = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: TEAM_COLOR[a.team] })); this.scene.add(beam); this.beams.set(a, beam); }
        const from = a === this.player ? this.eye(a).add(this.dirOf(a.yaw, a.pitch).multiplyScalar(0.6)).add(new THREE.Vector3(0, -0.3, 0)) : this.center(a);
        beam.geometry.setFromPoints([from, this.center(a.healTarget)]);
        beam.visible = true;
      } else if (beam) beam.visible = false;
    }
    for (const [a, beam] of this.beams) if (!a.alive) beam.visible = false;
    // camera
    const p = this.player;
    if (p.alive) {
      this.camera.position.copy(this.eye(p));
      this.camera.rotation.set(p.pitch, p.yaw, 0);
    } else {
      this.camera.position.lerp(p.pos.clone().add(new THREE.Vector3(0, 6, 0)), dt * 2);
      this.camera.rotation.x += (-1.2 - this.camera.rotation.x) * dt * 2;
    }
    const fov = p.alive && p.scoped ? 20 : 80;
    if (this.camera.fov !== fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.viewmodel.visible = p.alive && !p.scoped;
    const vdef = p.weapons[p.slot]?.def;
    if (vdef) {
      this.syncViewmodel(p);
      p.weaponAnim = Math.max(0, p.weaponAnim - dt * 5);
      const meleeSwing = ["melee", "knife", "wrench"].includes(vdef.kind);
      const kick = meleeSwing ? 0 : p.weaponAnim * 0.1;
      this.viewmodel.position.z = -0.7 + kick;
      this.viewmodel.rotation.set(meleeSwing ? -p.weaponAnim * 1.25 : p.weaponAnim * 0.08, meleeSwing ? p.weaponAnim * 0.45 : 0, meleeSwing ? -p.weaponAnim * 0.8 : 0);
      const melee = vdef.kind === "melee" || vdef.kind === "knife" || vdef.kind === "wrench";
      this.viewmodel.scale.set(melee ? 0.6 : 1, melee ? 0.6 : 1, melee ? 1.2 : 1);
      this.viewmodel.traverse((o) => { if (o instanceof THREE.Mesh) { const mat = o.material as THREE.MeshLambertMaterial; mat.opacity = p.cloaked ? 0.3 : 1; mat.transparent = p.cloaked; } });
    }
    // engineer blueprint ghost
    this.ghost.visible = false;
    if (p.alive && p.buildMode) {
      const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      const at = p.pos.clone().addScaledVector(fwd, 2.2);
      const down = this.world.ray(at.x, p.pos.y + 1.2, at.z, 0, -1, 0, 4);
      if (down) {
        this.ghostPos.set(at.x, p.pos.y + 1.2 - down.t, at.z);
        this.ghostValid = this.canBuild(p, p.buildMode, this.ghostPos);
        const s = p.buildMode === "sentry" ? [0.8, 1.1] : p.buildMode === "dispenser" ? [0.8, 1.3] : [1.2, 0.25];
        this.ghost.scale.set(s[0], s[1], s[0]);
        this.ghost.position.copy(this.ghostPos).add(new THREE.Vector3(0, s[1] / 2, 0));
        (this.ghost.material as THREE.MeshBasicMaterial).color.setHex(this.ghostValid ? 0x33ff66 : 0xff3333);
        this.ghost.visible = true;
      } else this.ghostValid = false;
    }
  }

  drawMinimap() {
    const cv = this.minimap; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const W = cv.width, H = cv.height, sx = W / 160, sz = H / 60;
    const X = (x: number) => (x + 80) * sx, Z = (z: number) => (z + 30) * sz;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(20,18,15,0.75)"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(111,138,79,0.6)"; ctx.fillRect(X(-40), Z(-30), X(-20) - X(-40), H); ctx.fillRect(X(20), Z(-30), X(40) - X(20), H);
    ctx.fillStyle = "rgba(45,111,143,0.8)"; ctx.fillRect(X(-20), 0, X(20) - X(-20), H);
    ctx.fillStyle = "rgba(139,106,69,0.9)"; ctx.fillRect(X(-20), Z(-3), X(20) - X(-20), Z(3) - Z(-3));
    ctx.fillStyle = "rgba(79,134,179,0.7)"; ctx.fillRect(X(-80), Z(-20), X(-40) - X(-80), Z(20) - Z(-20));
    ctx.fillStyle = "rgba(192,69,58,0.7)"; ctx.fillRect(X(40), Z(-20), X(80) - X(40), Z(20) - Z(-20));
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(X(-72), Z(20), X(72) - X(-72), Z(24) - Z(20));
    const p = this.player;
    for (const a of this.actors) {
      if (!a.alive) continue;
      const vis = a.team === p.team || (!a.cloaked && p.alive && this.los(this.eye(p), this.center(a)) && a.pos.distanceTo(p.pos) < 60);
      if (!vis) continue;
      ctx.fillStyle = a === p ? "#ffffff" : a.team === 0 ? "#8fc3ff" : "#ff8f7f";
      ctx.beginPath(); ctx.arc(X(a.pos.x), Z(a.pos.z), a === p ? 3.5 : 2.5, 0, Math.PI * 2); ctx.fill();
    }
    for (const f of this.flags) {
      ctx.fillStyle = f.team === 0 ? "#4f86b3" : "#c0453a"; ctx.strokeStyle = "#fff";
      ctx.fillRect(X(f.pos.x) - 4, Z(f.pos.z) - 4, 8, 8); ctx.strokeRect(X(f.pos.x) - 4, Z(f.pos.z) - 4, 8, 8);
    }
    if (p.alive) {
      ctx.strokeStyle = "#fff"; ctx.beginPath(); ctx.moveTo(X(p.pos.x), Z(p.pos.z));
      ctx.lineTo(X(p.pos.x - Math.sin(p.yaw) * 8), Z(p.pos.z - Math.cos(p.yaw) * 8)); ctx.stroke();
    }
  }

  getHud() {
    const p = this.player, w = p.weapons[p.slot];
    return {
      hp: Math.ceil(p.hp), maxHp: p.maxHp, alive: p.alive, respawnIn: Math.ceil(p.respawnT), cls: p.cls, team: p.team,
      weapon: w?.def.name ?? "", clip: w?.clip ?? 0, reserve: w?.reserve ?? 0, kind: w?.def.kind ?? "", reloading: p.reloadT > 0, maxClip: w?.def.clip ?? 0,
      uber: p.uber, uberActive: p.uberT > 0, metal: p.metal, cloak: p.cloak, cloaked: p.cloaked, disguised: p.disguised,
      scoped: p.scoped, charge: p.charge, air: p.air, burning: p.burnT > 0, buildMode: p.buildMode, ghostValid: this.ghostValid,
      scores: [...this.scores], flags: this.flags.map((f) => ({ team: f.team, state: f.state, returnT: Math.ceil(f.returnT), carrier: f.carrier?.name ?? null })),
      killfeed: this.killfeed.filter((k) => this.time - k.t < 8).map((k) => ({ text: k.text, team: k.team })),
      message: this.messageT > 0 ? this.message : "", winner: this.winner, carrying: p.carrying, hurt: this.hurtFlash > 0, hurtDirection: this.hurtDirection,
      healing: p.healTarget?.name ?? null, slots: p.weapons.map((x) => x.def.name), slot: p.slot, locked: this.locked,
      kills: p.kills, deaths: p.deaths, pending: p.pendingCls,
      hit: this.hitT > 0, showBoard: this.keys.has("Tab"),
      board: this.actors.map((a) => ({ name: a.name, team: a.team, cls: a.cls, kills: a.kills, deaths: a.deaths, alive: a.alive, me: a === p })).sort((a, b) => b.kills - a.kills),
    };
  }
}
