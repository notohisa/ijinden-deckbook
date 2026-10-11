'use client';

/* oxlint-disable next/no-img-element -- The local photo reader returns data URLs that are displayed directly in this browser-only dialog. */

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { AppCard, Deck, Pile } from '@/app/types/deck';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { recognizeDeckPhoto, type PhotoMatch } from '@/lib/photo-import';

type Props = {
  open: boolean;
  cards: readonly AppCard[];
  onOpenChange: (open: boolean) => void;
  onImport: (deck: Deck) => void;
};

type EditableMatch = PhotoMatch & {
  pile: Pile;
  confirmed: boolean;
};

type ManualCard = {
  id: string;
  cardId: string;
  pile: Pile;
};

function createPhotoDeckName(): string {
  const timestamp = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
  return '写真から作成 ' + timestamp + ' ' + crypto.randomUUID().slice(0, 4);
}

function cardLabel(card: AppCard): string {
  return card.name + '（' + card.number + '）';
}

export function PhotoImportDialog({
  open,
  cards,
  onOpenChange,
  onImport,
}: Props) {
  const [deckName, setDeckName] = useState(createPhotoDeckName);
  const [fileName, setFileName] = useState('');
  const [matches, setMatches] = useState<EditableMatch[]>([]);
  const [showAllMatches, setShowAllMatches] = useState(true);
  const [manualCards, setManualCards] = useState<ManualCard[]>([]);
  const [manualQuery, setManualQuery] = useState('');
  const [manualPile, setManualPile] = useState<Pile>('main');
  const [searchByMatch, setSearchByMatch] = useState<Record<string, string>>(
    {},
  );
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [referenceCount, setReferenceCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const cardsById = useMemo(
    () => new Map(cards.map((card) => [card.id, card])),
    [cards],
  );

  const includedMatchCount = matches.filter(
    (match) =>
      match.selectedCardId !== null &&
      (match.confidence === 'high' || match.confirmed),
  ).length;
  const includedCount = includedMatchCount + manualCards.length;
  const unresolvedMatchCount = matches.filter(
    (match) =>
      !match.selectedCardId ||
      (match.confidence === 'review' && !match.confirmed),
  ).length;
  const reviewMatchCount = matches.filter(
    (match) => match.confidence === 'review' || !match.selectedCardId,
  ).length;
  const visibleMatches = matches
    .map((match, index) => ({ match, index }))
    .filter(
      ({ match }) =>
        showAllMatches ||
        match.confidence === 'review' ||
        !match.selectedCardId,
    );

  useEffect(
    () => () => {
      requestIdRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
    },
    [],
  );

  function stopCurrentRead() {
    requestIdRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setIsProcessing(false);
  }

  async function readPhoto(file: File) {
    stopCurrentRead();
    const requestId = requestIdRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setFileName(file.name);
    setMatches([]);
    setManualCards([]);
    setManualQuery('');
    setSearchByMatch({});
    setImageUrl(null);
    setWarnings([]);
    setReferenceCount(0);
    setError(null);

    if (!file.type.startsWith('image/')) {
      setError('画像ファイルを選んでください。');
      setProgress('');
      return;
    }

    setIsProcessing(true);
    setProgress('写真を読み込んでいます…');
    try {
      const result = await recognizeDeckPhoto(file, {
        signal: controller.signal,
        onProgress: (message) => {
          if (
            requestIdRef.current === requestId &&
            !controller.signal.aborted
          ) {
            setProgress(message);
          }
        },
      });
      if (requestIdRef.current !== requestId || controller.signal.aborted)
        return;
      setImageUrl(result.imageUrl);
      setMatches(
        result.matches.map((match) => ({
          ...match,
          selectedCardId:
            match.selectedCardId && cardsById.has(match.selectedCardId)
              ? match.selectedCardId
              : null,
          pile: 'main',
          confirmed: match.confidence === 'high',
        })),
      );
      setShowAllMatches(
        !result.matches.some(
          (match) => match.confidence === 'review' || !match.selectedCardId,
        ),
      );
      setReferenceCount(result.referenceCount);
      setWarnings(result.warnings);
      setProgress('読み取りが終わりました。候補を確認してください。');
    } catch (readError) {
      if (requestIdRef.current !== requestId || controller.signal.aborted)
        return;
      setError(
        readError instanceof Error
          ? readError.message
          : '写真を読み取れませんでした。別の写真を選んでください。',
      );
      setProgress('');
    } finally {
      if (requestIdRef.current === requestId) {
        setIsProcessing(false);
        controllerRef.current = null;
      }
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void readPhoto(file);
  }

  function updateMatch(id: string, update: Partial<EditableMatch>) {
    setMatches((previous) =>
      previous.map((match) =>
        match.id === id ? { ...match, ...update } : match,
      ),
    );
  }

  function addManualCard(cardId: string) {
    setManualCards((previous) => [
      ...previous,
      { id: crypto.randomUUID(), cardId, pile: manualPile },
    ]);
    setManualQuery('');
  }

  function createDeck() {
    const main: Record<string, number> = {};
    const side: Record<string, number> = {};
    for (const match of matches) {
      if (
        !match.selectedCardId ||
        (match.confidence === 'review' && !match.confirmed)
      )
        continue;
      const pile = match.pile === 'main' ? main : side;
      pile[match.selectedCardId] = (pile[match.selectedCardId] ?? 0) + 1;
    }
    for (const entry of manualCards) {
      const pile = entry.pile === 'main' ? main : side;
      pile[entry.cardId] = (pile[entry.cardId] ?? 0) + 1;
    }
    onImport({
      id: crypto.randomUUID(),
      name: deckName.trim() || createPhotoDeckName(),
      main,
      side,
      updatedAt: new Date().toISOString(),
      isSaved: false,
    });
    onOpenChange(false);
  }

  const manualResults = manualQuery.trim()
    ? cards
        .filter((card) =>
          (card.name + ' ' + card.number)
            .toLocaleLowerCase('ja')
            .includes(manualQuery.trim().toLocaleLowerCase('ja')),
        )
        .slice(0, 6)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto bg-[#f8f5ee] sm:max-w-3xl">
        <DialogHeader className="pr-8">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="font-display text-xl">
              写真から取り込み
            </DialogTitle>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950">
              試験版
            </span>
          </div>
          <DialogDescription>
            写真をこのブラウザ内で読み取り、候補を確認してから新しいデッキとして取り込みます。
            写真は外部へ送信せず、保存もしません。
            実物のカードを1枚ずつ広げた写真用です。レシピ画像に書かれた枚数は読み取りません。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--line)] bg-white p-3 text-sm leading-6 text-[var(--muted)] sm:p-4">
            <p className="font-medium text-[var(--ink)]">撮影のコツ</p>
            <p>
              カードを重ねず、明るい場所で、カード全体が入るように撮影してください。
              反射や影を避けると読み取りやすくなります。
            </p>
            <p>
              自動照合は公式カード576種類が対象です。オリジナルカードは下の検索から手動で追加してください。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              className="h-11"
              onClick={() => fileInputRef.current?.click()}
            >
              {fileName ? '別の写真を選ぶ' : '写真を選ぶ'}
            </Button>
            {fileName && (
              <span className="min-w-0 break-all text-sm text-[var(--muted)]">
                {fileName}
              </span>
            )}
          </div>

          {isProcessing && (
            <output
              className="block rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950"
              aria-live="polite"
            >
              <div className="mb-2 h-2 overflow-hidden rounded-full bg-blue-100">
                <div className="h-full w-2/3 animate-pulse rounded-full bg-blue-500" />
              </div>
              {progress || '写真を読み取っています…'}
            </output>
          )}
          {error && (
            <p
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-900"
              role="alert"
            >
              {error}
            </p>
          )}
          {!isProcessing && !error && progress && (
            <output
              className="block rounded-lg bg-[var(--soft)] p-3 text-sm text-[var(--muted)]"
              aria-live="polite"
            >
              {progress}
            </output>
          )}

          {imageUrl && (
            <div className="grid gap-3 rounded-xl border border-[var(--line)] bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <img
                src={imageUrl}
                alt="読み取りに使った写真"
                className="max-h-52 w-full rounded-lg bg-slate-100 object-contain"
              />
              <div className="text-sm leading-6 text-[var(--muted)]">
                <p className="font-medium text-[var(--ink)]">
                  {matches.length}枚を検出
                </p>
                <p>照合対象 {referenceCount}種類（公式カード）</p>
                <p>
                  取り込み対象 {includedCount}枚 / 検出 {matches.length}枚
                </p>
                <p>未解決 {unresolvedMatchCount}枠</p>
              </div>
            </div>
          )}

          {warnings.length > 0 && (
            <ul className="list-disc rounded-lg border border-amber-200 bg-amber-50 p-3 pl-8 text-sm leading-6 text-amber-950">
              {warnings.map((warning, index) => (
                <li key={String(index)}>{warning}</li>
              ))}
            </ul>
          )}

          {matches.length > 0 && (
            <section aria-label="検出したカード" className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="font-medium text-[var(--ink)]">
                    検出したカード
                  </h2>
                  <p className="text-xs leading-5 text-[var(--muted)]">
                    1つの枠が写真中のカード1枚です。要確認の候補は確認するまで取り込まれません。
                  </p>
                  {unresolvedMatchCount > 0 && (
                    <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs leading-5 text-amber-950">
                      未解決の検出枠が{unresolvedMatchCount}
                      件あります。候補を選んで確認するか、不要な枠を削除してください。
                    </p>
                  )}
                </div>
                <p className="text-xs tabular-nums text-[var(--muted)]">
                  {includedMatchCount} / {matches.length}枚を取り込み
                </p>
              </div>
              <fieldset className="flex flex-wrap gap-2">
                <legend className="sr-only">表示する検出カード</legend>
                <button
                  type="button"
                  aria-pressed={!showAllMatches}
                  onClick={() => setShowAllMatches(false)}
                  className={
                    'min-h-10 rounded-lg border px-3 text-sm ' +
                    (!showAllMatches
                      ? 'border-[var(--ink)] bg-[var(--ink)] text-white'
                      : 'border-[var(--line)] bg-white text-[var(--ink)]')
                  }
                >
                  要確認のみ（{reviewMatchCount}）
                </button>
                <button
                  type="button"
                  aria-pressed={showAllMatches}
                  onClick={() => setShowAllMatches(true)}
                  className={
                    'min-h-10 rounded-lg border px-3 text-sm ' +
                    (showAllMatches
                      ? 'border-[var(--ink)] bg-[var(--ink)] text-white'
                      : 'border-[var(--line)] bg-white text-[var(--ink)]')
                  }
                >
                  すべて（{matches.length}）
                </button>
              </fieldset>
              <ul className="space-y-2">
                {visibleMatches.map(({ match, index }) => {
                  const selectedCard = match.selectedCardId
                    ? (cardsById.get(match.selectedCardId) ?? null)
                    : null;
                  const candidateCards = match.candidates
                    .map((candidate) => cardsById.get(candidate.cardId))
                    .filter((card): card is AppCard => Boolean(card));
                  if (
                    selectedCard &&
                    !candidateCards.some((card) => card.id === selectedCard.id)
                  ) {
                    candidateCards.unshift(selectedCard);
                  }
                  const query = searchByMatch[match.id] ?? '';
                  const matchingCards = query.trim()
                    ? cards
                        .filter((card) =>
                          (card.name + ' ' + card.number)
                            .toLocaleLowerCase('ja')
                            .includes(query.trim().toLocaleLowerCase('ja')),
                        )
                        .slice(0, 5)
                    : [];
                  const isIncluded =
                    Boolean(selectedCard) &&
                    (match.confidence === 'high' || match.confirmed);

                  return (
                    <li
                      key={match.id}
                      className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 rounded-xl border border-[var(--line)] bg-white p-2.5 sm:grid-cols-[5rem_minmax(0,1fr)] sm:p-3"
                    >
                      <div className="space-y-1">
                        <img
                          src={match.cropUrl}
                          alt={'検出 ' + String(index + 1) + ' の切り抜き'}
                          className="aspect-[2/3] w-full rounded-md bg-slate-100 object-contain"
                        />
                        <span className="block text-center text-xs tabular-nums text-[var(--muted)]">
                          {index + 1} / {matches.length}
                        </span>
                      </div>
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={
                              'rounded-full px-2 py-0.5 text-xs font-medium ' +
                              (!match.selectedCardId ||
                              match.confidence === 'review'
                                ? 'bg-amber-100 text-amber-950'
                                : 'bg-emerald-100 text-emerald-900')
                            }
                          >
                            {!match.selectedCardId
                              ? '候補を選択'
                              : match.confidence === 'review'
                                ? '要確認候補'
                                : '認識候補'}
                          </span>
                          <span
                            className={
                              'text-xs ' +
                              (isIncluded
                                ? 'text-emerald-800'
                                : 'text-[var(--muted)]')
                            }
                          >
                            {isIncluded ? '取り込み対象' : '取り込み対象外'}
                          </span>
                          <button
                            type="button"
                            className="ml-auto min-h-9 rounded-md px-2 text-sm text-red-700 underline decoration-red-300 underline-offset-2 hover:bg-red-50"
                            onClick={() =>
                              setMatches((previous) =>
                                previous.filter((item) => item.id !== match.id),
                              )
                            }
                            aria-label={'検出 ' + String(index + 1) + ' を削除'}
                          >
                            削除
                          </button>
                        </div>

                        <p className="break-words text-sm font-medium text-[var(--ink)]">
                          {selectedCard
                            ? cardLabel(selectedCard)
                            : 'カード未選択'}
                        </p>

                        {candidateCards.length > 0 && (
                          <label className="block text-xs text-[var(--muted)]">
                            認識候補
                            <select
                              value={match.selectedCardId ?? ''}
                              onChange={(event) =>
                                updateMatch(match.id, {
                                  selectedCardId: event.target.value || null,
                                  confirmed: Boolean(event.target.value),
                                })
                              }
                              className="mt-1 h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)]"
                            >
                              <option value="">候補を選んでください</option>
                              {candidateCards.map((card) => (
                                <option key={card.id} value={card.id}>
                                  {cardLabel(card)}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}

                        <label className="block text-xs text-[var(--muted)]">
                          カードを検索して変更
                          <input
                            type="search"
                            value={query}
                            onChange={(event) =>
                              setSearchByMatch((previous) => ({
                                ...previous,
                                [match.id]: event.target.value,
                              }))
                            }
                            placeholder="カード名・番号"
                            className="mt-1 h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)] placeholder:text-slate-400"
                          />
                        </label>
                        {query.trim() && (
                          <div className="grid gap-1 sm:grid-cols-2">
                            {matchingCards.map((card) => (
                              <button
                                key={card.id}
                                type="button"
                                className="min-h-10 rounded-lg border border-[var(--line)] bg-white px-2 text-left text-xs leading-5 text-[var(--ink)] hover:bg-[var(--soft)]"
                                onClick={() => {
                                  updateMatch(match.id, {
                                    selectedCardId: card.id,
                                    confirmed: true,
                                  });
                                  setSearchByMatch((previous) => ({
                                    ...previous,
                                    [match.id]: '',
                                  }));
                                }}
                              >
                                {cardLabel(card)}
                              </button>
                            ))}
                            {matchingCards.length === 0 && (
                              <p className="text-xs text-[var(--muted)]">
                                該当するカードがありません。
                              </p>
                            )}
                          </div>
                        )}

                        {match.confidence === 'review' && (
                          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-amber-50 px-2 text-sm text-amber-950">
                            <input
                              type="checkbox"
                              checked={match.confirmed}
                              disabled={!selectedCard}
                              onChange={(event) =>
                                updateMatch(match.id, {
                                  confirmed: event.target.checked,
                                })
                              }
                              className="size-5 accent-amber-700"
                            />
                            この候補を確認して取り込む
                          </label>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-[var(--muted)]">
                            入れる場所
                          </span>
                          <button
                            type="button"
                            aria-pressed={match.pile === 'main'}
                            onClick={() =>
                              updateMatch(match.id, { pile: 'main' })
                            }
                            className={
                              'min-h-10 rounded-lg border px-3 text-sm ' +
                              (match.pile === 'main'
                                ? 'border-[var(--ink)] bg-[var(--ink)] text-white'
                                : 'border-[var(--line)] bg-white text-[var(--ink)]')
                            }
                          >
                            メイン
                          </button>
                          <button
                            type="button"
                            aria-pressed={match.pile === 'side'}
                            onClick={() =>
                              updateMatch(match.id, { pile: 'side' })
                            }
                            className={
                              'min-h-10 rounded-lg border px-3 text-sm ' +
                              (match.pile === 'side'
                                ? 'border-[var(--ink)] bg-[var(--ink)] text-white'
                                : 'border-[var(--line)] bg-white text-[var(--ink)]')
                            }
                          >
                            サイド
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {imageUrl && (
            <section className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-3 sm:p-4">
              <div>
                <h2 className="font-medium text-[var(--ink)]">
                  読み取れなかったカードを追加
                </h2>
                <p className="text-xs leading-5 text-[var(--muted)]">
                  検索結果をタップすると1枚追加されます。同じカードを複数枚入れるときは繰り返してください。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={manualPile === 'main'}
                  onClick={() => setManualPile('main')}
                  className={
                    'min-h-10 rounded-lg border px-3 text-sm ' +
                    (manualPile === 'main'
                      ? 'border-[var(--ink)] bg-[var(--ink)] text-white'
                      : 'border-[var(--line)] bg-white text-[var(--ink)]')
                  }
                >
                  メインに追加
                </button>
                <button
                  type="button"
                  aria-pressed={manualPile === 'side'}
                  onClick={() => setManualPile('side')}
                  className={
                    'min-h-10 rounded-lg border px-3 text-sm ' +
                    (manualPile === 'side'
                      ? 'border-[var(--ink)] bg-[var(--ink)] text-white'
                      : 'border-[var(--line)] bg-white text-[var(--ink)]')
                  }
                >
                  サイドに追加
                </button>
              </div>
              <input
                type="search"
                value={manualQuery}
                onChange={(event) => setManualQuery(event.target.value)}
                placeholder="カード名・番号で検索"
                className="h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)] placeholder:text-slate-400"
              />
              {manualQuery.trim() && (
                <div className="grid gap-1 sm:grid-cols-2">
                  {manualResults.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      className="min-h-11 rounded-lg border border-[var(--line)] px-3 text-left text-sm text-[var(--ink)] hover:bg-[var(--soft)]"
                      onClick={() => addManualCard(card.id)}
                    >
                      ＋ {cardLabel(card)}
                    </button>
                  ))}
                  {manualResults.length === 0 && (
                    <p className="text-sm text-[var(--muted)]">
                      該当するカードがありません。
                    </p>
                  )}
                </div>
              )}
              {manualCards.length > 0 && (
                <ul className="space-y-1" aria-label="手動で追加したカード">
                  {manualCards.map((entry, index) => {
                    const card = cardsById.get(entry.cardId);
                    if (!card) return null;
                    return (
                      <li
                        key={entry.id}
                        className="flex min-h-10 items-center gap-2 rounded-lg bg-[var(--soft)] px-2 text-sm"
                      >
                        <span className="min-w-0 flex-1 break-words">
                          {cardLabel(card)}
                        </span>
                        <select
                          aria-label={
                            '手動追加 ' + String(index + 1) + ' の場所'
                          }
                          value={entry.pile}
                          onChange={(event) =>
                            setManualCards((previous) =>
                              previous.map((item) =>
                                item.id === entry.id
                                  ? {
                                      ...item,
                                      pile: event.target.value as Pile,
                                    }
                                  : item,
                              ),
                            )
                          }
                          className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-xs"
                        >
                          <option value="main">メイン</option>
                          <option value="side">サイド</option>
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            setManualCards((previous) =>
                              previous.filter((item) => item.id !== entry.id),
                            )
                          }
                          aria-label={card.name + ' の手動追加を削除'}
                          className="grid size-9 shrink-0 place-items-center rounded-md text-lg text-red-700 hover:bg-red-50"
                        >
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {imageUrl && (
            <label className="block text-sm text-[var(--muted)]">
              作成するデッキ名
              <input
                type="text"
                value={deckName}
                onChange={(event) => setDeckName(event.target.value)}
                maxLength={100}
                className="mt-1 h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-[var(--ink)]"
              />
            </label>
          )}
        </div>

        <DialogFooter className="sticky bottom-0 bg-[#f1ede4]">
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
              isProcessing ||
              !imageUrl ||
              includedCount === 0 ||
              unresolvedMatchCount > 0
            }
            onClick={createDeck}
          >
            確認画面へ進む（{includedCount}枚）
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
