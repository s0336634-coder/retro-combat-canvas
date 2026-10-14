import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CLASS_ORDER, CLASSES, type ClassId } from "@/game/classes";
import { cn } from "@/lib/utils";
import { ClassPreview } from "@/components/ClassPreview";

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

          {/* Objective arrow */}
          {hud.alive && <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-primary/70" style={{ transform: `translate(-50%, -50%) rotate(${hud.objAngle}rad) translateY(-90px)` }}>▲</div>}

          {/* Low HP vignette */}
          {hud.alive && hud.hp < hud.maxHp * 0.3 && <div className="pointer-events-none absolute inset-0 animate-pulse shadow-[inset_0_0_140px_rgba(220,38,38,0.6)]" />}

          {/* Damage Direction */}
          {hud.hurt && <div className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-1 -translate-x-1/2 -translate-y-1/2 origin-center bg-destructive shadow-lg" style={{ transform: `translate(-50%, -50%) rotate(${hud.hurtDirection}rad) translateY(-60px)` }} />}

          {/* Top Scoreboard */}
          <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 flex flex-col items-center gap-1 rounded-md bg-card/90 px-6 py-2 shadow-2xl border border-white/10">
            <div className="flex items-center gap-8 text-2xl font-black">
              <span className="text-blue-500">BLU {hud.scores[0]} <span className="text-xs font-bold opacity-60">({hud.aliveCounts[0]} up)</span></span>
              <span className="text-sm font-mono text-muted-foreground">{Math.floor(hud.time / 60)}:{String(hud.time % 60).padStart(2, "0")}</span>
              <span className="text-red-500">{hud.scores[1]} RED <span className="text-xs font-bold opacity-60">({hud.aliveCounts[1]} up)</span></span>
            </div>
            <div className="flex gap-4 text-[10px] uppercase tracking-widest font-bold opacity-80">
              {hud.flags.map((f: any, i: number) => (
                <span key={i} className={cn("flex flex-col items-center", f.state !== "AT_BASE" && (i === 0 ? "text-red-400" : "text-blue-400"))}>
                  {i === 0 ? "BLU" : "RED"} INTEL: {flagText(f)}
                  {f.state === "DROPPED" && <span className="mt-0.5 h-1 w-24 overflow-hidden rounded bg-muted"><span className="block h-full bg-yellow-500" style={{ width: `${(f.returnT / 60) * 100}%` }} /></span>}
                </span>
              ))}
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
                    {hud.healHp != null && <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted"><div className="h-full bg-green-500" style={{ width: `${hud.healHp * 100}%` }} /></div>}
                  </>
                )}
                {hud.cls === "engineer" && (
                  <>
                    <div className="text-xl font-bold text-yellow-500">Metal: {hud.metal}</div>
                    <div className="h-1.5 w-32 bg-muted rounded-full overflow-hidden"><div className="h-full bg-yellow-500" style={{ width: `${(hud.metal / 200) * 100}%` }} /></div>
                    {hud.myBuildings.map((b: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-[10px] font-bold uppercase">
                        <span className="w-16">{b.type.replace("_", " ")} L{b.level}</span>
                        <span className="h-1 w-16 overflow-hidden rounded bg-muted"><span className={cn("block h-full", b.hp < 40 ? "bg-destructive" : "bg-green-500")} style={{ width: `${b.hp}%` }} /></span>
                      </div>
                    ))}
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

          {/* 1. Respawn countdown */}
          {!hud.alive && <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 translate-y-12 rounded-lg bg-card/90 px-6 py-3 text-center">{hud.killedBy && <div className="mb-1 text-sm font-bold text-destructive">Killed by {hud.killedBy}</div>}<div className="text-xs uppercase tracking-widest text-muted-foreground">Respawning in</div><div className="text-4xl font-black text-primary">{hud.respawnIn}s</div></div>}
          {/* 2. K/D tracker */}
          <div className="pointer-events-none absolute right-3 top-[136px] rounded bg-card/80 px-3 py-1 font-mono text-xs">K {hud.kills} · D {hud.deaths}{hud.streak >= 2 && <span className="ml-2 font-black text-yellow-500">🔥{hud.streak}</span>}</div>
          {/* 3. Carrying intel banner */}
          {hud.carrying && <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 animate-pulse rounded bg-primary px-4 py-1 text-sm font-black text-primary-foreground">YOU HAVE THE INTEL — RETURN TO BASE!</div>}
          {/* 4. Low ammo hint */}
          {hud.alive && hud.maxClip > 0 && hud.clip === 0 && !hud.reloading && hud.reserve > 0 && <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 translate-y-8 text-sm font-bold text-destructive">Press R to reload</div>}
          {hud.alive && hud.maxClip > 0 && hud.reserve > 0 && hud.reserve <= hud.maxClip && <div className="pointer-events-none absolute bottom-40 right-6 text-xs font-bold text-yellow-500">LOW RESERVE AMMO</div>}
          {/* 5. Sniper charge */}
          {hud.scoped && <div className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-40 -translate-x-1/2 translate-y-10 overflow-hidden rounded bg-muted"><div className="h-full bg-primary" style={{ width: `${Math.min(100, hud.charge * 100)}%` }} /></div>}
          {/* 6. Spy cloak / disguise */}
          {hud.cls === "spy" && <div className="pointer-events-none absolute bottom-40 left-6 rounded bg-card/80 px-3 py-2 text-xs font-bold"><div>Cloak {Math.round(hud.cloak * (hud.cloak <= 1 ? 100 : 1))}%{hud.cloaked && " · CLOAKED"}</div><div className={hud.disguised ? "text-primary" : "text-muted-foreground"}>{hud.disguised ? "DISGUISED" : "Not disguised (4)"}</div></div>}
          {/* 7. Burning warning */}
          {hud.burning && <div className="pointer-events-none absolute left-1/2 bottom-32 -translate-x-1/2 animate-pulse text-lg font-black text-destructive">ON FIRE! Find water or health</div>}
          {/* 8. Build mode hint */}
          {hud.buildMode && <div className="pointer-events-none absolute left-1/2 bottom-24 -translate-x-1/2 rounded bg-card/90 px-4 py-1 text-sm font-bold">Placing {hud.buildMode.replace("_", " ")} — {hud.ghostValid ? "click to build" : "invalid spot"}</div>}
          {/* 9. Übercharge active */}
          {hud.uberActive && <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_hsl(var(--primary)/0.5)]" />}
          {/* 10. Tab scoreboard */}
          {!hud.showBoard && hud.locked && <div className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground">Hold TAB for scoreboard</div>}
          {hud.showBoard && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 grid w-[640px] -translate-x-1/2 -translate-y-1/2 grid-cols-2 gap-4 rounded-xl bg-card/95 p-4 font-mono text-xs">
              {[0, 1].map((t) => (
                <div key={t}>
                  <div className={cn("mb-2 font-black", t === 0 ? "text-blue-500" : "text-red-500")}>{t === 0 ? "BLU" : "RED"} — {hud.scores[t]}</div>
                  {hud.board.filter((b: any) => b.team === t).map((b: any, i: number) => (
                    <div key={i} className={cn("flex justify-between py-0.5", b.me && "text-primary font-bold", !b.alive && "opacity-50")}>
                      <span>{b.name} ({CLASSES[b.cls as ClassId].name})</span><span>{b.kills}/{b.deaths}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {hud.winner != null && hud.winner !== "" && <div className="pointer-events-none absolute left-1/2 top-1/4 -translate-x-1/2 text-5xl font-black text-primary">{hud.winner === 0 ? "BLU" : hud.winner === 1 ? "RED" : hud.winner} WINS!</div>}

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
