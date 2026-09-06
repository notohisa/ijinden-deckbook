import type { IjindenCard } from '@/app/ijinden-cards';
import type { SimpleCardState } from '@/lib/simple-simulator';
import type { SimulationState } from '@/lib/simulator';

export type DeckSimulatorProps = {
  active: boolean;
  recipeName: string;
  main: Record<string, number>;
  cardsById: ReadonlyMap<string, IjindenCard>;
  onEditRecipe: () => void;
};

export type SimulatorSession = {
  board: SimulationState;
  recipeSignature: string;
  recipeName: string;
  canMulligan: boolean;
  drawn: number;
  simpleStates: Record<string, SimpleCardState>;
};
