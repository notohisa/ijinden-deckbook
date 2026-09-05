'use client';

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { customCards } from '@/app/custom-cards';
import { ijindenCards } from '@/app/ijinden-cards';
import type {
  ArchiveData,
  Deck,
  DeckColor,
  DeckImportParseResult,
  LegacyArchiveData,
  MyDeckExport,
  Pile,
} from '@/app/types/deck';
import { CardCatalog } from '@/components/card-catalog';
import { CardDetailDialog } from '@/components/card-detail-dialog';
import { DeckRecipe } from '@/components/deck-recipe';
import { DeckSimulator } from '@/components/deck-simulator';
import { ImportDeckDialog } from '@/components/import-deck-dialog';
import { MyDecks } from '@/components/my-decks';
import { Button } from '@/components/ui/button';
import { mergeImportedDecks, parseDeckImport } from '@/lib/deck-import';
import {
  copyDeckAsDraft,
  countCards,
  newDeck,
  normalizedDeckName,
} from '@/lib/deck-utils';
import { validateDeck } from '@/lib/deck-validator';

type AppTab = 'cards' | 'recipe' | 'myDecks' | 'simulator' | 'help';

const cards = [...ijindenCards, ...customCards];
const cardsById = new Map(cards.map((card) => [card.id, card]));
const cardIds = new Set(cardsById.keys());
const cardOrder = new Map(cards.map((card, index) => [card.id, index]));
const initialDeck: Deck = {
  id: 'new-deck',
  name: '新しいデッキ',
  main: {},
  side: {},
  updatedAt: new Date().toISOString(),
  isSaved: false,
};
const localStorageKey = 'ijinden-deckbook-v1';

function isPile(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(
    (count) =>
      typeof count === 'number' && Number.isSafeInteger(count) && count > 0,
  );
}

function isStoredDeck(value: unknown): value is Deck {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const deck = value as Partial<Deck>;
  return (
    typeof deck.id === 'string' &&
    typeof deck.name === 'string' &&
    typeof deck.updatedAt === 'string' &&
    isPile(deck.main) &&
    isPile(deck.side)
  );
}

function cloneStoredDeck(deck: Deck, isSaved = deck.isSaved): Deck {
  const color =
    deck.color === 'default' || deck.color === 'orange' || deck.color === 'gray'
      ? deck.color
      : undefined;
  return {
    ...deck,
    main: { ...deck.main },
    side: { ...deck.side },
    isSaved,
    ...(color ? { color } : {}),
  };
}

