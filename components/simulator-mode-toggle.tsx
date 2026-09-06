import { Button } from '@/components/ui/button';

export type SimulationViewMode = 'simple' | 'board';

type Props = {
  mode: SimulationViewMode;
  onChange: (mode: SimulationViewMode) => void;
};

export function SimulatorModeToggle({ mode, onChange }: Props) {
  return (
    <fieldset
      className="inline-flex shrink-0 rounded-lg border border-[var(--line)] bg-[var(--soft)] p-1"
    >
      <legend className="sr-only">シミュレーション表示</legend>
      <Button
        type="button"
        size="sm"
        variant={mode === 'simple' ? 'default' : 'ghost'}
        aria-pressed={mode === 'simple'}
        className="h-8 px-2 text-xs"
        onClick={() => onChange('simple')}
      >
        簡易表示
      </Button>
      <Button
        type="button"
        size="sm"
        variant={mode === 'board' ? 'default' : 'ghost'}
        aria-pressed={mode === 'board'}
        className="h-8 px-2 text-xs"
        onClick={() => onChange('board')}
      >
        盤面表示
      </Button>
    </fieldset>
  );
}
