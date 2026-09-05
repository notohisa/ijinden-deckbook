import type {
  AppCard,
  CardRestriction,
  Deck,
  DeckRuleIssue,
  DeckValidation,
  DeckValidationStatus,
} from '@/app/types/deck';
import { countCards } from './deck-utils.ts';

export const DEFAULT_CARD_DECK_LIMIT = 4;

// Add a card name and its deck limit here when a card needs a rule that differs from its card data.
// `null` means no same-name limit. A card object's optional `deckLimit` has the same meaning.
export const cardDeckLimits: Readonly<Record<string, number | null>> = {};

// Add official prohibited or restricted cards here. A limit of 0 means prohibited.
export const cardRestrictions: readonly CardRestriction[] = [];

type ValidateDeckOptions = {
  cardsById: ReadonlyMap<string, AppCard>;
  restrictions?: readonly CardRestriction[];
  cardLimits?: Readonly<Record<string, number | null>>;
  now?: Date;
};

type NameCount = {
  count: number;
  limits: Array<number | null>;
};

function hasOwn(
  object: Readonly<Record<string, number | null>>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function activeRestrictionFor(
  cardName: string,
  restrictions: readonly CardRestriction[],
  now: Date,
): CardRestriction | undefined {
  return restrictions
    .filter((restriction) => restriction.cardName === cardName)
    .filter(
      (restriction) =>
        !restriction.effectiveFrom ||
        new Date(restriction.effectiveFrom).getTime() <= now.getTime(),
    )
    .sort((left, right) => left.limit - right.limit)[0];
}

function getCardLimit(
  card: AppCard,
  configuredLimits: Readonly<Record<string, number | null>>,
): number | null {
  if (hasOwn(configuredLimits, card.name)) return configuredLimits[card.name];
  if (typeof card.deckLimit === 'number') return card.deckLimit;
  if (card.deckLimit === null) return null;
  return DEFAULT_CARD_DECK_LIMIT;
}

function combinedLimit(limits: Array<number | null>): number | null {
  const finiteLimits = limits.filter(
    (limit): limit is number => typeof limit === 'number',
  );
  return finiteLimits.length === 0 ? null : Math.min(...finiteLimits);
}

export function getDeckValidationLabel(status: DeckValidationStatus): string {
  if (status === 'valid') return '使用可能';
  if (status === 'incomplete') return '作成途中';
  return 'ルール違反';
}

export function getDeckValidationIcon(status: DeckValidationStatus): string {
  if (status === 'valid') return '✅';
  if (status === 'incomplete') return '🟡';
  return '🔴';
}

export function validateDeck(
  deck: Deck,
  options: ValidateDeckOptions,
): DeckValidation {
  const mainCount = countCards(deck.main);
  const sideCount = countCards(deck.side);
  const totalCount = mainCount + sideCount;
  const errors: DeckRuleIssue[] = [];
  const warnings: DeckRuleIssue[] = [];
  const namedCards = new Map<string, NameCount>();
  const now = options.now ?? new Date();
  const restrictions = options.restrictions ?? cardRestrictions;
  const configuredLimits = options.cardLimits ?? cardDeckLimits;

  if (mainCount < 40) {
    warnings.push({
      code: 'main-minimum',
      title: 'メインデッキ',
      detail: 'あと' + String(40 - mainCount) + '枚必要です',
      count: mainCount,
      limit: 40,
    });
  }

  if (sideCount > 10) {
    errors.push({
      code: 'side-maximum',
      title: 'サイドデッキ',
      detail: String(sideCount) + '枚 / 最大10枚',
      count: sideCount,
      limit: 10,
    });
  }

  if (sideCount > 0 && totalCount > 60) {
    errors.push({
      code: 'total-maximum',
      title: 'メイン＋サイド',
      detail: String(totalCount) + '枚 / 最大60枚',
      count: totalCount,
      limit: 60,
    });
  }

  for (const [cardId, count] of [
    ...Object.entries(deck.main),
    ...Object.entries(deck.side),
  ]) {
    const card = options.cardsById.get(cardId);
    if (!card) {
      errors.push({
        code: 'unknown-card',
        title: cardId,
        detail: '登録されていないカードです',
      });
      continue;
    }
    const current = namedCards.get(card.name) ?? { count: 0, limits: [] };
    current.count += count;
    current.limits.push(getCardLimit(card, configuredLimits));
    namedCards.set(card.name, current);
  }

  for (const [cardName, entry] of namedCards) {
    const restriction = activeRestrictionFor(cardName, restrictions, now);
    const limit = restriction?.limit ?? combinedLimit(entry.limits);
    if (limit === null || entry.count <= limit) continue;
    errors.push({
      code: 'card-limit',
      title: cardName,
      detail:
        limit === 0
          ? '使用禁止カードです'
          : String(entry.count) + '枚 / 最大' + String(limit) + '枚',
      cardName,
      count: entry.count,
      limit,
      note: restriction?.note,
    });
  }

  const namedCardCounts = new Map(
    Array.from(namedCards, ([name, entry]) => [name, entry.count]),
  );
  const status: DeckValidationStatus =
    errors.length > 0
      ? 'invalid'
      : warnings.length > 0
        ? 'incomplete'
        : 'valid';
  return {
    status,
    errors,
    warnings,
    mainCount,
    sideCount,
    totalCount,
    namedCardCounts,
  };
}
