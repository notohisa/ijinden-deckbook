'use client';

import { useMemo, useState } from 'react';
import type { AppCard, Deck, DeckImportError } from '@/app/types/deck';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DeckStatusBadge } from '@/components/deck-status-badge';
import { createImportPreview } from '@/lib/deck-import';
import { formatUpdatedAt } from '@/lib/deck-utils';
import { validateDeck } from '@/lib/deck-validator';

type Props = {
  open: boolean;
  importedDecks: readonly Deck[];
  invalidDecks: readonly DeckImportError[];
  totalCount: number;
  existingDecks: readonly Deck[];
  cardsById: ReadonlyMap<string, AppCard>;
  onOpenChange: (open: boolean) => void;
  onImport: (decks: Deck[]) => void;
};

export function ImportDeckDialog({
  open,
  importedDecks,
  invalidDecks,
  totalCount,
  existingDecks,
  cardsById,
  onOpenChange,
  onImport,
}: Props) {
  const items = useMemo(
    () => createImportPreview(importedDecks, existingDecks),
    [existingDecks, importedDecks],
  );
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(items.map((item) => item.key)),
  );
  const selectedItems = items.filter((item) => selectedKeys.has(item.key));
  const selectedCount = selectedItems.length;
  const allSelected = items.length > 0 && selectedCount === items.length;

  function toggleItem(key: string, checked: boolean) {
    setSelectedKeys((previous) => {
      const next = new Set(previous);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto bg-[#f8f5ee] sm:max-w-xl">
        <DialogHeader className="pr-8">
          <DialogTitle className="font-display text-xl">
            マイデッキをインポート
          </DialogTitle>
          <DialogDescription>
            {totalCount}
            件のデッキを確認しました。選んだデッキだけを取り込みます。
          </DialogDescription>
        </DialogHeader>
        {invalidDecks.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
            <p className="font-medium">
              {invalidDecks.length}件は読み込めませんでした。
            </p>
            <ul className="mt-1 list-disc pl-5">
              {invalidDecks.map((entry) => (
                <li key={entry.index}>
                  {entry.name}：{entry.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        {items.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setSelectedKeys(new Set(items.map((item) => item.key)))
                }
                disabled={allSelected}
              >
                すべて選択
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSelectedKeys(new Set())}
                disabled={selectedCount === 0}
              >
                すべて解除
              </Button>
              <span className="ml-auto self-center text-sm tabular-nums text-[var(--muted)]">
                選択 {selectedCount} / {items.length}件
              </span>
            </div>
            <ul className="space-y-2" aria-label="インポートするデッキ一覧">
              {items.map((item) => {
                const validation = validateDeck(item.deck, { cardsById });
                const isSelected = selectedKeys.has(item.key);
                return (
                  <li
                    key={item.key}
                    className={
                      'rounded-xl border p-3 transition ' +
                      (item.action === 'update'
                        ? 'border-amber-300 bg-amber-50/60'
                        : 'border-[var(--line)] bg-white')
                    }
                  >
                    <label className="flex cursor-pointer items-start gap-3">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) =>
                          toggleItem(item.key, checked === true)
                        }
                        aria-label={item.deck.name || '名前のないデッキ'}
                        className="mt-1 size-5"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="break-words text-base font-medium">
                            {item.deck.name || '名前のないデッキ'}
                          </span>
                          <span
                            className={
                              item.action === 'update'
                                ? 'rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-950'
                                : 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900'
                            }
                          >
                            {item.action === 'update' ? '↻ 更新' : '＋ 新規'}
                          </span>
                          <DeckStatusBadge validation={validation} />
                        </span>
                        <span className="mt-1 block text-sm text-[var(--muted)]">
                          メイン {validation.mainCount}枚 / サイド{' '}
                          {validation.sideCount}枚
                        </span>
                        {item.action === 'update' && (
                          <span className="mt-1 block text-xs leading-5 text-amber-950">
                            ⚠ この端末の既存デッキを更新します
                            {item.existingDeck &&
                            formatUpdatedAt(item.existingDeck.updatedAt)
                              ? '（この端末：' +
                                formatUpdatedAt(item.existingDeck.updatedAt) +
                                '）'
                              : ''}
                            {formatUpdatedAt(item.deck.updatedAt)
                              ? '　インポート：' +
                                formatUpdatedAt(item.deck.updatedAt)
                              : ''}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <DialogFooter className="bg-[var(--soft)]">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => onOpenChange(false)}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            className="h-11"
            disabled={selectedCount === 0}
            onClick={() => onImport(selectedItems.map((item) => item.deck))}
          >
            {selectedCount}件をインポート
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
