import type { Box } from "./map";

export const HALF_W = 0.4;
export const STEP = 0.7;

// Uniform spatial hash over XZ for static boxes
export class World {
  boxes: Box[];
  cell = 8;
  grid = new Map<number, Box[]>();
  constructor(boxes: Box[]) {
    this.boxes = boxes;
    for (const b of boxes) {
      for (let cx = Math.floor(b.x0 / this.cell); cx <= Math.floor(b.x1 / this.cell); cx++)
        for (let cz = Math.floor(b.z0 / this.cell); cz <= Math.floor(b.z1 / this.cell); cz++) {
          const k = this.key(cx, cz);
          let l = this.grid.get(k);
          if (!l) this.grid.set(k, (l = []));
          l.push(b);
        }
    }
  }
  key(cx: number, cz: number) { return (cx + 100) * 1000 + (cz + 100); }
  near(x0: number, z0: number, x1: number, z1: number): Box[] {
    const out = new Set<Box>();
    for (let cx = Math.floor(x0 / this.cell); cx <= Math.floor(x1 / this.cell); cx++)
      for (let cz = Math.floor(z0 / this.cell); cz <= Math.floor(z1 / this.cell); cz++) {
        const l = this.grid.get(this.key(cx, cz));
        if (l) for (const b of l) out.add(b);
      }
    return [...out];
  }
  overlaps(x: number, y: number, z: number, h: number, w = HALF_W): Box | null {
    for (const b of this.near(x - w, z - w, x + w, z + w)) {
      if (x + w > b.x0 && x - w < b.x1 && y + h > b.y0 && y < b.y1 && z + w > b.z0 && z - w < b.z1) return b;
    }
    return null;
  }
  // returns t in [0,maxT] of nearest hit + normal
  ray(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): { t: number; n: [number, number, number] } | null {
    const ex = ox + dx * maxT, ez = oz + dz * maxT;
    const cand = this.near(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez));
    let best = maxT;
    let bn: [number, number, number] | null = null;
    for (const b of cand) {
      const r = rayBox(ox, oy, oz, dx, dy, dz, b.x0, b.y0, b.z0, b.x1, b.y1, b.z1);
      if (r && r.t < best) { best = r.t; bn = r.n; }
    }
    return bn ? { t: best, n: bn } : null;
  }
}

export function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): { t: number; n: [number, number, number] } | null {
  let tmin = -Infinity, tmax = Infinity;
  let n: [number, number, number] = [0, 1, 0];
  const o = [ox, oy, oz], d = [dx, dy, dz], mn = [x0, y0, z0], mx = [x1, y1, z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return null;
    } else {
      let t1 = (mn[i] - o[i]) / d[i], t2 = (mx[i] - o[i]) / d[i];
      let s = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
      if (t1 > tmin) { tmin = t1; n = [0, 0, 0]; n[i] = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  if (tmax < 0) return null;
  if (tmin < 0) return null; // origin inside
  return { t: tmin, n };
}
