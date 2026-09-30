import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CLASS_ORDER, CLASSES, type ClassId } from "@/game/classes";

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
    const t = setInterval(() => game.current && setHud(game.current.getHud()), 100);
    return () => { alive = false; clearInterval(t); game.current?.dispose(); game.current = null; };
  }, [cls]);

  return (
    <div className="fixed inset-0 bg-background text-foreground select-none">
      <canvas ref={canvas} className="h-full w-full" onClick={() => game.current?.lock()} />
      <canvas ref={mini} width={320} height={120} className="absolute right-3 top-3 rounded" />
      {!cls && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/90 p-6">
          <h1 className="text-4xl font-bold">2FORT DEMAKE</h1>
          <p className="text-muted-foreground">You play BLU. Pick a class — WASD, Space, C, mouse, R, 1-6, right-click alt.</p>
          <div className="grid grid-cols-3 gap-2">
            {CLASS_ORDER.map((c) => (
              <button key={c} onClick={() => setCls(c)} className="rounded border border-border bg-card px-4 py-3 text-left hover:bg-accent">
                <div className="font-bold">{CLASSES[c].name}</div>
                <div className="text-xs text-muted-foreground">{CLASSES[c].role}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      {hud && (
        <>
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground" />
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded bg-card/80 px-4 py-1 font-bold">
            BLU {hud.scores[0]} — {hud.scores[1]} RED
          </div>
          <div className="pointer-events-none absolute left-3 top-3 space-y-1 text-sm">
            {hud.killfeed.map((k: any, i: number) => <div key={i} className="rounded bg-card/80 px-2">{k.text}</div>)}
          </div>
          {hud.message && <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 text-xl font-bold">{hud.message}</div>}
          <div className="pointer-events-none absolute bottom-4 left-4 rounded bg-card/80 px-4 py-2 text-2xl font-bold">
            {hud.alive ? `${hud.hp} HP` : `Respawn in ${hud.respawnIn}`}
            <div className="text-sm font-normal">{CLASSES[hud.cls as ClassId].name}{hud.cls === "medic" && ` · Über ${Math.floor(hud.uber * 100)}%`}{hud.cls === "engineer" && ` · Metal ${hud.metal}`}</div>
          </div>
          <div className="pointer-events-none absolute bottom-4 right-4 rounded bg-card/80 px-4 py-2 text-right text-2xl font-bold">
            {hud.clip}{hud.reserve ? ` / ${hud.reserve}` : ""}
            <div className="text-sm font-normal">{hud.weapon}{hud.reloading && " (reloading)"}</div>
          </div>
          {!hud.locked && <div className="pointer-events-none absolute inset-x-0 bottom-24 text-center">Click to play</div>}
        </>
      )}
    </div>
  );
}
