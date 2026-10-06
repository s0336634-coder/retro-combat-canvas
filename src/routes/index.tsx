import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CLASS_ORDER, CLASSES, type ClassId } from "@/game/classes";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "2Fort Demake — Browser CTF Shooter" },
      { name: "description", content: "Low-poly 2Fort capture-the-flag shooter with 9 classes and AI bots." },
      { property: "og:title", content: "2Fort Demake — Browser CTF Shooter" },
      { property: "og:description", content: "Low-poly 2Fort capture-the-flag shooter with 9 classes and AI bots." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);
  const game = useRef<any>(null);
  const [cls, setCls] = useState<ClassId | null>(null);
  const [hud, setHud] = useState<any>(null);
  
  const flagText = (flag: any) => flag.state === "AT_BASE" ? "SECURE" : flag.state === "DROPPED" ? `DROPPED ${flag.returnT}s` : `TAKEN · ${flag.carrier}`;

  useEffect(() => {
    if (!cls || game.current) return;
    let alive = true;
    import("@/game/game").then(({ Game }) => {
      if (!alive || !canvas.current) return;
      const g = new Game(canvas.current, mini.current, 0, cls);
      game.current = g;
      g.start();
      g.lock();
    });
    const t = setInterval(() => game.current && setHud(game.current.getHud()), 50);
    return () => { alive = false; clearInterval(t); game.current?.dispose(); game.current = null; };
  }, [cls]);

  return (
    <div className="fixed inset-0 bg-background text-foreground select-none overflow-hidden font-sans">
      <canvas ref={canvas} className="h-full w-full" onClick={() => game.current?.lock()} />
      <canvas ref={mini} width={320} height={120} className="absolute right-3 top-3 rounded border border-white/10 shadow-lg" />
      
      {!cls && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-background/95 p-6 backdrop-blur-sm">
          <h1 className="text-6xl font-black tracking-tighter text-primary">2FORT DEMAKE</h1>
          <p className="max-w-md text-center text-muted-foreground">Pick your role. WASD to move, Mouse to aim/fire, R to reload, 1-3 to switch weapons. BLU Team.</p>
          <div className="grid grid-cols-3 gap-3">
            {CLASS_ORDER.map((c) => (
              <button key={c} onClick={() => setCls(c)} className="group flex flex-col rounded-lg border border-border bg-card p-4 text-left transition-all hover:scale-105 hover:bg-accent hover:shadow-xl">
                <div className="text-lg font-bold group-hover:text-primary">{CLASSES[c].name}</div>
                <div className="text-xs leading-tight text-muted-foreground">{CLASSES[c].role}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {hud && (
        <>
          {/* Hit Flash & Damage Vignette */}
          {hud.hurt && <div className="pointer-events-none absolute inset-0 animate-pulse bg-destructive/20 shadow-[inset_0_0_100px_rgba(220,38,38,0.5)]" />}
          
          {/* Crosshair with Hit Marker */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2" aria-label="Crosshair">
            <div className={cn("absolute inset-0 flex items-center justify-center transition-colors duration-75", hud.hit ? "text-destructive scale-125" : "text-foreground")}>
              <span className="absolute h-0.5 w-2 -translate-x-2 bg-current" />
              <span className="absolute h-0.5 w-2 translate-x-2 bg-current" />
              <span className="absolute h-2 w-0.5 -translate-y-2 bg-current" />
              <span className="absolute h-2 w-0.5 translate-y-2 bg-current" />
            </div>
          </div>

          {/* Damage Direction */}
          {hud.hurt && <div className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-1 -translate-x-1/2 -translate-y-1/2 origin-center bg-destructive shadow-lg" style={{ transform: `translate(-50%, -50%) rotate(${hud.hurtDirection}rad) translateY(-60px)` }} />}

          {/* Top Scoreboard */}
          <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 flex flex-col items-center gap-1 rounded-md bg-card/90 px-6 py-2 shadow-2xl border border-white/10">
            <div className="flex items-center gap-8 text-2xl font-black">
              <span className="text-blue-500">BLU {hud.scores[0]}</span>
              <span className="text-muted-foreground/50">—</span>
              <span className="text-red-500">{hud.scores[1]} RED</span>
            </div>
            <div className="flex gap-4 text-[10px] uppercase tracking-widest font-bold opacity-80">
              <span className={cn(hud.flags[0].state !== "AT_BASE" && "text-red-400 animate-pulse")}>BLU INTEL: {flagText(hud.flags[0])}</span>
              <span className={cn(hud.flags[1].state !== "AT_BASE" && "text-blue-400 animate-pulse")}>RED INTEL: {flagText(hud.flags[1])}</span>
            </div>
          </div>

          {/* Killfeed */}
          <div className="pointer-events-none absolute left-4 top-4 space-y-1 font-mono text-xs italic">
            {hud.killfeed.map((k: any, i: number) => (
              <div key={i} className={cn("rounded px-2 py-0.5 bg-black/40 border-l-4", k.team === 0 ? "border-blue-500" : "border-red-500")}>
                {k.text}
              </div>
            ))}
          </div>

          {/* Center Message */}
          {hud.message && <div className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 text-3xl font-black tracking-tighter text-white drop-shadow-lg uppercase">{hud.message}</div>}

          {/* Health & Class HUD */}
          <div className="pointer-events-none absolute bottom-6 left-6 flex items-end gap-4">
            <div className="flex flex-col gap-1 rounded-xl bg-card/90 p-5 shadow-2xl border border-white/10 min-w-[180px]">
              <div className={cn("text-5xl font-black transition-colors", hud.hp < hud.maxHp * 0.3 ? "text-destructive animate-bounce" : "text-foreground")}>
                {hud.alive ? `${hud.hp}` : "DEAD"}
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div className={cn("h-full transition-all duration-300", hud.hp < hud.maxHp * 0.3 ? "bg-destructive" : hud.hp < hud.maxHp * 0.6 ? "bg-yellow-500" : "bg-green-500")} style={{ width: `${Math.min(100, (hud.hp / hud.maxHp) * 100)}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs font-bold uppercase tracking-tighter opacity-70">
                <span>{CLASSES[hud.cls as ClassId].name}</span>
                <span>{hud.hp} / {hud.maxHp} HP</span>
              </div>
              {hud.pending && <div className="mt-1 text-[9px] text-primary animate-pulse italic">Switching to {CLASSES[hud.pending as ClassId].name} next life</div>}
            </div>
            
            {/* Engineer/Medic Specifics */}
            {(hud.cls === "medic" || hud.cls === "engineer") && (
              <div className="flex flex-col gap-2 rounded-xl bg-card/80 p-4 shadow-xl border border-white/5">
                {hud.cls === "medic" && (
                  <>
                    <div className={cn("text-xl font-bold", hud.uber >= 1 ? "text-primary animate-pulse" : "text-muted-foreground")}>ÜberCharge: {Math.floor(hud.uber * 100)}%</div>
                    <div className="h-1.5 w-32 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary" style={{ width: `${hud.uber * 100}%` }} /></div>
                    {hud.healing && <div className="text-[10px] font-bold text-green-400">HEALING: {hud.healing}</div>}
                  </>
                )}
                {hud.cls === "engineer" && (
                  <>
                    <div className="text-xl font-bold text-yellow-500">Metal: {hud.metal}</div>
                    <div className="h-1.5 w-32 bg-muted rounded-full overflow-hidden"><div className="h-full bg-yellow-500" style={{ width: `${(hud.metal / 200) * 100}%` }} /></div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Ammo & Reload HUD */}
          <div className="pointer-events-none absolute bottom-6 right-6 flex flex-col items-end gap-2">
            {/* Weapon Slots */}
            <div className="flex gap-2 mb-2">
              {hud.slots.map((s: string, i: number) => (
                <div key={i} className={cn("w-8 h-8 flex items-center justify-center rounded border text-xs font-bold transition-all", hud.slot === i ? "bg-primary border-primary text-primary-foreground scale-110 shadow-lg" : "bg-card/50 border-white/10 text-muted-foreground opacity-50")}>
                  {i + 1}
                </div>
              ))}
            </div>
            
            <div className="flex flex-col items-end rounded-xl bg-card/90 p-5 shadow-2xl border border-white/10 min-w-[140px]">
              <div className={cn("text-5xl font-black transition-colors", (hud.clip <= hud.maxClip * 0.25) ? "text-destructive animate-pulse" : "text-foreground")}>
                {hud.clip}{hud.reserve > 0 ? <span className="text-2xl opacity-40 ml-1">/ {hud.reserve}</span> : ""}
              </div>
              <div className="text-sm font-bold uppercase tracking-widest opacity-70 mt-1">{hud.weapon}</div>
              
              {/* Reload Progress */}
              {hud.reloading && (
                <div className="mt-2 w-full h-1 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary animate-[shimmer_1s_infinite]" style={{ width: '100%' }} />
                  <div className="text-[9px] text-center mt-1 font-bold text-primary animate-pulse">RELOADING...</div>
                </div>
              )}
            </div>
          </div>

          {!hud.locked && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
              <div className="rounded-full bg-primary px-8 py-3 text-xl font-black text-primary-foreground animate-bounce shadow-2xl ring-4 ring-primary/20 cursor-pointer">CLICK TO JOIN BATTLE</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
