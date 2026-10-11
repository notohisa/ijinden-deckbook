'use client';

/* oxlint-disable next/no-img-element -- Card previews use the existing catalog image URLs directly. */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  DeckTextImportAmbiguityError,
  type DeckTextImportChoice,
} from '@/lib/deck-text-import';

const MAX_TEXT_LENGTH = 400_000;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChooseFile: () => void;
  onInspectText: (
    source: string,
    name: string,
    selections: Record<string, string>,
  ) => void;
};

export function DeckImportSourceDialog({
  open,
  onOpenChange,
  onChooseFile,
  onInspectText,
}: Props) {
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<DeckTextImportChoice[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const textLength = source.length;
  const hasUnselectedChoice = choices.some((choice) => !selections[choice.key]);

  function chooseFile() {
    onOpenChange(false);
    onChooseFile();
  }

  function inspectText() {
    try {
      if (source.trim().length === 0) {
        throw new Error('テキストを貼り付けてください。');
      }
      if (textLength > MAX_TEXT_LENGTH) {
        throw new Error('テキストは40万文字以内にしてください。');
      }
      onInspectText(source, name, selections);
      setError(null);
      setChoices([]);
      setSelections({});
      onOpenChange(false);
    } catch (inspectError) {
      if (inspectError instanceof DeckTextImportAmbiguityError) {
        setChoices(inspectError.choices);
        setError(inspectError.message);
        return;
      }
      setError(
        inspectError instanceof Error
          ? inspectError.message
          : '内容を確認できませんでした。貼り付けた内容を確認してください。',
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto bg-[#f8f5ee] sm:max-w-xl">
        <DialogHeader className="pr-8">
          <DialogTitle className="font-display text-xl">
            デッキをインポート
          </DialogTitle>
          <DialogDescription>
            JSONファイルを選ぶか、コピーしたテキストを貼り付けて内容を確認します。
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2 rounded-xl border border-[var(--line)] bg-white p-3 sm:p-4">
          <h2 className="font-medium text-[var(--ink)]">JSONファイルから</h2>
          <p className="text-sm leading-6 text-[var(--muted)]">
            保存してあるデッキデータを読み込みます。
          </p>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full sm:w-auto"
            onClick={chooseFile}
          >
            JSONファイルを選ぶ
          </Button>
        </section>

        <section className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-3 sm:p-4">
          <div className="space-y-1">
            <h2 className="font-medium text-[var(--ink)]">テキストから</h2>
            <p className="text-sm leading-6 text-[var(--muted)]">
              元サイトの「テキストデータをコピー」でコピーした内容を、そのまま貼り付けてください。
            </p>
          </div>

          <div className="space-y-1 text-sm text-[var(--ink)]">
            <label htmlFor="deck-import-name">デッキ名（任意）</label>
            <Input
              id="deck-import-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="名前がない場合は自動で付けます"
              className="h-11 bg-white"
            />
          </div>

          <div className="space-y-1 text-sm text-[var(--ink)]">
            <label htmlFor="deck-import-source-text">コピーしたテキスト</label>
            <Textarea
              id="deck-import-source-text"
              value={source}
              onChange={(event) => {
                const value = event.target.value;
                setSource(value);
                setChoices([]);
                setSelections({});
                setError(
                  value.length > MAX_TEXT_LENGTH
                    ? 'テキストは40万文字以内にしてください。'
                    : null,
                );
              }}
              placeholder="ここにテキストを貼り付けてください"
              aria-invalid={Boolean(error)}
              aria-describedby="deck-import-text-count"
              className="min-h-56 resize-y bg-white text-base sm:text-sm"
            />
          </div>
          <p
            id="deck-import-text-count"
            className={
              'text-right text-xs tabular-nums ' +
              (textLength > MAX_TEXT_LENGTH
                ? 'text-red-800'
                : 'text-[var(--muted)]')
            }
            aria-live="polite"
          >
            {textLength.toLocaleString('ja-JP')} /{' '}
            {MAX_TEXT_LENGTH.toLocaleString('ja-JP')}文字
          </p>
          {error && (
            <p
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-900"
              role="alert"
            >
              {error}
            </p>
          )}
          {choices.length > 0 && (
            <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <div>
                <h3 className="font-medium text-amber-950">
                  カードの収録版を選んでください
                </h3>
                <p className="mt-1 text-sm leading-6 text-amber-900">
                  同じ名前のカードが複数あります。下の候補から使うカードを選択してください。
                </p>
              </div>
              <ul className="space-y-3">
                {choices.map((choice, index) => {
                  const selected = choice.candidates.find(
                    (card) => card.id === selections[choice.key],
                  );
                  const selectId = `deck-import-choice-${index}`;

                  return (
                    <li
                      key={choice.key}
                      className="space-y-2 rounded-lg border border-amber-200 bg-white p-3"
                    >
                      <label
                        htmlFor={selectId}
                        className="block text-sm font-medium text-[var(--ink)]"
                      >
                        {choice.name}の収録版
                      </label>
                      <select
                        id={selectId}
                        value={selections[choice.key] ?? ''}
                        onChange={(event) => {
                          const value = event.target.value;
                          setSelections((current) => ({
                            ...current,
                            [choice.key]: value,
                          }));
                          setError(null);
                        }}
                        className="h-11 w-full rounded-md border border-[var(--line)] bg-white px-3 text-base text-[var(--ink)]"
                      >
                        <option value="">収録版を選んでください</option>
                        {choice.candidates.map((card) => (
                          <option key={card.id} value={card.id}>
                            {card.release}・{card.id}・{card.rarity}
                          </option>
                        ))}
                      </select>
                      {selected && (
                        <div className="flex items-center gap-3">
                          <img
                            src={selected.imageUrl}
                            alt={`${selected.name} ${selected.release} ${selected.id}`}
                            className="h-16 w-12 rounded object-cover"
                          />
                          <p className="text-sm text-[var(--muted)]">
                            {selected.name}
                            <br />
                            {selected.release}・{selected.id}・{selected.rarity}
                          </p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

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
            disabled={
              source.trim().length === 0 ||
              textLength > MAX_TEXT_LENGTH ||
              hasUnselectedChoice
            }
            onClick={inspectText}
          >
            内容を確認する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
