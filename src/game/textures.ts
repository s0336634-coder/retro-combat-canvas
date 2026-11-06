// @ts-nocheck
// Procedural canvas textures for the 2Fort map. All patterns are generated at
// runtime (no downloads), seeded so every load looks identical. Each map box
// color maps to a surface type; repeats scale with box size for even texel density.
import * as THREE from "three";

// Deterministic PRNG so textures don't change between loads.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function makeCanvas(size = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

function noiseOverlay(ctx: CanvasRenderingContext2D, rand: () => number, size: number, alpha: number) {
  for (let i = 0; i < size * 6; i++) {
    const v = Math.floor(rand() * 60);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1 + rand() * 2);
  }
}

type Painter = (ctx: CanvasRenderingContext2D, rand: () => number, size: number) => void;

function woodPlanks(base: string, dark: string): Painter {
  return (ctx, rand, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    const rows = 4;
    const rh = s / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rh;
      // plank tone variation
      ctx.fillStyle = `rgba(0,0,0,${0.04 + rand() * 0.1})`;
      ctx.fillRect(0, y, s, rh);
      // grain lines
      ctx.strokeStyle = `rgba(40,25,10,${0.15 + rand() * 0.1})`;
      ctx.lineWidth = 1;
      for (let g = 0; g < 5; g++) {
        const gy = y + 3 + rand() * (rh - 6);
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(s * 0.3, gy + rand() * 4 - 2, s * 0.7, gy + rand() * 4 - 2, s, gy);
        ctx.stroke();
      }
      // plank gaps
      ctx.fillStyle = dark;
      ctx.fillRect(0, y, s, 2);
      // nails
      ctx.fillStyle = "rgba(20,15,10,0.6)";
      ctx.fillRect(6 + rand() * 8, y + rh / 2, 2, 2);
      ctx.fillRect(s - 10 - rand() * 8, y + rh / 2, 2, 2);
    }
    noiseOverlay(ctx, rand, s, 0.05);
  };
}

function bricks(base: string, mortar: string, tint: string | null): Painter {
  return (ctx, rand, s) => {
    ctx.fillStyle = mortar;
    ctx.fillRect(0, 0, s, s);
    const bh = s / 8;
    const bw = s / 4;
    for (let r = 0; r < 8; r++) {
      const off = r % 2 ? bw / 2 : 0;
      for (let c = -1; c < 5; c++) {
        const x = c * bw + off;
        const y = r * bh;
        ctx.fillStyle = base;
        ctx.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
        // per-brick shade variation
        ctx.fillStyle = `rgba(${rand() < 0.5 ? "0,0,0" : "255,255,255"},${0.03 + rand() * 0.07})`;
        ctx.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
        if (tint) {
          ctx.fillStyle = tint;
          ctx.globalAlpha = 0.35;
          ctx.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
          ctx.globalAlpha = 1;
        }
      }
    }
    noiseOverlay(ctx, rand, s, 0.06);
  };
}

function stoneTiles(base: string, gap: string): Painter {
  return (ctx, rand, s) => {
    ctx.fillStyle = gap;
    ctx.fillRect(0, 0, s, s);
    const n = 4;
    const t = s / n;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        ctx.fillStyle = base;
        ctx.fillRect(c * t + 1.5, r * t + 1.5, t - 3, t - 3);
        ctx.fillStyle = `rgba(${rand() < 0.5 ? "0,0,0" : "255,255,255"},${0.04 + rand() * 0.08})`;
        ctx.fillRect(c * t + 1.5, r * t + 1.5, t - 3, t - 3);
        // chisel marks
        ctx.strokeStyle = "rgba(0,0,0,0.12)";
        ctx.beginPath();
        ctx.moveTo(c * t + 4 + rand() * 8, r * t + 4 + rand() * 8);
        ctx.lineTo(c * t + t - 6 - rand() * 8, r * t + t - 6 - rand() * 8);
        ctx.stroke();
      }
    }
    noiseOverlay(ctx, rand, s, 0.07);
  };
}

function roughGround(base: string, fleckA: string, fleckB: string): Painter {
  return (ctx, rand, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = rand() < 0.5 ? fleckA : fleckB;
      ctx.globalAlpha = 0.15 + rand() * 0.35;
      const w = 1 + rand() * 3;
      ctx.fillRect(rand() * s, rand() * s, w, w * (0.5 + rand()));
    }
    ctx.globalAlpha = 1;
    noiseOverlay(ctx, rand, s, 0.06);
  };
}

