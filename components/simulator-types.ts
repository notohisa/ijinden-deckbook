import type { IjindenCard } from '@/app/ijinden-cards';

export type { SimulatorSession } from '@/lib/simulator-session';

export type DeckSimulatorProps = {
  active: boolean;
  recipeName: string;
  main: Record<string, number>;
  cardsById: ReadonlyMap<string, IjindenCard>;
  onEditRecipe: () => void;
};
