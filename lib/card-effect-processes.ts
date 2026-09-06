import type {
  AppCard,
  EffectProcessKey,
  EffectProcessTags,
} from '@/app/types/deck';

export type { EffectProcessKey, EffectProcessTags } from '@/app/types/deck';

export const effectProcessOptions: readonly {
  key: EffectProcessKey;
  label: string;
}[] = [
  { key: 'destroys', label: '破壊する' },
  { key: 'putsInGraveyard', label: '墓地に置く' },
  { key: 'cannotBeDestroyed', label: '破壊されない' },
  { key: 'cannotLeaveBattlefield', label: '戦場から離れない' },
  { key: 'putsOnBottomOfDeck', label: '山札の下に置く' },
  { key: 'putsInManaZone', label: '魔力ゾーンに置く' },
];

/**
 * Normalizes copied card text before tag extraction. Whitespace and HTML line
 * break artifacts do not change the meaning of the six supported processes.
 */
export function normalizeEffectProcessText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/<br\s*\/?\s*>/giu, ' ')
    .replace(/&nbsp;/giu, ' ')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/[\s\u3000]+/gu, '');
}

/**
 * Builds stable, searchable process tags from a card's rule text. Variants in
 * the official data such as 「戦場を離れない」 and 「山札の下に戻す」 are
 * treated as the same user-facing process labels.
 */
export function getEffectProcessTags(text: string): EffectProcessTags {
  const normalized = normalizeEffectProcessText(text);

  return {
    // 「破壊されない」 is deliberately a separate, non-overlapping pattern.
    destroys: /破壊(?:する|して)/u.test(normalized),
    putsInGraveyard: /墓地に置(?:く|いて|き|いた)/u.test(normalized),
    cannotBeDestroyed: /破壊され(?:ない|ず)/u.test(normalized),
    cannotLeaveBattlefield: /戦場(?:から|を)離れ(?:ない|ず)/u.test(normalized),
    putsOnBottomOfDeck:
      /山札の(?:上か)?下に(?:置(?:く|いて|き|いた)|戻(?:す|して|し|した|される))/u.test(
        normalized,
      ),
    putsInManaZone: /魔力ゾーンに置(?:く|いて|き|いた)/u.test(normalized),
  };
}

/** Adds generated tags once when the in-memory catalog is created. */
export function applyEffectProcessTags(card: AppCard): AppCard {
  return {
    ...card,
    effectProcessTags: getEffectProcessTags(card.description),
  };
}

/** Existing same-category filter behavior: selected process tags use OR. */
export function matchesEffectProcessFilters(
  card: Pick<AppCard, 'effectProcessTags'>,
  selected: readonly EffectProcessKey[],
): boolean {
  return (
    selected.length === 0 ||
    selected.some((key) => card.effectProcessTags?.[key] === true)
  );
}
