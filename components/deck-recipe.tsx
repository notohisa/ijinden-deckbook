'use client';

/* oxlint-disable next/no-img-element -- GitHub Pages renders official card URLs with standard images, without a Next.js image server. */

import { useEffect, useState } from 'react';
import type {
  AppCard,
  CardType,
  Deck,
  DeckValidation,
  Pile,
  RegulationValidation,
} from '@/app/types/deck';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DeckStatusBadge } from '@/components/deck-status-badge';
import { RegulationStatus } from '@/components/regulation-status';
import { cardTypes, countByCardType, countCards } from '@/lib/deck-utils';

const colorOptions = ['赤', '青', '緑', '黄', '紫', '無'] as const;

function getCardSelectionKey(pile: Pile, cardId: string): string {
  return pile + ':' + cardId;
}

type Props = {
  deck: Deck;
  cardsById: ReadonlyMap<string, AppCard>;
  cardOrder: ReadonlyMap<string, number>;
  validation: DeckValidation;
  regulationValidations: readonly RegulationValidation[];
  notice: string;
  onSave: () => void;
  onClear: () => void;
  onNameChange: (name: string) => void;
  onAdjustCard: (cardId: string, pile: Pile, difference: number) => void;
  onMoveCard: (cardId: string, pile: Pile) => void;
  onSelectCard: (cardId: string) => void;
  onOpenCards: () => void;
  onOpenSimulator: () => void;
};

