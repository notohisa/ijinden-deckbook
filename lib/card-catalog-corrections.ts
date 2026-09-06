import type { AppCard } from '@/app/types/deck';

type CardCatalogCorrection = Readonly<Pick<AppCard, 'rarity'>>;

// Keep source-data corrections explicit and centralized. The generated
// official catalog remains untouched, while every screen uses the corrected
// in-memory card object.
const cardCatalogCorrections: Readonly<
  Record<string, CardCatalogCorrection>
> = {
  'P-016': { rarity: 'N' },
};

export function applyCardCatalogCorrections(card: AppCard): AppCard {
  const correction = cardCatalogCorrections[card.id];
  return correction ? { ...card, ...correction } : card;
}
