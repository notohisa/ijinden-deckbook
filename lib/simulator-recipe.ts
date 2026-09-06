import type { IjindenCard } from '@/app/ijinden-cards';
import type { SimulationCardSeed } from '@/lib/simulator';

export const SIMULATION_HAND_SIZE = 6;
export const SIMULATION_GUARDIAN_SIZE = 4;
export const MAX_SIMULATION_CARDS = 1000;

export type SimulationRecipe = {
  signature: string;
  cardInputs: SimulationCardSeed[];
  error: string;
};

/** Expands a deck recipe into physical cards without mutating the saved deck. */
export function buildSimulationRecipe(
  main: Record<string, number>,
  cardsById: ReadonlyMap<string, IjindenCard>,
): SimulationRecipe {
  const entries = Object.entries(main).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const signature = JSON.stringify(entries);

  if (
    entries.some(
      ([id, count]) =>
        !cardsById.has(id) || !Number.isSafeInteger(count) || count < 1,
    )
  ) {
    return {
      signature,
      cardInputs: [],
      error: 'レシピのカード情報を確認してください。',
    };
  }

  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (total < SIMULATION_HAND_SIZE + SIMULATION_GUARDIAN_SIZE) {
    return {
      signature,
      cardInputs: [],
      error: '開始するには、メインデッキに10枚以上入れてください。',
    };
  }

  if (total > MAX_SIMULATION_CARDS) {
    return {
      signature,
      cardInputs: [],
      error: 'シミュレーションで扱えるメインデッキは1000枚までです。',
    };
  }

  return {
    signature,
    cardInputs: entries.flatMap(([id, count]) => {
      const card = cardsById.get(id);
      return Array.from({ length: count }, () => ({
        cardId: id,
        cardType: card?.cardType,
        description: card?.description,
      }));
    }),
    error: '',
  };
}