export default function Home() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [activeDeck, setActiveDeck] = useState<Deck>(initialDeck);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('cards');
  const [localDataReady, setLocalDataReady] = useState(false);
  const [notice, setNotice] = useState(
    'カードを追加して、あなたの最初のデッキを作りましょう。',
  );
  const [toast, setToast] = useState<string | null>(null);
  const [pendingImport, setPendingImport] =
    useState<DeckImportParseResult | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const validation = useMemo(
    () => validateDeck(activeDeck, { cardsById }),
    [activeDeck],
  );
  const selectedCard = selectedCardId
    ? (cardsById.get(selectedCardId) ?? null)
    : null;
  const archive = useMemo<ArchiveData>(
    () => ({
      version: 2,
      updatedAt: new Date().toISOString(),
      decks,
      draft: activeDeck,
    }),
    [activeDeck, decks],
  );

  function showNotice(message: string) {
    setNotice(message);
    setToast(message);
    if (noticeTimerRef.current !== null)
      window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      setToast(null);
      noticeTimerRef.current = null;
    }, 4500);
  }

  useEffect(
    () => () => {
      if (noticeTimerRef.current !== null)
        window.clearTimeout(noticeTimerRef.current);
    },
    [],
  );

  /* oxlint-disable react/react-compiler -- Browser localStorage is an external persistence system; hydration and failed-write notices intentionally update state from this synchronization. */
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(localStorageKey);
      if (!saved) return;
      const savedArchive = JSON.parse(saved) as
        | Partial<ArchiveData>
        | Partial<LegacyArchiveData>;
      if (
        savedArchive.version === 2 &&
        Array.isArray(savedArchive.decks) &&
        isStoredDeck(savedArchive.draft)
      ) {
        setDecks(
          savedArchive.decks
            .filter(isStoredDeck)
            .map((deck) => cloneStoredDeck(deck, true)),
        );
        setActiveDeck(cloneStoredDeck(savedArchive.draft, false));
        showNotice('保存済みデッキと作業中のレシピを読み込みました。');
      } else if (
        savedArchive.version === 1 &&
        Array.isArray(savedArchive.decks)
      ) {
        const legacyDecks = savedArchive.decks.filter(isStoredDeck);
        const legacyDraft = legacyDecks.find((deck) => !deck.isSaved);
        setDecks(
          legacyDecks
            .filter((deck) => deck.isSaved)
            .map((deck) => cloneStoredDeck(deck, true)),
        );
        if (legacyDraft) setActiveDeck(copyDeckAsDraft(legacyDraft));
        showNotice('保存済みデッキを読み込みました。');
      }
    } catch {
      showNotice('この端末の保存データを読み込めませんでした。');
    } finally {
      setLocalDataReady(true);
    }
  }, []);

  useEffect(() => {
    if (!localDataReady) return;
    try {
      window.localStorage.setItem(localStorageKey, JSON.stringify(archive));
    } catch {
      showNotice(
        'この端末に保存できませんでした。マイデッキをエクスポートしてください。',
      );
    }
  }, [archive, localDataReady]);
  /* oxlint-enable react/react-compiler */

  function updateActiveDeck(updater: (deck: Deck) => Deck) {
    setActiveDeck((previous) => ({
      ...updater(previous),
      updatedAt: new Date().toISOString(),
      isSaved: false,
    }));
  }

  function adjustCard(cardId: string, pile: Pile, difference: number) {
    updateActiveDeck((deck) => {
      const currentPile = { ...deck[pile] };
      const next = Math.max(0, (currentPile[cardId] ?? 0) + difference);
      if (next === 0) delete currentPile[cardId];
      else currentPile[cardId] = next;
      return { ...deck, [pile]: currentPile };
    });
  }

  function moveCard(cardId: string, fromPile: Pile) {
    updateActiveDeck((deck) => {
      const currentCount = deck[fromPile][cardId] ?? 0;
      if (currentCount < 1) return deck;
      const toPile: Pile = fromPile === 'main' ? 'side' : 'main';
      const source = { ...deck[fromPile] };
      const destination = { ...deck[toPile] };
      if (currentCount === 1) delete source[cardId];
      else source[cardId] = currentCount - 1;
      destination[cardId] = (destination[cardId] ?? 0) + 1;
      return { ...deck, [fromPile]: source, [toPile]: destination };
    });
  }

  function saveActiveDeck() {
    if (countCards(activeDeck.main) + countCards(activeDeck.side) === 0) {
      showNotice(
        '空のデッキはマイデッキに保存できません。カードを追加してから保存してください。',
      );
      return;
    }
    const name = normalizedDeckName(activeDeck.name);
    if (decks.some((deck) => normalizedDeckName(deck.name) === name)) {
      showNotice(
        '同名のデッキはマイデッキに保存できません。デッキ名を変更してください。',
      );
      return;
    }
    const savedDeck: Deck = {
      ...activeDeck,
      id: crypto.randomUUID(),
      name,
      main: { ...activeDeck.main },
      side: { ...activeDeck.side },
      updatedAt: new Date().toISOString(),
      isSaved: true,
    };
    setDecks((previous) => [savedDeck, ...previous]);
    showNotice(
      '「' +
        (activeDeck.name || '名前のないデッキ') +
        '」をマイデッキに保存しました。',
    );
  }

  function renameSavedDeck(deckId: string, inputName: string): boolean {
    const name = normalizedDeckName(inputName);
    if (
      decks.some(
        (deck) => deck.id !== deckId && normalizedDeckName(deck.name) === name,
      )
    ) {
      showNotice(
        '同名のデッキには変更できません。別のデッキ名を入力してください。',
      );
      return false;
    }
    setDecks((previous) =>
      previous.map((deck) =>
        deck.id === deckId
          ? { ...deck, name, updatedAt: new Date().toISOString() }
          : deck,
      ),
    );
    showNotice('デッキ名を変更しました。');
    return true;
  }

  function setDeckColor(deckId: string, color: DeckColor) {
    setDecks((previous) =>
      previous.map((deck) =>
        deck.id === deckId
          ? { ...deck, color, updatedAt: new Date().toISOString() }
          : deck,
      ),
    );
    showNotice('マイデッキの色を変更しました。');
  }

  function deleteSavedDeck(deckId: string) {
    setDecks((previous) => previous.filter((deck) => deck.id !== deckId));
    showNotice('マイデッキから削除しました。');
  }

  function clearActiveDeck() {
    updateActiveDeck((deck) => ({ ...deck, name: '', main: {}, side: {} }));
    showNotice('編集中のレシピとデッキ名をクリアしました。');
  }

  function createDeck() {
    setActiveDeck(newDeck(decks.length + 1));
    setActiveTab('recipe');
    showNotice('空のデッキを作成しました。');
  }

  function openSavedDeck(deck: Deck) {
    setActiveDeck(copyDeckAsDraft(deck));
    setActiveTab('recipe');
    showNotice(
      'マイデッキを作業用レシピに読み込みました。変更は保存済みデッキへ反映されません。',
    );
  }

  function exportMyDecks() {
    const exported: MyDeckExport = {
      version: 1,
      type: 'ijinden-deckbook-my-decks',
      exportedAt: new Date().toISOString(),
      decks: decks.map((deck) => ({
        ...deck,
        main: { ...deck.main },
        side: { ...deck.side },
        isSaved: true,
      })),
    };
    const blob = new Blob([JSON.stringify(exported, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download =
      'deckbook-my-decks-' + new Date().toISOString().slice(0, 10) + '.json';
    link.click();
    URL.revokeObjectURL(url);
    showNotice(
      'マイデッキ' + String(decks.length) + '件をエクスポートしました。',
    );
  }

  async function inspectImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const result = parseDeckImport(
        JSON.parse(await file.text()) as unknown,
        cardIds,
      );
      if (result.decks.length === 0) {
        showNotice(
          'インポートできるデッキがありません。' +
            String(result.invalidDecks.length) +
            '件の内容を確認してください。',
        );
        return;
      }
      setPendingImport(result);
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : '読み込めませんでした。このアプリでエクスポートしたJSONファイルを選んでください。',
      );
    }
  }

  function importSelectedDecks(selectedDecks: Deck[]) {
    const result = mergeImportedDecks(decks, selectedDecks);
    setDecks(result.decks);
    setPendingImport(null);
    showNotice(
      'マイデッキを読み込みました。新規 ' +
        String(result.added) +
        '件・更新 ' +
        String(result.updated) +
        '件です。',
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--paper)] text-[var(--ink)]">
      <div className="page-grain" aria-hidden="true" />
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[#f4f0e7]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between gap-2 px-3 sm:gap-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--ink)] text-lg text-[var(--paper)] shadow-[3px_3px_0_var(--red)]">
              ◆
            </div>
            <div className="min-w-0">
              <p className="font-display text-lg leading-none tracking-[0.08em]">
                デッキ帳
              </p>
              <p className="mt-1 hidden text-[10px] tracking-[0.12em] text-[var(--muted)] min-[420px]:block">
                YOUR DECK, YOUR DEVICE
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <input
              ref={importFileInputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={inspectImportFile}
            />
            <Button
              variant="outline"
              size="sm"
              className="border-[var(--line)] bg-white/70 max-[419px]:px-1.5"
              onClick={exportMyDecks}
              aria-label="マイデッキをエクスポート"
            >
              <span className="min-[420px]:hidden">↓</span>
              <span className="hidden min-[420px]:inline">↓ エクスポート</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-[var(--line)] bg-white/70 max-[419px]:px-1.5"
              onClick={() => importFileInputRef.current?.click()}
              aria-label="マイデッキをインポート"
            >
              <span className="min-[420px]:hidden">↑</span>
              <span className="hidden min-[420px]:inline">↑ インポート</span>
            </Button>
          </div>
        </div>
        <nav
          className="mx-auto max-w-[1180px] overflow-x-auto px-4 sm:px-6"
          aria-label="メインメニュー"
        >
          <div
            className="flex min-w-max gap-0.5 sm:gap-1"
            role="tablist"
            aria-label="デッキ帳のタブ"
          >
            {(
              [
                ['cards', 'カード'],
                ['recipe', 'レシピ'],
                ['myDecks', 'マイデッキ'],
                ['simulator', 'シミュ'],
                ['help', 'ヘルプ'],
              ] as Array<[AppTab, string]>
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={
                  'border-b-2 px-1 py-3 text-sm font-medium transition min-[360px]:px-2 sm:px-4 ' +
                  (activeTab === tab
                    ? 'border-[var(--red)] text-[var(--red)]'
                    : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]')
                }
              >
                {label}
              </button>
            ))}
          </div>
        </nav>
      </header>
      <div className="mx-auto max-w-[1180px] px-4 py-5 sm:px-6">
        {activeTab === 'cards' && (
          <CardCatalog
            cards={cards}
            activeDeck={activeDeck}
            onAdjustCard={adjustCard}
            onSelectCard={setSelectedCardId}
          />
        )}
        {activeTab === 'recipe' && (
          <DeckRecipe
            deck={activeDeck}
            cardsById={cardsById}
            cardOrder={cardOrder}
            validation={validation}
            notice={notice}
            onSave={saveActiveDeck}
            onClear={clearActiveDeck}
            onNameChange={(name) =>
              updateActiveDeck((deck) => ({ ...deck, name }))
            }
            onAdjustCard={adjustCard}
            onMoveCard={moveCard}
            onSelectCard={setSelectedCardId}
            onOpenCards={() => setActiveTab('cards')}
            onOpenSimulator={() => setActiveTab('simulator')}
          />
        )}
        <DeckSimulator
          active={activeTab === 'simulator'}
          recipeName={activeDeck.name}
          main={activeDeck.main}
          cardsById={cardsById}
          onEditRecipe={() => setActiveTab('recipe')}
        />
        {activeTab === 'myDecks' && (
          <MyDecks
            decks={decks}
            cardsById={cardsById}
            onCreate={createDeck}
            onOpenDeck={openSavedDeck}
            onRename={renameSavedDeck}
            onSetColor={setDeckColor}
            onDelete={deleteSavedDeck}
          />
        )}
        {activeTab === 'help' && <Help />}
      </div>
      {toast && (
        <div
          className="fixed inset-x-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-[60] mx-auto flex max-w-lg items-start gap-2 rounded-xl border border-[var(--green)] bg-white px-3 py-3 text-sm leading-5 text-[var(--ink)] shadow-lg"
          aria-live="polite"
        >
          <span className="mt-0.5 text-[var(--green)]" aria-hidden="true">
            ●
          </span>
          <p className="min-w-0 flex-1">{toast}</p>
          <button
            type="button"
            className="-mr-1 -mt-1 grid size-7 shrink-0 place-items-center rounded-md text-lg text-[var(--muted)] hover:bg-[var(--soft)]"
            onClick={() => setToast(null)}
            aria-label="通知を閉じる"
          >
            ×
          </button>
        </div>
      )}
      <CardDetailDialog
        card={selectedCard}
        onOpenChange={(open) => {
          if (!open) setSelectedCardId(null);
        }}
      />
      {pendingImport && (
        <ImportDeckDialog
          open
          importedDecks={pendingImport.decks}
          invalidDecks={pendingImport.invalidDecks}
          totalCount={pendingImport.totalCount}
          existingDecks={decks}
          cardsById={cardsById}
          onOpenChange={(open) => {
            if (!open) setPendingImport(null);
          }}
          onImport={importSelectedDecks}
        />
      )}
      <footer className="mx-auto max-w-[1480px] px-4 pb-8 pt-2 text-center text-[11px] tracking-wide text-[var(--muted)] sm:px-6">
        <span className="inline-flex items-center gap-1.5">
          ✦
          非公式のデッキ作成補助アプリです。デッキデータはこの端末に保存します。
        </span>
      </footer>
    </main>
  );
}

