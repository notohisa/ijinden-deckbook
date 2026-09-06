import type { AppCard, CardType, Deck, DeckColor } from '@/app/types/deck';

export const cardTypes = [
  'イジン',
  'ハイケイ',
  'マホウ',
  'マリョク',
] as const satisfies readonly CardType[];

export const deckColorOptions: Array<{
  value: DeckColor;
  label: string;
  swatchClass: string;
}> = [
  { value: 'default', label: '標準', swatchClass: 'bg-[var(--mist)]' },
  { value: 'orange', label: 'オレンジ', swatchClass: 'bg-orange-400' },
  { value: 'gray', label: 'グレー', swatchClass: 'bg-slate-400' },
];

export const deckRowColorClasses: Record<DeckColor, string> = {
  default: 'bg-white/50 hover:bg-[var(--soft)]',
  orange: 'bg-orange-100 hover:bg-orange-200',
  gray: 'bg-slate-200 hover:bg-slate-300',
};

const unlimitedDeckText = 'デッキに何枚でも入れてよい';

/**
 * Adds rule metadata while the catalog is built. Existing explicit metadata is
 * left untouched, allowing future cards to specify a numeric cap directly.
 */
export function applyCardRuleMetadata(card: AppCard): AppCard {
  if (card.deckLimit !== undefined) return card;
  return card.description.includes(unlimitedDeckText)
    ? { ...card, deckLimit: null }
    : card;
}

export function countCards(cardsInPile: Record<string, number>): number {
  return Object.values(cardsInPile).reduce((total, count) => total + count, 0);
}

export function normalizedDeckName(name: string): string {
  return name.trim();
}

export function newDeck(index: number): Deck {
  return {
    id: crypto.randomUUID(),
    name: '新しいデッキ ' + String(index),
    main: {},
    side: {},
    updatedAt: new Date().toISOString(),
    isSaved: false,
  };
}

export function copyDeckAsDraft(deck: Deck): Deck {
  return {
    ...deck,
    id: crypto.randomUUID(),
    main: { ...deck.main },
    side: { ...deck.side },
    updatedAt: new Date().toISOString(),
    isSaved: false,
  };
}

export function countByCardType(
  cardsInPile: Record<string, number>,
  cardsById: ReadonlyMap<string, AppCard>,
): Record<CardType, number> {
  const totals: Record<CardType, number> = {
    イジン: 0,
    ハイケイ: 0,
    マホウ: 0,
    マリョク: 0,
  };
  for (const [cardId, count] of Object.entries(cardsInPile)) {
    const cardType = cardsById.get(cardId)?.cardType;
    if (cardType) totals[cardType] += count;
  }
  return totals;
}

export function formatUpdatedAt(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
