'use client';

import { useState } from 'react';
import type { AppCard, Deck } from '@/app/types/deck';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { buildDeckShareUrl, formatDeckText } from '@/lib/deck-share';

export function DeckShareActions({
  deck,
  cardsById,
}: {
  deck: Deck;
  cardsById: ReadonlyMap<string, AppCard>;
}) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [copying, setCopying] = useState(false);
  const [manualCopy, setManualCopy] = useState<{
    title: string;
    value: string;
  } | null>(null);

  async function copy(kind: 'link' | 'text') {
    setMessage('');
    setError('');
    const title = kind === 'link' ? '共有リンク' : 'テキストデータ';
    let value: string;
    try {
      value =
        kind === 'link'
          ? buildDeckShareUrl(deck, window.location.href)
          : formatDeckText(deck, cardsById);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'コピーする内容を作成できませんでした。',
      );
      return;
    }
    setCopying(true);
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(value);
      setMessage(title + 'をコピーしました。');
    } catch {
      setManualCopy({ title, value });
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 border-[var(--line)] bg-white"
          disabled={copying}
          onClick={() => void copy('link')}
        >
          共有リンクをコピー
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 border-[var(--line)] bg-white"
          disabled={copying}
          onClick={() => void copy('text')}
        >
          テキストデータをコピー
        </Button>
      </div>
      <p className="text-xs leading-5 text-[var(--muted)]">
        共有リンクを開くと、このデッキの内容を確認して取り込めます。
      </p>
      <output className="block text-sm text-[var(--green)]">
        {message}
      </output>
      {error && (
        <p role="alert" className="text-sm text-[var(--red)]">
          {error}
        </p>
      )}
      <Dialog
        open={manualCopy !== null}
        onOpenChange={(open) => {
          if (!open) setManualCopy(null);
        }}
      >
        <DialogContent className="bg-[#f8f5ee] sm:max-w-xl">
          <DialogHeader className="pr-8">
            <DialogTitle>{manualCopy?.title}をコピー</DialogTitle>
            <DialogDescription>
              自動コピーが使えないため、下の内容を選択してコピーしてください。
            </DialogDescription>
          </DialogHeader>
          <textarea
            aria-label="コピーする内容"
            readOnly
            value={manualCopy?.value ?? ''}
            onFocus={(event) => event.currentTarget.select()}
            className="h-56 w-full rounded-lg border border-[var(--line)] bg-white p-3 text-base"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setManualCopy(null)}
            >
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
