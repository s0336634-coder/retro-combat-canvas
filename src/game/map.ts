// @ts-nocheck
// 2Fort low-poly layout. X axis runs BLU (-x) -> RED (+x). Ground level y=0, basement/sewer/moat floor y=-6.
export type Box = { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; color: number; ghost?: boolean };
export type NavNode = { id: number; name: string; team: -1 | 0 | 1; x: number; y: number; z: number; edges: number[] };
export type PickupSpawn = { type: "hp_s" | "hp_m" | "hp_l" | "ammo_s" | "ammo_m"; x: number; y: number; z: number };

export const TEAM_SIGN = [-1, 1]; // 0 = BLU (-x), 1 = RED (+x)
export const WATER_Y = -2;
export const MOAT_X = 20;

export function buildMap() {
  const boxes: Box[] = [];
  const add = (xa: number, xb: number, y0: number, y1: number, za: number, zb: number, color: number) =>
    boxes.push({ x0: Math.min(xa, xb), x1: Math.max(xa, xb), y0, y1, z0: Math.min(za, zb), z1: Math.max(za, zb), color });

  // ---------- underground grid (1 unit cells) ----------
  type Cell = "solid" | "sky" | "ceil";
  const cell = (x: number, z: number): Cell => {
    const ax = Math.abs(x + 0.5);
    if (ax < MOAT_X) return "sky";
    if (ax >= 58 && ax < 68 && Math.abs(z + 0.5) < 4) return "sky"; // stairs trench
    if (ax >= 68 && ax < 79 && Math.abs(z + 0.5) < 12) return "ceil"; // intel vault
    if (ax >= 20 && ax < 72 && z >= 20 && z < 24) return "ceil"; // sewer
    if (ax >= 68 && ax < 72 && z >= 12 && z < 24) return "ceil"; // sewer bend
    return "solid";
  };
  for (let z = -30; z < 30; z++) {
    let runStart = -80;
    let runType = cell(-80, z);
    let runIn = Math.abs(-79.5) >= 40;
    for (let x = -79; x <= 80; x++) {
      const t = x < 80 ? cell(x, z) : ("end" as unknown as Cell);
      const inside = Math.abs(x + 0.5) >= 40;
      if (t !== runType || inside !== runIn || x === 80) {
        if (runType === "solid") add(runStart, x, -6, 0, z, z + 1, runIn ? 0x8a7a62 : 0x6f8a4f);
        else if (runType === "ceil") add(runStart, x, -1, 0, z, z + 1, runIn ? 0x8a7a62 : 0x6f8a4f);
        runStart = x;
        runType = t;
        runIn = inside;
      }
    }
  }
  add(-80, 80, -7, -6, -30, 30, 0x55504a); // bedrock floor
  // outer boundary walls
  add(-81, -80, -7, 20, -30, 30, 0x3d3a36);
  add(80, 81, -7, 20, -30, 30, 0x3d3a36);
  add(-80, 80, -7, 20, -31, -30, 0x3d3a36);
  add(-80, 80, -7, 20, 30, 31, 0x3d3a36);

  // ---------- bridge ----------
  const wood = 0x8b6a45;
  add(-20, 20, -0.5, 0, -3, 3, wood);
  add(-20, 20, 0, 1, -3.3, -3, 0x6e5234);
  add(-20, 20, 0, 1, 3, 3.3, 0x6e5234);
  add(-20, 20, 4.5, 5, -3.6, 3.6, 0x5a3f2a);
  for (const px of [-20, -10, 0, 10, 20]) {
    add(px - 0.3, px + 0.3, 0, 4.5, -3.3, -2.9, 0x6e5234);
    add(px - 0.3, px + 0.3, 0, 4.5, 2.9, 3.3, 0x6e5234);
  }
  // Offset cargo breaks the bridge sightline while leaving the center node clear.
  add(-1.1, 1.1, 0, 1.25, 1.5, 2.8, 0x9c7b4b);
  add(-18, -16.5, -6, -4.7, -18, -16.5, 0x55504a);
  add(15.5, 17.2, -6, -4.5, 16, 17.8, 0x55504a);

  // ---------- bases (mirrored) ----------
  const spawns: { x: number; y: number; z: number }[][] = [[], []];
  const resupply: Box[] = [];
  const intelHome: { x: number; y: number; z: number }[] = [];
  for (const team of [0, 1] as const) {
    const s = TEAM_SIGN[team];
    const col = team === 0 ? 0x587e96 : 0xa3483a;
    const trim = team === 0 ? 0x3c5a6e : 0x7a3226;
    const A = (X0: number, X1: number, y0: number, y1: number, z0: number, z1: number, c: number) => add(s * X0, s * X1, y0, y1, z0, z1, c);
    // front wall with door and sniper windows
    for (const zs of [-1, 1]) {
      A(40, 41, 0, 12, zs * 20, zs * 14, col);
      A(40, 41, 0, 7, zs * 14, zs * 6, col);
      A(40, 41, 10, 12, zs * 14, zs * 6, col);
      A(40, 41, 0, 12, zs * 6, zs * 3, col);
    }
    A(40, 41, 4, 12, -3, 3, trim);
    A(79, 80, 0, 12, -20, 20, col); // back
    A(40, 80, 0, 12, -20, -19, col);
    A(40, 80, 0, 12, 19, 20, col);
    A(40, 80, 12, 12.5, -20, 20, trim); // roof
    // battlements (2nd floor)
    A(41, 50, 5.6, 6, -19, 19, 0x7b6a55);
    A(49.7, 50, 6, 7, -13, 13, trim); // railing
    // low battlement cover and sandbag-like blocks
    A(42, 43.5, 6, 7.2, 8, 9.5, 0x9c7b4b);
    A(42, 43.5, 6, 7.2, -9.5, -8, 0x9c7b4b);
    A(46, 47.6, 6, 6.75, -2.8, -1.7, 0x77705f);
    // two staircases to battlements (straight stairs + "spiral" side)
    for (let i = 1; i <= 10; i++) {
      A(60 - i, 61 - i, 0, 0.6 * i, 14, 18, 0x9a8a70);
      A(60 - i, 61 - i, 0, 0.6 * i, -18, -14, 0x9a8a70);
    }
    // stairs down into the intel vault
    for (let i = 1; i <= 10; i++) A(58 + i - 1, 58 + i, -6, -0.6 * i, -4, 4, 0x9a8a70);
    A(57.6, 68, 0, 1, -4.3, -4, trim);
    A(57.6, 68, 0, 1, 4, 4.3, trim);
    // courtyard grate deck + steps
    A(30, 36, 0, 3, 8, 16, 0x5c5c5c);
    for (let i = 1; i <= 5; i++) A(24 + i, 25 + i, 0, 0.6 * i, 8, 16, 0x777777);
    // cover crates
    A(30, 32, 0, 1.6, -12, -10, 0x9c7b4b);
    A(26, 27.5, 0, 1.2, -20, -18.5, 0x9c7b4b);
    A(45, 47, 0, 1.4, -10, -8, 0x9c7b4b);
    // courtyard loading clutter, tucked away from the main route nodes
    A(34, 36.5, 0, 1.1, -18, -16.8, 0x77705f);
    A(35, 36.2, 1.1, 2, -18, -16.8, 0x9c7b4b);
    A(52, 53, 0, 2.4, 17.2, 18.5, 0x4a4a45);
    // intel pedestal area
    A(74, 76, -6, -5.6, -1, 1, 0x333333);
    // vault equipment racks and consoles against the back wall
    A(78, 79, -6, -2, -7, -3, 0x353a3d);
    A(78, 79, -6, -2, 3, 7, 0x353a3d);
    A(76.8, 78, -6, -5, 8.5, 10.5, trim);
    // overhead sewer utility pipes add landmarks without blocking movement
    A(30, 62, -1, -0.45, 23.35, 23.8, 0x45484a);
    A(68.2, 71.5, -1, -0.45, 13, 22, 0x45484a);
    intelHome.push({ x: s * 75, y: -5.6, z: 0 });
    // resupply cabinet
    A(78, 79, 0, 2.5, 16, 19, 0xd8c070);
    resupply.push({ x0: Math.min(s * 71, s * 79), x1: Math.max(s * 71, s * 79), y0: -1, y1: 4, z0: 12, z1: 19, color: 0 });
    for (const [X, Z] of [[74, 15], [76, 13], [73, 17], [76, 17]]) spawns[team].push({ x: s * X, y: 0, z: Z });
  }

  // ---------- navigation graph ----------
  const nodes: NavNode[] = [];
  const idx: Record<string, number> = {};
  const node = (name: string, team: -1 | 0 | 1, x: number, y: number, z: number) => {
    idx[name] = nodes.length;
    nodes.push({ id: nodes.length, name, team, x, y, z, edges: [] });
  };
  const link = (a: string, b: string) => {
    nodes[idx[a]].edges.push(idx[b]);
    nodes[idx[b]].edges.push(idx[a]);
  };
  node("MID_BRIDGE", -1, 0, 0, 0);
  node("MOAT", -1, 0, -6, 22);
  const P: [string, number, number, number][] = [
    ["SPAWN", 75, 0, 16], ["HALL", 62, 0, 12],
    ["UP_A_BOT", 62, 0, 16], ["UP_A_TOP", 49, 6, 16], ["UP_B_BOT", 62, 0, -16], ["UP_B_TOP", 49, 6, -16],
    ["BATT_A", 44, 6, 10], ["BATT_MID", 45, 6, 0], ["BATT_B", 44, 6, -10],
    ["INSIDE_DOOR", 45, 0, 0], ["TRENCH_TOP", 55, 0, 0], ["TRENCH_BOT", 69.5, -6, 0],
    ["INTEL_VAULT", 73, -6, 0], ["INTEL_CORNER", 72, -6, -8], ["ROOM_SIDE", 70, -6, 10],
    ["SEWER_ROOM", 70, -6, 22], ["SEWERS", 50, -6, 22], ["SEWER_MOAT", 22, -6, 22],
    ["COURTYARD", 30, 0, 0], ["COURTYARD_ALCOVE", 30, 0, -18], ["GRATE_STEPS", 23.5, 0, 12], ["GRATE", 33, 3, 12],
    ["BRIDGE", 18, 0, 0],
  ];
  for (const team of [0, 1] as const) {
    const s = TEAM_SIGN[team];
    const t = team === 0 ? "B_" : "R_";
    for (const [n, X, y, Z] of P) node(t + n, team, s * X, y, Z);
    const L = (a: string, b: string) => link(t + a, t + b);
    L("SPAWN", "HALL"); L("HALL", "UP_A_BOT"); L("UP_A_BOT", "UP_A_TOP"); L("UP_A_TOP", "BATT_A");
    L("BATT_A", "BATT_MID"); L("BATT_MID", "BATT_B"); L("BATT_B", "UP_B_TOP"); L("UP_B_TOP", "UP_B_BOT");
    L("UP_B_BOT", "HALL"); L("HALL", "INSIDE_DOOR"); L("HALL", "TRENCH_TOP"); L("INSIDE_DOOR", "TRENCH_TOP");
    L("TRENCH_TOP", "TRENCH_BOT"); L("TRENCH_BOT", "INTEL_VAULT"); L("INTEL_VAULT", "INTEL_CORNER");
    L("INTEL_VAULT", "ROOM_SIDE"); L("ROOM_SIDE", "SEWER_ROOM"); L("SEWER_ROOM", "SEWERS"); L("SEWERS", "SEWER_MOAT");
    L("INSIDE_DOOR", "COURTYARD"); L("COURTYARD", "COURTYARD_ALCOVE"); L("COURTYARD", "GRATE_STEPS");
    L("GRATE_STEPS", "GRATE"); L("COURTYARD", "BRIDGE");
    link(t + "SEWER_MOAT", "MOAT");
    link(t + "BRIDGE", "MID_BRIDGE");
  }

  const pickups: PickupSpawn[] = [];
  for (const s of TEAM_SIGN) {
    pickups.push({ type: "hp_m", x: s * 50, y: -6, z: 22 }, { type: "ammo_m", x: s * 46, y: -6, z: 22 });
    pickups.push({ type: "hp_s", x: s * 30, y: 0, z: -22 }, { type: "ammo_s", x: s * 28, y: 0, z: -22 });
    pickups.push({ type: "hp_s", x: s * 44, y: 6, z: 0 }, { type: "ammo_s", x: s * 43, y: 6, z: -16 });
    pickups.push({ type: "hp_m", x: s * 77, y: -6, z: -10 }, { type: "hp_l", x: s * 33, y: 3, z: 14 });
  }

  return { boxes, nodes, nodeIdx: idx, spawns, resupply, intelHome, pickups };
}
export type GameMap = ReturnType<typeof buildMap>;