function metalPanels(base: string, seam: string): Painter {
  return (ctx, rand, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    // vertical brushed streaks
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(${rand() < 0.5 ? "255,255,255" : "0,0,0"},${0.03 + rand() * 0.05})`;
      ctx.fillRect(rand() * s, 0, 1 + rand() * 2, s);
    }
    // panel seams + rivets
    ctx.fillStyle = seam;
    ctx.fillRect(0, 0, s, 2);
    ctx.fillRect(0, s / 2, s, 2);
    ctx.fillRect(0, 0, 2, s);
    ctx.fillRect(s / 2, 0, 2, s);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    for (const [x, y] of [[8, 8], [s / 2 + 8, 8], [8, s / 2 + 8], [s / 2 + 8, s / 2 + 8], [8, s - 10], [s - 10, 8], [s - 10, s - 10], [s / 2 + 8, s - 10]]) {
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    noiseOverlay(ctx, rand, s, 0.05);
  };
}

function crateWood(base: string, edge: string): Painter {
  return (ctx, rand, s) => {
    woodPlanks(base, edge)(ctx, rand, s);
    // frame border
    ctx.strokeStyle = edge;
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, s - 8, s - 8);
    // diagonal brace
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(8, 8);
    ctx.lineTo(s - 8, s - 8);
    ctx.stroke();
  };
}

function waterSurface(): Painter {
  return (ctx, rand, s) => {
    const grad = ctx.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0, "#2d6f8f");
    grad.addColorStop(1, "#1d4f6f");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);
    // wavy highlights
    for (let i = 0; i < 26; i++) {
      ctx.strokeStyle = `rgba(180,230,255,${0.08 + rand() * 0.16})`;
      ctx.lineWidth = 1 + rand() * 1.5;
      const y = rand() * s;
      ctx.beginPath();
      ctx.moveTo(rand() * s * 0.4, y);
      ctx.bezierCurveTo(s * 0.3, y + rand() * 8 - 4, s * 0.6, y + rand() * 8 - 4, s * (0.6 + rand() * 0.4), y);
      ctx.stroke();
    }
  };
}

// Map box color -> texture painter. Colors come from map.ts.
const PAINTERS: Record<number, Painter> = {
  0x6f8a4f: roughGround("#6f8a4f", "#4f6a34", "#8aa464"), // grass
  0x8a7a62: roughGround("#8a7a62", "#6a5a44", "#a08a6e"), // packed dirt (underground)
  0x55504a: roughGround("#55504a", "#3a3630", "#6a645c"), // bedrock
  0x3d3a36: stoneTiles("#4a4640", "#2c2925"), // boundary walls
  0x8b6a45: woodPlanks("#8b6a45", "#5a4028"), // bridge deck
  0x6e5234: woodPlanks("#6e5234", "#463420"), // bridge rails
  0x5a3f2a: woodPlanks("#5a3f2a", "#3a2818"), // bridge roof
  0x9c7b4b: crateWood("#9c7b4b", "#6e5234"), // crates / sandbags
  0x7b6a55: woodPlanks("#7b6a55", "#54462f"), // battlements floor
  0x9a8a70: stoneTiles("#9a8a70", "#6e6250"), // stairs
  0x77705f: stoneTiles("#77705f", "#55504a"), // concrete clutter
  0x587e96: bricks("#7a7f84", "#4a4d50", "#3d6a8a"), // BLU walls
  0x3c5a6e: metalPanels("#3c5a6e", "#24384a"), // BLU trim
  0xa3483a: bricks("#8a7a72", "#55504a", "#8a2f22"), // RED walls
  0x7a3226: metalPanels("#7a3226", "#4e1f16"), // RED trim
  0x5c5c5c: metalPanels("#5c5c5c", "#3a3a3a"), // grate deck
  0x777777: metalPanels("#777777", "#4c4c4c"), // metal steps
  0x333333: metalPanels("#333333", "#1c1c1c"), // intel pedestal
  0x353a3d: metalPanels("#353a3d", "#202426"), // vault racks
  0x45484a: metalPanels("#45484a", "#2a2c2e"), // sewer pipes
  0x4a4a45: metalPanels("#4a4a45", "#2e2e2a"), // yard clutter
  0xd8c070: crateWood("#d8c070", "#a08840"), // resupply cabinet
};

const texCache = new Map<number, THREE.CanvasTexture>();

export function textureForColor(color: number): THREE.CanvasTexture | null {
  const painter = PAINTERS[color];
  if (!painter) return null;
  let tex = texCache.get(color);
  if (tex) return tex;
  const size = 128;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d")!;
  painter(ctx, rng(color), size);
  tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter; // crisp retro texels
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(color, tex);
  return tex;
}

let waterTex: THREE.CanvasTexture | null = null;
export function waterTexture(): THREE.CanvasTexture {
  if (waterTex) return waterTex;
  const size = 128;
  const canvas = makeCanvas(size);
  waterSurface()(canvas.getContext("2d")!, rng(0x2d6f8f), size);
  waterTex = new THREE.CanvasTexture(canvas);
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.repeat.set(6, 8);
  waterTex.colorSpace = THREE.SRGBColorSpace;
  return waterTex;
}

// Material per (color, size bucket) so UV repeats match each box's dimensions.
const matCache = new Map<string, THREE.MeshLambertMaterial>();

export function mapBoxMaterial(color: number, w: number, h: number, d: number): THREE.MeshLambertMaterial {
  const tex = textureForColor(color);
  if (!tex) return new THREE.MeshLambertMaterial({ color });
  // ~1 texture tile per 4 world units, rounded to halves to keep the cache small
  const ru = Math.max(1, Math.round((Math.max(w, d) / 4) * 2) / 2);
  const rv = Math.max(1, Math.round((Math.max(h, Math.min(w, d)) / 4) * 2) / 2);
  const key = `${color}-${ru}-${rv}`;
  let m = matCache.get(key);
  if (!m) {
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(ru, rv);
    m = new THREE.MeshLambertMaterial({ color: 0xffffff, map: t });
    matCache.set(key, m);
  }
  return m;
}

// Neutral (near-white) detail textures for weapons and characters. Material
// color tints them, so team/class colors stay intact.
const GEAR: Record<string, Painter> = {
  metal: (ctx, rand, s) => {
    ctx.fillStyle = "#e6e6e6"; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 30; i++) { ctx.fillStyle = `rgba(${rand() < 0.5 ? "255,255,255" : "0,0,0"},${0.05 + rand() * 0.08})`; ctx.fillRect(0, rand() * s, s, 1); }
    for (let i = 0; i < 6; i++) { ctx.fillStyle = "rgba(90,60,30,0.15)"; ctx.fillRect(rand() * s, rand() * s, 2 + rand() * 4, 1 + rand() * 3); }
  },
  wood: (ctx, rand, s) => {
    ctx.fillStyle = "#f0e2cc"; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 14; i++) { ctx.strokeStyle = `rgba(80,45,15,${0.15 + rand() * 0.2})`; const y = rand() * s; ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(s * 0.3, y + rand() * 6 - 3, s * 0.7, y + rand() * 6 - 3, s, y); ctx.stroke(); }
  },
  paint: (ctx, rand, s) => {
    ctx.fillStyle = "#f2f2f2"; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(0, s / 2, s, 1);
    for (let i = 0; i < 12; i++) { ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(rand() * s, rand() * s, 1 + rand() * 5, 1); }
    noiseOverlay(ctx, rand, s, 0.04);
  },
  cloth: (ctx, rand, s) => {
    ctx.fillStyle = "#efefef"; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 2) { ctx.fillStyle = `rgba(0,0,0,${0.03 + rand() * 0.04})`; ctx.fillRect(i, 0, 1, s); ctx.fillRect(0, i, s, 1); }
    ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.fillRect(s / 2, 0, 1, s);
  },
  skin: (ctx, rand, s) => { ctx.fillStyle = "#f6f6f6"; ctx.fillRect(0, 0, s, s); noiseOverlay(ctx, rand, s, 0.03); },
};
const gearCache = new Map<string, THREE.CanvasTexture>();
export function gearTexture(kind: keyof typeof GEAR): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  let t = gearCache.get(kind);
  if (t) return t;
  const c = makeCanvas(64);
  GEAR[kind](c.getContext("2d")!, rng(kind.length * 7919), 64);
  t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  gearCache.set(kind, t);
  return t;
}
export function gearMat(color: number, kind: keyof typeof GEAR) {
  return new THREE.MeshLambertMaterial({ color, map: gearTexture(kind) });
}
