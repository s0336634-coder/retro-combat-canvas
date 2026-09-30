// @ts-nocheck
export type WeaponKind = "hitscan" | "projectile" | "flame" | "melee" | "medigun" | "sniper" | "knife" | "sapper" | "wrench" | "minigun";
export type WeaponDef = {
  name: string; kind: WeaponKind; dmg: number; rate: number; clip: number; reserve: number;
  pellets?: number; spread?: number; proj?: "rocket" | "grenade" | "sticky" | "syringe"; speed?: number; splash?: number; reload?: number; color: number;
};
export type ClassId = "scout" | "soldier" | "pyro" | "demoman" | "heavy" | "engineer" | "medic" | "sniper" | "spy";
export type ClassDef = { id: ClassId; name: string; hp: number; speed: number; hat: number; weapons: WeaponDef[]; role: string };

const W = (d: WeaponDef) => d;
const shotgun = W({ name: "Shotgun", kind: "hitscan", dmg: 6, pellets: 10, spread: 0.06, rate: 0.625, clip: 6, reserve: 32, reload: 0.5, color: 0x444444 });
const pistol = W({ name: "Pistol", kind: "hitscan", dmg: 15, spread: 0.02, rate: 0.17, clip: 12, reserve: 36, reload: 1.1, color: 0x555555 });
const melee = (name: string, color = 0x999999) => W({ name, kind: "melee", dmg: 65, rate: 0.8, clip: 0, reserve: 0, color });

export const CLASSES: Record<ClassId, ClassDef> = {
  scout: { id: "scout", name: "Scout", hp: 125, speed: 1.33, hat: 0x2d2d2d, role: "Fast flanker. Double jump.", weapons: [
    W({ name: "Scattergun", kind: "hitscan", dmg: 6, pellets: 10, spread: 0.08, rate: 0.6, clip: 6, reserve: 32, reload: 0.5, color: 0x6b4b2a }), pistol, W({ ...melee("Bat", 0xb08850), rate: 0.5, dmg: 35 })] },
  soldier: { id: "soldier", name: "Soldier", hp: 200, speed: 0.8, hat: 0x4a5a2a, role: "Rocket jumps. Splash damage.", weapons: [
    W({ name: "Rocket Launcher", kind: "projectile", proj: "rocket", dmg: 90, splash: 3.5, speed: 28, rate: 0.8, clip: 4, reserve: 20, reload: 0.9, color: 0x4a5a2a }), shotgun, melee("Shovel")] },
  pyro: { id: "pyro", name: "Pyro", hp: 175, speed: 1.0, hat: 0x3a3a3a, role: "Flames + airblast (alt).", weapons: [
    W({ name: "Flamethrower", kind: "flame", dmg: 7, rate: 0.08, clip: 200, reserve: 0, color: 0x777777 }), shotgun, melee("Fire Axe", 0xaa3333)] },
  demoman: { id: "demoman", name: "Demoman", hp: 175, speed: 0.93, hat: 0x222222, role: "Grenades, stickies (alt detonates).", weapons: [
    W({ name: "Grenade Launcher", kind: "projectile", proj: "grenade", dmg: 100, splash: 3, speed: 22, rate: 0.6, clip: 4, reserve: 16, reload: 0.7, color: 0x3d3d3d }),
    W({ name: "Stickybomb Launcher", kind: "projectile", proj: "sticky", dmg: 110, splash: 3.2, speed: 20, rate: 0.6, clip: 8, reserve: 24, reload: 0.7, color: 0x2e2e2e }), melee("Bottle", 0x3e7a3e)] },
  heavy: { id: "heavy", name: "Heavy", hp: 300, speed: 0.77, hat: 0x6a4a3a, role: "Minigun (alt spins up).", weapons: [
    W({ name: "Minigun", kind: "minigun", dmg: 9, pellets: 4, spread: 0.07, rate: 0.1, clip: 200, reserve: 0, color: 0x2a2a2a }), shotgun, W({ ...melee("Fists", 0xd9a066) })] },
  engineer: { id: "engineer", name: "Engineer", hp: 125, speed: 1.0, hat: 0xd4a017, role: "4 Sentry, 5 Dispenser, 6 Teleporter.", weapons: [
    shotgun, pistol, W({ name: "Wrench", kind: "wrench", dmg: 65, rate: 0.8, clip: 0, reserve: 0, color: 0xbbbbbb })] },
  medic: { id: "medic", name: "Medic", hp: 150, speed: 1.07, hat: 0xeeeeee, role: "Medigun heals, alt = ÜberCharge.", weapons: [
    W({ name: "Syringe Gun", kind: "projectile", proj: "syringe", dmg: 10, speed: 40, rate: 0.1, clip: 40, reserve: 150, reload: 1.3, color: 0x88aacc }),
    W({ name: "Medigun", kind: "medigun", dmg: 0, rate: 0.1, clip: 0, reserve: 0, color: 0xdddddd }), melee("Bonesaw", 0xcccccc)] },
  sniper: { id: "sniper", name: "Sniper", hp: 125, speed: 1.0, hat: 0x6b5030, role: "Alt scopes; charged headshots.", weapons: [
    W({ name: "Sniper Rifle", kind: "sniper", dmg: 50, rate: 1.5, clip: 25, reserve: 0, color: 0x5a4020 }),
    W({ name: "SMG", kind: "hitscan", dmg: 8, spread: 0.03, rate: 0.1, clip: 25, reserve: 75, reload: 1.1, color: 0x444444 }), melee("Kukri", 0xaaaaaa)] },
  spy: { id: "spy", name: "Spy", hp: 125, speed: 1.07, hat: 0x1a1a1a, role: "Alt cloaks. 4 disguise. Backstab.", weapons: [
    W({ name: "Revolver", kind: "hitscan", dmg: 40, spread: 0.01, rate: 0.5, clip: 6, reserve: 24, reload: 1.1, color: 0x666666 }),
    W({ name: "Knife", kind: "knife", dmg: 40, rate: 0.8, clip: 0, reserve: 0, color: 0xdddddd }),
    W({ name: "Sapper", kind: "sapper", dmg: 0, rate: 0.5, clip: 0, reserve: 0, color: 0x996633 })] },
};
export const CLASS_ORDER: ClassId[] = ["scout", "soldier", "pyro", "demoman", "heavy", "engineer", "medic", "sniper", "spy"];
export const BASE_SPEED = 7;
export const BUILD_COST = { sentry: 130, dispenser: 100, tele_in: 50, tele_out: 50 } as const;
