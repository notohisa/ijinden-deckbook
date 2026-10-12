'use client';

/* oxlint-disable next/no-img-element -- Shared recipes use the same official and custom card URLs as the recipe tab. */

import { useEffect, useMemo, useState } from 'react';
import type { AppCard, Deck, Pile } from '@/app/types/deck';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { parseDeckShareHash } from '@/lib/deck-share';
import { countCards } from '@/lib/deck-utils';

export function IncomingDeckShare({
  cardsById,
  canImport,
  onImport,
}: {
  cardsById: ReadonlyMap<string, AppCard>;
  canImport: boolean;
  onImport: (deck: Deck) => void;
}) {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [error, setError] = useState('');
  const knownCardIds = useMemo(() => new Set(cardsById.keys()), [cardsById]);

  /* oxlint-disable react/react-compiler -- The browser URL is an external input; synchronize initial navigation and hash changes with its preview. */
  useEffect(() => {
    function readShare() {
      try {
        setDeck(parseDeckShareHash(window.location.hash, knownCardIds));
        setError('');
      } catch (cause) {
        setDeck(null);
        setError(
          cause instanceof Error
            ? cause.message
            : '共有リンクを読み込めませんでした。',
        );
      }
    }
    readShare();
    window.addEventListener('hashchange', readShare);
    return () => window.removeEventListener('hashchange', readShare);
  }, [knownCardIds]);
  /* oxlint-enable react/react-compiler */

  function close() {
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (params.has('deck')) {
      params.delete('deck');
      const url = new URL(window.location.href);
      url.hash = params.toString();
      window.history.replaceState(window.history.state, '', url.href);
    }
    setDeck(null);
    setError('');
  }

  if (!deck && !error) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto bg-[var(--paper)] sm:max-w-2xl">
        <DialogHeader className="pr-8">
          <DialogTitle className="font-display text-xl">
            {deck ? '共有されたデッキ' : '共有リンクを読み込めませんでした'}
          </DialogTitle>
          <DialogDescription>
            {deck
              ? '内容を確認して、マイデッキへ取り込めます。'
              : 'リンク全体がコピーされているか確認してください。'}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-[var(--danger-line)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger-foreground)]"
          >
            {error}
          </p>
        )}
        {deck && (
          <>
            <h2 className="break-words font-display text-xl">
              {deck.name || '名前のないデッキ'}
            </h2>
            {(['main', 'side'] as const).map((pile: Pile) => {
              const title = pile === 'main' ? 'メインデッキ' : 'サイドデッキ';
              const entries = [...cardsById.values()].filter(
                (card) => deck[pile][card.id],
              );
              return (
                <section key={pile} aria-label={title}>
                  <h3 className="mb-2 font-medium">
                    {title}（{countCards(deck[pile])}枚）
                  </h3>
                  {entries.length === 0 ? (
                    <p className="text-sm text-[var(--muted)]">なし</p>
                  ) : (
                    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {entries.map((card) => (
                        <li
                          key={card.id}
                          className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-1.5"
                        >
                          <img
                            src={card.imageUrl}
                            alt={card.name}
                            loading="lazy"
                            className="aspect-[2/3] w-full rounded object-contain"
                          />
                          <p className="mt-1 break-words text-xs leading-4">
                            {card.name}
                          </p>
                          <p className="text-xs font-medium">
                            {deck[pile][card.id]}枚
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
            {!canImport && (
              <p className="text-sm text-[var(--warning-foreground)]">
                この端末の保存データを確認できるまで、取り込みはできません。
              </p>
            )}
          </>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={close}
          >
            閉じる
          </Button>
          {deck && (
            <Button
              type="button"
              className="h-11"
              disabled={!canImport}
              onClick={() => {
                close();
                onImport(deck);
              }}
            >
              マイデッキに取り込む
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
