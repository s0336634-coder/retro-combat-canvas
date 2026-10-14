// @ts-nocheck
// Shared low-poly character/weapon builders — used by the game and the class-select preview.
import * as THREE from "three";
import { CLASSES, type ClassId, type WeaponDef } from "./classes";

export const TEAM_COLOR = [0x4f86b3, 0xc0453a];

export function buildWeaponModel(def: WeaponDef, team: 0 | 1, firstPerson = false) {
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

export function buildClassModel(team: 0 | 1, cls: ClassId) {
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
  return { g, bodyMat, mats: [bodyMat, skin, dark, hatM, gunMat], gun };
}