function Help() {
  return (
    <section
      className="mx-auto max-w-3xl rounded-2xl border border-[var(--line)] bg-white/80 p-5 text-sm leading-7 shadow-[0_12px_30px_rgb(33_38_45/0.04)] sm:p-7"
      role="tabpanel"
      aria-label="ヘルプ"
    >
      <p className="label">HELP</p>
      <h1 className="mt-1 font-display text-2xl tracking-wide">
        デッキ帳の使い方
      </h1>
      <div className="mt-6 space-y-6">
        <section>
          <h2 className="font-display text-lg">カード</h2>
          <p className="mt-1 text-[var(--muted)]">
            名前・能力文・特性・カード番号から探せます。条件に一致するカードは最初からすべて表示され、各カードのメイン／サイドの＋・−で、その場で枚数を調整できます。
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg">レシピとルールチェック</h2>
          <p className="mt-1 text-[var(--muted)]">
            メイン40枚以上、サイド10枚以下、合計60枚以下、同名カードの枚数、禁止・制限カードを確認します。作成途中やルール違反でも、途中経過としてマイデッキに保存できます。
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg">マイデッキ</h2>
          <p className="mt-1 text-[var(--muted)]">
            デッキ名と入っているカード名で検索できます。使用可能・作成途中・ルール違反で絞り込み、更新日時または名前で並べ替えられます。
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg">シミュレーション</h2>
          <p className="mt-1 text-[var(--muted)]">
            「シミュ」タブで、レシピのメインデッキを使って一人回しを試せます。10枚以上で開始でき、初期手札は6枚、ガーディアンは4枚です。効果や対戦の自動処理はありません。
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg">エクスポート・インポート</h2>
          <p className="mt-1 text-[var(--muted)]">
            この端末では保存済みマイデッキと作業中レシピを自動保存します。インポートでは内容を確認して、必要なデッキだけを選んで取り込めます。同じ名前の保存済みデッキを選ぶと、そのデッキを更新します。
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg">アクセス解析</h2>
          <p className="mt-1 text-[var(--muted)]">
            ページ閲覧数と訪問者数の把握に、Cloudflare Web
            Analyticsを使用しています。マイデッキの内容、デッキ名、カード選択や検索語は送信しません。
          </p>
          <a
            className="mt-2 inline-block text-xs text-[var(--red)] underline underline-offset-2"
            href="https://www.cloudflare.com/privacypolicy/"
            target="_blank"
            rel="noreferrer"
          >
            Cloudflareのプライバシーについて ↗
          </a>
        </section>
        <section className="rounded-xl bg-[var(--soft)] p-4 text-xs text-[var(--muted)]">
          <p className="font-medium text-[var(--ink)]">
            公式カードデータについて
          </p>
          <p className="mt-1">
            全576種の名称・能力文と画像はイジンデン公式カードリストを参照しています。画像は公式サイトから直接表示します。
          </p>
          <a
            className="mt-2 inline-block text-[var(--red)] underline underline-offset-2"
            href="https://one-draw.jp/ijinden/cardlist.html"
            target="_blank"
            rel="noreferrer"
          >
            公式カードリストを開く ↗
          </a>
        </section>
      </div>
    </section>
  );
}
