'use client';

import { useMemo, useState } from 'react';
import type {
  AppCard,
  Deck,
  DeckColor,
  DeckValidationStatus,
} from '@/app/types/deck';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DeckStatusBadge } from '@/components/deck-status-badge';
import {
  deckColorOptions,
  deckRowColorClasses,
  formatUpdatedAt,
} from '@/lib/deck-utils';
import { validateDeck } from '@/lib/deck-validator';

type StatusFilter = 'all' | DeckValidationStatus;
type SortOrder = 'updated-desc' | 'updated-asc' | 'name';

type Props = {
  decks: readonly Deck[];
  cardsById: ReadonlyMap<string, AppCard>;
  onCreate: () => void;
  onOpenDeck: (deck: Deck) => void;
  onRename: (deckId: string, name: string) => boolean;
  onSetColor: (deckId: string, color: DeckColor) => void;
  onDelete: (deckId: string) => void;
};

export function MyDecks({
  decks,
  cardsById,
  onCreate,
  onOpenDeck,
  onRename,
  onSetColor,
  onDelete,
}: Props) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('updated-desc');
  const [renamingDeckId, setRenamingDeckId] = useState<string | null>(null);
  const [renamingDeckName, setRenamingDeckName] = useState('');
  const [colorPickerDeckId, setColorPickerDeckId] = useState<string | null>(
    null,
  );
  const deckItems = useMemo(
    () =>
      decks.map((deck) => ({
        deck,
        validation: validateDeck(deck, { cardsById }),
      })),
    [cardsById, decks],
  );
  const statusCounts = useMemo(
    () => ({
      all: deckItems.length,
      valid: deckItems.filter((item) => item.validation.status === 'valid')
        .length,
      incomplete: deckItems.filter(
        (item) => item.validation.status === 'incomplete',
      ).length,
      invalid: deckItems.filter((item) => item.validation.status === 'invalid')
        .length,
    }),
    [deckItems],
  );
  const visibleDeckItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ja');
    return deckItems
      .filter(({ deck, validation }) => {
        if (statusFilter !== 'all' && validation.status !== statusFilter)
          return false;
        if (!normalized) return true;
        const cardNames = [...Object.keys(deck.main), ...Object.keys(deck.side)]
          .map((cardId) => cardsById.get(cardId)?.name ?? '')
          .join(' ');
        return (deck.name + ' ' + cardNames)
          .toLocaleLowerCase('ja')
          .includes(normalized);
      })
      .sort((left, right) => {
        if (sortOrder === 'name')
          return left.deck.name.localeCompare(right.deck.name, 'ja');
        const leftTime = Date.parse(left.deck.updatedAt) || 0;
        const rightTime = Date.parse(right.deck.updatedAt) || 0;
        return sortOrder === 'updated-desc'
          ? rightTime - leftTime
          : leftTime - rightTime;
      });
  }, [cardsById, deckItems, query, sortOrder, statusFilter]);

  function beginRenaming(deck: Deck) {
    setColorPickerDeckId(null);
    setRenamingDeckId(deck.id);
    setRenamingDeckName(deck.name);
  }

  function finishRenaming() {
    if (!renamingDeckId) return;
    if (onRename(renamingDeckId, renamingDeckName)) setRenamingDeckId(null);
  }

  return (
    <section
      className="mx-auto max-w-2xl space-y-4"
      role="tabpanel"
      aria-label="マイデッキ"
    >
      <section className="rounded-2xl border border-[var(--line)] bg-white/75 p-3">
        <div className="mb-3 flex items-center justify-between gap-3 px-1 pt-1">
          <div>
            <p className="label">MY DECKS</p>
            <h1 className="font-display mt-1 text-lg tracking-wide">
              マイデッキ
            </h1>
          </div>
          <Button
            size="icon-sm"
            variant="outline"
            className="border-[var(--line)]"
            onClick={onCreate}
            aria-label="新しいデッキ"
          >
            ＋
          </Button>
        </div>
        <label htmlFor="my-decks-search" className="relative block">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
            ⌕
          </span>
          <Input
            id="my-decks-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="デッキ名・カード名で検索"
            aria-label="デッキ名・カード名で検索"
            className="h-11 border-[var(--line)] bg-white pl-9 text-base"
          />
        </label>
        <div
          className="mt-3 flex flex-wrap gap-1.5"
          aria-label="デッキ状態で絞り込み"
        >
          <StatusFilterButton
            active={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
          >
            すべて {statusCounts.all}
          </StatusFilterButton>
          <StatusFilterButton
            active={statusFilter === 'valid'}
            onClick={() => setStatusFilter('valid')}
          >
            使用可能 {statusCounts.valid}
          </StatusFilterButton>
          <StatusFilterButton
            active={statusFilter === 'incomplete'}
            onClick={() => setStatusFilter('incomplete')}
          >
            作成途中 {statusCounts.incomplete}
          </StatusFilterButton>
          <StatusFilterButton
            active={statusFilter === 'invalid'}
            onClick={() => setStatusFilter('invalid')}
          >
            ルール違反 {statusCounts.invalid}
          </StatusFilterButton>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <label htmlFor="my-decks-sort" className="text-sm font-medium">
            並び替え
          </label>
          <select
            id="my-decks-sort"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as SortOrder)}
            className="h-9 min-w-40 rounded-lg border border-[var(--line)] bg-white px-2 text-sm"
          >
            <option value="updated-desc">更新が新しい順</option>
            <option value="updated-asc">更新が古い順</option>
            <option value="name">名前順</option>
          </select>
        </div>

        {decks.length === 0 ? (
          <p className="mt-3 rounded-xl bg-[var(--soft)] px-3 py-7 text-center text-sm leading-6 text-[var(--muted)]">
            保存済みのデッキはありません。
            <br />
            レシピタブの「マイデッキに保存」から追加できます。
          </p>
        ) : visibleDeckItems.length === 0 ? (
          <p className="mt-3 rounded-xl bg-[var(--soft)] px-3 py-7 text-center text-sm leading-6 text-[var(--muted)]">
            条件に一致するマイデッキはありません。
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {visibleDeckItems.map(({ deck, validation }) => {
              const isRenaming = renamingDeckId === deck.id;
              const isChoosingColor = colorPickerDeckId === deck.id;
              const deckColor = deck.color ?? 'default';
              return isRenaming ? (
                <div
                  key={deck.id}
                  className="rounded-xl bg-[var(--mist)] p-2 ring-1 ring-[var(--line)]"
                >
                  <label htmlFor={'deck-name-' + deck.id} className="sr-only">
                    デッキ名
                  </label>
                  <Input
                    id={'deck-name-' + deck.id}
                    value={renamingDeckName}
                    onChange={(event) =>
                      setRenamingDeckName(event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') finishRenaming();
                    }}
                    className="h-10 border-[var(--line)] bg-white text-base"
                  />
                  <div className="mt-2 flex justify-end gap-1">
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => setRenamingDeckId(null)}
                    >
                      キャンセル
                    </Button>
                    <Button size="xs" onClick={finishRenaming}>
                      変更を保存
                    </Button>
                  </div>
                </div>
              ) : (
                <div key={deck.id} className="space-y-1">
                  <div
                    className={
                      'flex w-full items-center gap-1 rounded-xl transition ' +
                      deckRowColorClasses[deckColor]
                    }
                  >
                    <button
                      type="button"
                      onClick={() => onOpenDeck(deck)}
                      className="min-w-0 flex-1 px-3 py-2.5 text-left"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {deck.name || '名前のないデッキ'}
                        </span>
                        <DeckStatusBadge validation={validation} />
                      </span>
                      <span className="mt-1 block text-xs text-[var(--muted)]">
                        メイン {validation.mainCount}枚 · サイド{' '}
                        {validation.sideCount}枚
                        {formatUpdatedAt(deck.updatedAt)
                          ? ' · ' + formatUpdatedAt(deck.updatedAt)
                          : ''}
                      </span>
                    </button>
                    <div className="flex shrink-0 gap-0.5 pr-1">
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        className="text-[var(--muted)]"
                        onClick={() => {
                          setRenamingDeckId(null);
                          setColorPickerDeckId(
                            isChoosingColor ? null : deck.id,
                          );
                        }}
                        aria-label={deck.name + 'の色を変更'}
                      >
                        <span
                          aria-hidden="true"
                          className={
                            'size-3 rounded-full border border-black/20 ' +
                            deckColorOptions.find(
                              (option) => option.value === deckColor,
                            )?.swatchClass
                          }
                        />
                      </Button>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        className="text-[var(--muted)]"
                        onClick={() => beginRenaming(deck)}
                        aria-label={deck.name + 'の名前を変更'}
                      >
                        ✎
                      </Button>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        className="text-[var(--red)] hover:text-[var(--red)]"
                        onClick={() => {
                          if (
                            window.confirm(
                              '「' +
                                (deck.name || '名前のないデッキ') +
                                '」を削除しますか？',
                            )
                          )
                            onDelete(deck.id);
                        }}
                        aria-label={deck.name + 'を削除'}
                      >
                        ×
                      </Button>
                    </div>
                  </div>
                  {isChoosingColor && (
                    <div className="grid grid-cols-3 gap-1 rounded-lg border border-[var(--line)] bg-white p-1.5">
                      <p className="col-span-3 px-1 text-xs text-[var(--muted)]">
                        デッキの色
                      </p>
                      {deckColorOptions.map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          size="xs"
                          className="h-10 w-full"
                          variant={
                            deckColor === option.value ? 'secondary' : 'ghost'
                          }
                          onClick={() => {
                            onSetColor(deck.id, option.value);
                            setColorPickerDeckId(null);
                          }}
                        >
                          <span
                            aria-hidden="true"
                            className={
                              'size-2.5 rounded-full ' + option.swatchClass
                            }
                          />
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}

function StatusFilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant="outline"
      aria-pressed={active}
      onClick={onClick}
      className={
        active
          ? 'border-[var(--ink)] bg-[var(--ink)] !text-white hover:bg-[var(--ink)]/85 hover:!text-white'
          : 'border-[var(--line)] bg-white text-[var(--ink)]'
      }
    >
      {children}
    </Button>
  );
}
