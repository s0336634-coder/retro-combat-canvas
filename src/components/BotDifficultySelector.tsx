import { BOT_DIFFICULTIES, DIFFICULTY_ORDER, type BotDifficulty } from '@/game/difficulty';
import { Button } from './ui/button';

export function BotDifficultySelector({ value, onChange }: { value: BotDifficulty; onChange: (value: BotDifficulty) => void }) {
  return <fieldset className="min-w-0 border-t border-border pt-4">
    <legend className="mb-2 text-xs font-bold uppercase">Bot difficulty</legend>
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Bot difficulty">
      {DIFFICULTY_ORDER.map((difficulty) => <Button key={difficulty} size="sm" variant={value === difficulty ? 'default' : 'outline'} aria-pressed={value === difficulty} onClick={() => onChange(difficulty)}>{BOT_DIFFICULTIES[difficulty].label}</Button>)}
    </div>
    <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
      <div><dt className="inline">Aim </dt><dd className="inline font-bold">{value === 'easy' ? 'Forgiving' : value === 'hard' ? 'Precise' : 'Balanced'}</dd></div>
      <div><dt className="inline">Reaction </dt><dd className="inline font-mono">{Math.round(BOT_DIFFICULTIES[value].reactionTime * 1000)} ms</dd></div>
      <div><dt className="inline">Intel pressure </dt><dd className="inline font-bold">{value === 'easy' ? 'Low' : value === 'hard' ? 'High' : 'Balanced'}</dd></div>
    </dl>
  </fieldset>;
}