import { Pause, Play, Flag, Trash2, ScanEye, RotateCcw, Users } from 'lucide-react';
import { Button } from './ui/button';
import { FIELD_DEFAULTS, type FieldRules } from '@/game/operations';

export function FieldOperations({ game }: { game: any }) {
  const hud = game.getHud();
  const ops = hud.operations;
  return <div className="space-y-7">
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => game.setPaused(!game.paused)}>{ops.paused ? <Play /> : <Pause />}{ops.paused ? 'Unpause match' : 'Pause match'}</Button>
      <Button variant="outline" onClick={() => { game.inspectWeapon(); }}><ScanEye />Inspect weapon</Button>
    </div>
    <section><h3 className="mb-3 font-black">SQUAD ORDERS <span className="ml-2 text-xs font-normal text-muted-foreground">{ops.order.toUpperCase()} · {ops.orderSeconds}s</span></h3>
      <div className="flex flex-wrap gap-2">{(['balanced','attack','defend','regroup'] as const).map(order => <Button key={order} variant={ops.order === order ? 'default' : 'outline'} onClick={() => game.issueOrder(order)}><Flag />{order[0].toUpperCase() + order.slice(1)}</Button>)}</div>
    </section>
    <section className="grid gap-x-8 md:grid-cols-2">
      <label className="border-b border-border py-4 text-sm">Bots per team <span className="float-right font-mono text-primary">{ops.botCount}</span><input aria-label="Bots per team" className="mt-3 w-full accent-primary" type="range" min={0} max={9} value={ops.botCount} onChange={e => game.setBotCount(Number(e.target.value))} /></label>
      {([['captureGoal','Captures to win',1,10],['respawnSeconds','Respawn seconds',3,20],['pickupSeconds','Pickup respawn seconds',3,30]] as const).map(([key,label,min,max]) => <label key={key} className="border-b border-border py-4 text-sm">{label}<span className="float-right font-mono text-primary">{ops.rules[key]}</span><input aria-label={label} className="mt-3 w-full accent-primary" type="range" min={min} max={max} value={ops.rules[key]} onChange={e => game.setFieldRule(key,Number(e.target.value))} /></label>)}
      {([['regeneration','Health regeneration'],['rapidReload','Rapid reload'],['endlessAmmo','Endless ammunition'],['safeJumps','Safe rocket jumps'],['fastMovement','Fast movement']] as const).map(([key,label]) => <label key={key} className="flex items-center justify-between gap-4 border-b border-border py-4 text-sm">{label}<input type="checkbox" className="size-5 accent-primary" checked={ops.rules[key]} onChange={e => game.setFieldRule(key,e.target.checked)} /></label>)}
    </section>
    <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { for (const key of Object.keys(FIELD_DEFAULTS) as (keyof FieldRules)[]) game.setFieldRule(key,FIELD_DEFAULTS[key]); }}><RotateCcw />Restore classic rules</Button><Button variant="outline" onClick={() => { if (window.confirm('Switch teams and start a fresh match?')) game.switchTeam(); }}><Users />Switch to {hud.team === 0 ? 'RED' : 'BLU'}</Button></div>
    <section><h3 className="mb-3 font-black">ENGINEER BUILDINGS</h3>{ops.buildings.length ? ops.buildings.map((b: any) => <div key={b.id} className="flex items-center justify-between gap-3 border-b border-border py-3 text-sm"><span className="uppercase">{b.type.replace('_',' ')} · L{b.level} · {b.hp} HP</span><Button variant="outline" size="icon" aria-label={`Demolish ${b.type}`} title={`Demolish ${b.type}`} onClick={() => game.demolishBuilding(b.id)}><Trash2 /></Button></div>) : <p className="text-sm text-muted-foreground">No buildings deployed</p>}</section>
  </div>;
}

export function PerformanceReport({ game }: { game: any }) {
  const ops = game.getHud().operations;
  return <div>
    <h3 className="mb-4 font-black">MATCH PERFORMANCE</h3>
    <div className="grid grid-cols-2 gap-5 border-y border-border py-5 sm:grid-cols-4">{[['K+A / deaths',ops.report.efficiency],['Damage / minute',ops.report.damagePerMinute],['Healing',ops.report.support],['Objectives',ops.report.objectives]].map(([label,value]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-mono text-primary">{value}</p></div>)}</div>
    <h3 className="mb-4 mt-8 font-black">LAST DEATH</h3>
    {ops.deathRecap ? <><p className="mb-4 text-sm text-team-red">{ops.deathRecap.killer} · {ops.deathRecap.weapon}{ops.deathRecap.distance !== null && ` · ${ops.deathRecap.distance}m`}</p>{ops.deathRecap.hits.map((hit: any,i: number) => <div key={i} className="flex justify-between gap-4 border-b border-border py-3 text-sm"><span>{hit.name} · {hit.weapon}</span><span className="font-mono text-warning">−{hit.damage}</span></div>)}</> : <p className="text-sm text-muted-foreground">No deaths this match</p>}
  </div>;
}