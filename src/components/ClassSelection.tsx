import { useState } from 'react';
import { Crosshair, Heart, Shield, X } from 'lucide-react';
import { CLASS_ORDER, CLASSES, type ClassId } from '@/game/classes';
import { ClassPreview } from './ClassPreview';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

export function ClassSelection({ onSelect, onClose, current }: { onSelect: (cls: ClassId) => void; onClose?: (() => void) | undefined; current?: ClassId | undefined }) {
  const [preview, setPreview] = useState<ClassId>(current ?? 'soldier');
  const def = CLASSES[preview];
  return <section className="deployment absolute inset-0 z-30 overflow-y-auto bg-background text-foreground">
    <div className="deployment-inner mx-auto max-w-6xl p-5 md:p-10">
      <header className="mb-6 flex items-center justify-between border-b border-border pb-5">
        <div><p className="mb-2 text-xs font-bold uppercase tracking-widest text-team-blu">BLU / PERSONNEL DIVISION</p><h1 className="text-4xl font-black md:text-5xl">2FORT <span className="text-primary">DEMAKE</span></h1></div>
        {onClose && <Button size="icon" variant="ghost" aria-label="Close class selection" onClick={onClose}><X /></Button>}
      </header>
      <div className="deployment-grid grid gap-8 md:grid-cols-[1fr_1fr]">
        <div>
          <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-bold uppercase tracking-widest">Choose your class</h2><span className="text-xs text-muted-foreground">09 OPERATIVES</span></div>
          <div className="grid grid-cols-3 gap-2">
            {CLASS_ORDER.map((c, i) => <Button key={c} variant="outline" onMouseEnter={() => setPreview(c)} onFocus={() => setPreview(c)} onClick={() => onSelect(c)} className={cn('class-choice h-24 min-w-0 flex-col items-start justify-center gap-1 whitespace-normal p-3 text-left', preview === c && 'border-primary bg-accent')}>
              <span className="text-[10px] font-mono text-muted-foreground">0{i + 1}</span><span className="text-sm font-black uppercase">{CLASSES[c].name}</span><span className="text-[10px] font-normal text-muted-foreground">{CLASSES[c].hp} HP</span>
            </Button>)}
          </div>
          <div className="mt-5 flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground"><Shield className="size-4 text-team-blu" /> BLU TEAM <span className="ml-auto">CAPTURE THE INTELLIGENCE</span></div>
        </div>
        <div className="class-dossier relative min-w-0">
          <div className="flex items-baseline justify-between"><h2 className="text-3xl font-black uppercase text-primary">{def.name}</h2><span className="flex items-center gap-2 font-mono text-sm"><Heart className="size-4 text-health" /> {def.hp}</span></div>
          <div className="class-stage h-64 md:h-72"><ClassPreview cls={preview} /></div>
          <p className="mb-4 text-sm text-muted-foreground">{def.role}</p>
          <div className="border-t border-border">
            {def.weapons.map((w, i) => <div key={w.name} className="flex items-center gap-3 border-b border-border py-2 text-xs"><span className="font-mono text-muted-foreground">0{i + 1}</span><span className="font-bold">{w.name}</span><span className="ml-auto font-mono text-muted-foreground">{w.clip > 0 ? `${w.clip} / ${w.reserve}` : 'MELEE'}</span></div>)}
          </div>
          <Button className="mt-4 w-full font-black uppercase" onClick={() => onSelect(preview)}><Crosshair /> {current ? 'Switch to' : 'Deploy as'} {def.name}</Button>
        </div>
      </div>
    </div>
  </section>;
}