export function DeckRecipe({
  deck,
  cardsById,
  cardOrder,
  validation,
  regulationValidations,
  notice,
  onSave,
  onClear,
  onNameChange,
  onAdjustCard,
  onMoveCard,
  onSelectCard,
  onOpenCards,
  onOpenSimulator,
}: Props) {
  const [selectedCardKey, setSelectedCardKey] = useState<string | null>(null);
  const mainTypeCounts = countByCardType(deck.main, cardsById);
  const sideTypeCounts = countByCardType(deck.side, cardsById);

  function handleAdjustCard(cardId: string, pile: Pile, difference: number) {
    if (difference < 0 && deck[pile][cardId] === 1) {
      setSelectedCardKey(null);
    }
    onAdjustCard(cardId, pile, difference);
  }

  function handleMoveCard(cardId: string, pile: Pile) {
    setSelectedCardKey(null);
    onMoveCard(cardId, pile);
  }

  useEffect(() => {
    if (!selectedCardKey) return;

    function dismissCardControls(event: PointerEvent) {
      const cardElement =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-deck-card-key]')
          : null;
      if (cardElement?.dataset.deckCardKey !== selectedCardKey) {
        setSelectedCardKey(null);
      }
    }

    document.addEventListener('pointerdown', dismissCardControls);
    return () =>
      document.removeEventListener('pointerdown', dismissCardControls);
  }, [selectedCardKey]);

  return (
    <section
      className="mx-auto min-w-0 max-w-4xl rounded-2xl border border-[var(--line)] bg-white/85 shadow-[0_16px_40px_rgb(33_38_45/0.06)]"
      role="tabpanel"
      aria-label="レシピ"
    >
      <div className="border-b border-[var(--line)] px-4 py-4 sm:px-5">
        <p className="label">NOW EDITING</p>
        <h1 className="mt-1 font-display text-2xl tracking-wide">
          デッキレシピ
        </h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            className="bg-[var(--green)] text-white hover:bg-[var(--green)]/85"
            onClick={onSave}
          >
            マイデッキに保存
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-[var(--red)] text-[var(--red)] hover:bg-red-50 hover:text-[var(--red)]"
            onClick={onClear}
          >
            レシピをクリア
          </Button>
        </div>
        <div className="mt-3">
          <label htmlFor="deck-name" className="sr-only">
            デッキ名
          </label>
          <Input
            id="deck-name"
            aria-label="デッキ名"
            placeholder="デッキ名を入力（任意）"
            value={deck.name}
            onChange={(event) => onNameChange(event.target.value)}
            className="h-11 w-full border-[var(--line)] bg-white px-3 text-base shadow-none"
          />
        </div>
        <div className="mt-4 grid grid-cols-3 divide-x divide-[var(--line)] rounded-xl border border-[var(--line)] bg-[var(--soft)]">
          <Stat label="MAIN" value={String(validation.mainCount)} />
          <Stat label="SIDE" value={String(validation.sideCount)} />
          <div className="px-2 py-2 text-center">
            <p className="text-[10px] tracking-wide text-[var(--muted)]">
              STATUS
            </p>
            <DeckStatusBadge
              validation={validation}
              className="mt-1 justify-center"
            />
          </div>
        </div>
        <RuleCheck validation={validation} />
        <RegulationStatus validations={regulationValidations} />
        <div className="mt-3 rounded-xl border border-[var(--line)] bg-white px-3 py-2.5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-medium tracking-wide text-[var(--muted)]">
              種類別枚数
            </p>
            <p className="text-[10px] text-[var(--muted)]">メイン / サイド</p>
          </div>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
            {cardTypes.map((cardType) => (
              <div
                key={cardType}
                className="rounded-lg bg-[var(--soft)] px-2 py-1.5 text-center"
              >
                <p className="text-[11px] font-medium">{cardType}</p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  <span className="font-display text-base text-[var(--ink)]">
                    {mainTypeCounts[cardType]}
                  </span>{' '}
                  /{' '}
                  <span className="font-display text-base text-[var(--ink)]">
                    {sideTypeCounts[cardType]}
                  </span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="p-4 sm:p-5">
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full border-[var(--line)] bg-[var(--paper)]"
            onClick={onOpenCards}
          >
            ⌕ カードタブを開く
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full border-[var(--line)] bg-[var(--paper)]"
            onClick={onOpenSimulator}
          >
            シミュレーションを開く
          </Button>
        </div>
        <DeckPile
          title="メインデッキ"
          pile="main"
          deck={deck}
          cardsById={cardsById}
          cardOrder={cardOrder}
          onAdjust={handleAdjustCard}
          onMoveCard={handleMoveCard}
          onSelectCard={onSelectCard}
          selectedCardKey={selectedCardKey}
          onSelectCardForControls={setSelectedCardKey}
        />
        <DeckPile
          title="サイドデッキ"
          pile="side"
          deck={deck}
          cardsById={cardsById}
          cardOrder={cardOrder}
          onAdjust={handleAdjustCard}
          onMoveCard={handleMoveCard}
          onSelectCard={onSelectCard}
          selectedCardKey={selectedCardKey}
          onSelectCardForControls={setSelectedCardKey}
        />
      </div>
      <div className="border-t border-[var(--line)] bg-[var(--soft)] px-4 py-3 sm:px-5">
        <p className="flex items-start gap-2 text-xs leading-5 text-[var(--muted)]">
          <span className="text-[var(--green)]">●</span>
          {notice}
        </p>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2 text-center">
      <p className="text-[10px] tracking-wide text-[var(--muted)]">{label}</p>
      <p className="font-display text-2xl">{value}</p>
    </div>
  );
}

function RuleCheck({ validation }: { validation: DeckValidation }) {
  const positiveRows = [
    'メインデッキ ' + String(validation.mainCount) + '枚',
    'サイドデッキ ' + String(validation.sideCount) + '枚',
    '合計 ' + String(validation.totalCount) + '枚',
  ];
  return (
    <section
      className="mt-3 rounded-xl border border-[var(--line)] bg-white px-3 py-3"
      aria-label="ルールチェック"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg">ルールチェック</h2>
        <DeckStatusBadge validation={validation} />
      </div>
      {validation.status === 'valid' && (
        <ul className="mt-2 space-y-1 text-sm leading-6 text-[var(--ink)]">
          {positiveRows.map((row) => (
            <li key={row}>✅ {row}</li>
          ))}
          <li>✅ 同名カード制限 問題なし</li>
          <li>✅ 禁止・制限カード 問題なし</li>
        </ul>
      )}
      {validation.status === 'incomplete' && (
        <div className="mt-2 space-y-1 text-sm leading-6">
          <p className="font-medium text-amber-900">🟡 作成途中</p>
          {validation.warnings.map((issue) => (
            <p key={issue.code} className="text-amber-950">
              {issue.title}が{issue.detail}
            </p>
          ))}
          <p className="text-[var(--muted)]">
            サイド {validation.sideCount}枚 · 合計 {validation.totalCount}枚
          </p>
        </div>
      )}
      {validation.status === 'invalid' && (
        <div className="mt-2 space-y-1 text-sm leading-6">
          <p className="font-medium text-[var(--red)]">🔴 ルール違反</p>
          {validation.errors.map((issue, index) => (
            <p
              key={issue.code + ':' + String(index)}
              className="text-[var(--red)]"
            >
              ❌ <span className="font-medium">{issue.title}</span>　
              {issue.detail}
              {issue.note ? '（' + issue.note + '）' : ''}
            </p>
          ))}
          {validation.warnings.map((issue) => (
            <p key={issue.code} className="text-amber-950">
              🟡 {issue.title}が{issue.detail}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

function DeckPile({
  title,
  pile,
  deck,
  cardsById,
  cardOrder,
  onAdjust,
  onMoveCard,
  onSelectCard,
  selectedCardKey,
  onSelectCardForControls,
}: {
  title: string;
  pile: Pile;
  deck: Deck;
  cardsById: ReadonlyMap<string, AppCard>;
  cardOrder: ReadonlyMap<string, number>;
  onAdjust: (cardId: string, pile: Pile, difference: number) => void;
  onMoveCard: (cardId: string, pile: Pile) => void;
  onSelectCard: (cardId: string) => void;
  selectedCardKey: string | null;
  onSelectCardForControls: (key: string) => void;
}) {
  const entries = Object.entries(deck[pile])
    .map(([cardId, count]) => ({ card: cardsById.get(cardId), count }))
    .filter((entry): entry is { card: AppCard; count: number } =>
      Boolean(entry.card),
    )
    .sort(
      (left, right) =>
        cardTypes.indexOf(left.card.cardType as CardType) -
          cardTypes.indexOf(right.card.cardType as CardType) ||
        (left.card.level ?? 99) - (right.card.level ?? 99) ||
        colorOptions.findIndex((color) => left.card.color.includes(color)) -
          colorOptions.findIndex((color) => right.card.color.includes(color)) ||
        (left.card.power ?? 99999) - (right.card.power ?? 99999) ||
        (cardOrder.get(left.card.id) ?? 0) -
          (cardOrder.get(right.card.id) ?? 0),
    );
  return (
    <section className="mb-6 last:mb-0">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-lg tracking-wide">{title}</h2>
        <span className="text-xs text-[var(--muted)]">
          {countCards(deck[pile])}枚
        </span>
      </div>
      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--soft)] px-4 py-6 text-center text-xs text-[var(--muted)]">
          カードタブから追加してください
        </div>
      ) : (
        <ul
          className="flex flex-wrap gap-2"
          aria-label={title + 'のカード一覧'}
        >
          {entries.map(({ card, count }) => {
            const cardSelectionKey = getCardSelectionKey(pile, card.id);
            const controlsVisible = selectedCardKey === cardSelectionKey;

            return (
              <li
                key={card.id}
                data-deck-card-key={cardSelectionKey}
                className="relative h-[112px] w-[80px] overflow-hidden rounded-md border border-black/15 bg-white shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => onSelectCardForControls(cardSelectionKey)}
                  aria-label={card.name + 'の操作を表示'}
                  aria-expanded={controlsVisible}
                  className="absolute inset-0 z-0"
                >
                  <img
                    src={card.imageUrl}
                    alt={card.name}
                    loading="lazy"
                    className="h-full w-full object-cover object-top"
                  />
                </button>
                {controlsVisible && (
                  <>
                    <Button
                      type="button"
                      size="icon-xs"
                      onClick={() => onAdjust(card.id, pile, -1)}
                      aria-label={card.name + 'を1枚減らす'}
                      className="absolute left-0 top-0 z-20 rounded-none rounded-br-md bg-[#1769db] text-base text-white hover:bg-[#0f56b7]"
                    >
                      −
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      onClick={() => onAdjust(card.id, pile, 1)}
                      aria-label={card.name + 'を1枚増やす'}
                      className="absolute right-0 top-0 z-20 rounded-none rounded-bl-md bg-[#1769db] text-base text-white hover:bg-[#0f56b7]"
                    >
                      ＋
                    </Button>
                    <button
                      type="button"
                      onClick={() => onSelectCard(card.id)}
                      aria-label={card.name + 'の詳細を開く'}
                      className="absolute left-1/2 top-1/2 z-20 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-md border border-white/80 bg-white/95 text-base text-[var(--ink)] shadow-sm hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--red)]"
                    >
                      ⌕
                    </button>
                  </>
                )}
                <output
                  aria-label={card.name + '：' + count + '枚'}
                  className="absolute bottom-0 left-0 min-w-6 rounded-tr-md border-r border-t border-black/30 bg-white px-1.5 py-0.5 text-center font-display text-sm leading-none text-[var(--ink)]"
                >
                  {count}
                </output>
                {controlsVisible && (
                  <Button
                    type="button"
                    size="icon-xs"
                    onClick={() => onMoveCard(card.id, pile)}
                    aria-label={
                      card.name +
                      'を' +
                      (pile === 'main' ? 'サイドデッキ' : 'メインデッキ') +
                      'へ1枚移動'
                    }
                    className="absolute bottom-0 right-0 z-20 rounded-none rounded-tl-md bg-[#1769db] text-base text-white hover:bg-[#0f56b7]"
                  >
                    {pile === 'main' ? '↓' : '↑'}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
