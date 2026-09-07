'use client';

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { customCards } from '@/app/custom-cards';
import { ijindenCards } from '@/app/ijinden-cards';
import { regulations } from '@/data/regulations';
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
import { applyCardCatalogCorrections } from '@/lib/card-catalog-corrections';
import { applyEffectProcessTags } from '@/lib/card-effect-processes';
import { mergeImportedDecks, parseDeckImport } from '@/lib/deck-import';
import {
  copyDeckAsDraft,
  countCards,
  newDeck,
  normalizedDeckName,
  applyCardRuleMetadata,
} from '@/lib/deck-utils';
import { validateDeck, validateDeckForRegulation } from '@/lib/deck-validator';

type AppTab = 'cards' | 'recipe' | 'myDecks' | 'simulator' | 'help';

// Card rule text and source-data corrections are applied once while building
// the in-memory catalog. Deck data itself continues to store only IDs/counts.
const cards = [...ijindenCards, ...customCards]
  .map(applyCardCatalogCorrections)
  .map(applyCardRuleMetadata)
  .map(applyEffectProcessTags);
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
  const regulationValidations = useMemo(
    () =>
      regulations.map((regulation) =>
        validateDeckForRegulation(activeDeck, regulation, { cardsById }),
      ),
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
            regulationValidations={regulationValidations}
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
      className="mx-auto max-w-3xl break-words rounded-2xl border border-[var(--line)] bg-white/80 p-5 text-[15px] leading-7 shadow-[0_12px_30px_rgb(33_38_45/0.04)] sm:p-7 sm:text-base"
      role="tabpanel"
      aria-label="ヘルプ"
    >
      <p className="label">HELP</p>
      <h1 className="mt-1 font-display text-2xl tracking-wide">
        イジンデン デッキ帳の使い方
      </h1>
      <div className="mt-6 space-y-8">
        <p className="text-[var(--muted)]">
          「イジンデン
          デッキ帳」は、イジンデンのデッキを作って保存したり、一人回しを試したりできるツールです。
          <br />
          作ったデッキは、いま使っている端末のブラウザにそのまま保存されます。
        </p>

        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <h2 className="font-display text-lg tracking-wide">基本的な使い方</h2>
          <p className="text-[var(--muted)]">
            デッキを作るときは、だいたい次のような流れで進めるとスムーズです。
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-[var(--muted)] marker:font-medium marker:text-[var(--red)]">
            <li>「カード」タブで使いたいカードを探す</li>
            <li>メインデッキやサイドデッキに追加する</li>
            <li>「レシピ」タブで全体の枚数やルールを確認する</li>
            <li>デッキの名前を入力する</li>
            <li>「マイデッキに保存」を押す</li>
            <li>「シミュ」タブで一人回しを試す</li>
          </ol>
          <p className="text-[var(--muted)]">
            途中の状態でも保存できるので、まずは思いついたカードを入れておいて、あとからゆっくり調整してみてください。
          </p>
        </section>

        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <h2 className="font-display text-lg tracking-wide">
            カードを探してデッキに入れる
          </h2>
          <div className="space-y-2">
            <h3 className="font-medium text-[var(--ink)]">カードを探す</h3>
            <p className="text-[var(--muted)]">
              「カード」タブの検索欄から探せます。カード名だけでなく、効果のテキストや特性、カード番号などからも検索できます。
            </p>
            <p className="text-[var(--muted)]">
              もっと細かく探したいときは「条件で絞り込む」を開くと、色や種類、レベル、パワー、能力キーワードや効果の種類などを組み合わせて探せます。
            </p>
            <p className="rounded-lg bg-[var(--soft)] px-3 py-2 text-xs leading-6 text-[var(--muted)]">
              ※ 探し直したいときは「リセット」を押すと元の状態に戻ります。
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium text-[var(--ink)]">デッキに追加する</h3>
            <p className="text-[var(--muted)]">
              一覧からカードを選んで、メインやサイドに追加します。
              <br />
              いま何枚入っているかは、一覧やレシピ画面ですぐに確認できます。
            </p>
          </div>
        </section>

        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <h2 className="font-display text-lg tracking-wide">
            レシピの確認と調整
          </h2>
          <p className="text-[var(--muted)]">
            「レシピ」タブでは、いま作っているデッキ全体を確認できます。
          </p>
          <ul className="list-disc space-y-2 pl-5 text-[var(--muted)] marker:text-[var(--red)]">
            <li>
              <strong className="font-medium text-[var(--ink)]">
                画面上の表示：
              </strong>
              メインやサイドの枚数、カードの種類ごとの枚数がひと目で分かります。
            </li>
            <li>
              <strong className="font-medium text-[var(--ink)]">
                枚数の変更：
              </strong>
              カードをタップするとボタンが出て、枚数を増やしたり減らしたり、メインとサイドを入れ替えたりできます。カード以外の場所をタップするとボタンが隠れるので、邪魔になりません。
            </li>
            <li>
              <strong className="font-medium text-[var(--ink)]">
                最初からやり直す：
              </strong>
              デッキを白紙に戻したいときは「レシピをクリア」を使ってください。
            </li>
          </ul>
        </section>

        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <h2 className="font-display text-lg tracking-wide">
            デッキのルールチェック
          </h2>
          <p className="text-[var(--muted)]">
            レシピ画面では、基本的なルールに合っているかを自動で確認してくれます。
          </p>
          <ul className="list-disc space-y-1 pl-5 text-[var(--muted)] marker:text-[var(--red)]">
            <li>メインデッキが40枚以上あるか</li>
            <li>サイドデッキが10枚以下か</li>
            <li>合計で60枚以下か</li>
            <li>同名カードの枚数制限を超えていないか</li>
            <li>各レギュレーションの封印・枚数制限に違反していないか</li>
          </ul>
          <p className="text-[var(--muted)]">
            結果に合わせて「使用可能」「作成途中」「ルール違反」と表示されます。
          </p>
          <p className="text-[var(--muted)]">
            作成途中やルール違反のままでも保存はできるので、思いついたアイデアのメモとして残しておくこともできます。
          </p>
          <p className="rounded-lg bg-[var(--soft)] px-3 py-2 text-xs leading-6 text-[var(--muted)]">
            ※
            大会やイベントに出る際は、そのイベントの最新ルールもあわせて確認してください。
          </p>
        </section>

        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <h2 className="font-display text-lg tracking-wide">
            マイデッキの保存と管理
          </h2>
          <div className="space-y-2">
            <h3 className="font-medium text-[var(--ink)]">保存する</h3>
            <p className="text-[var(--muted)]">
              レシピ画面の「マイデッキに保存」から保存できます。
            </p>
            <p className="text-[var(--muted)]">
              すでに同じ名前のデッキがあると上書き防止のため保存できないので、分かりやすい別の名前をつけてあげてください。
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium text-[var(--ink)]">一覧で整理する</h3>
            <p className="text-[var(--muted)]">
              「マイデッキ」タブに保存したデッキが並びます。
            </p>
            <ul className="list-disc space-y-1 pl-5 text-[var(--muted)] marker:text-[var(--red)]">
              <li>デッキ名だけでなく、中に入っているカード名でも探せます。</li>
              <li>
                「使用可能」や「作成途中」などの状態で絞り込んだり、並び順を変えたりできます。
              </li>
              <li>
                好きな色ラベルをつけられるので、デッキの色や種類ごとに分けておくと整理しやすいです。
              </li>
            </ul>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium text-[var(--ink)]">
              保存したデッキを手直しする
            </h3>
            <p className="text-[var(--muted)]">
              マイデッキからデッキを選ぶと、レシピに読み込まれます。
            </p>
            <p className="text-[var(--muted)]">
              作業用として読み込まれるため、カードを入れ替えてもマイデッキにある元のデータが勝手に書き換わることはありません。
            </p>
            <p className="text-[var(--muted)]">
              元のデータを残したまま別バージョンを作りたいときは、違う名前をつけて新しく保存してください。
            </p>
          </div>
        </section>

        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <h2 className="font-display text-lg tracking-wide">
            一人回し（シミュレーター）
          </h2>
          <p className="text-[var(--muted)]">
            「シミュ」タブを開くと、作ったデッキで一人回しのテストができます。
          </p>
          <p className="text-[var(--muted)]">
            スタートすると自動でシャッフルされて、初期手札6枚とガーディアン4枚がセットされます。
          </p>
          <p className="text-[var(--muted)]">
            引き直し（マリガン）やドローを試しながら、デッキの動きを確かめてみてください。
          </p>
          <p className="text-[var(--muted)]">
            用途に合わせて2つの表示方法を選べます。
          </p>
          <ul className="list-disc space-y-2 pl-5 text-[var(--muted)] marker:text-[var(--red)]">
            <li>
              <strong className="font-medium text-[var(--ink)]">
                盤面表示：
              </strong>
              実際の対戦スペースに近い画面です。手札・戦場・マリョク・墓地・ガーディアンの間でカードを動かしたり、カードをグレーにしたり、イジンに装備をつけたりといった操作ができます。各エリアは折りたたむこともできます。
            </li>
            <li>
              <strong className="font-medium text-[var(--ink)]">
                簡易表示：
              </strong>
              スマートフォンなどで手軽にドローや手札の動きを確かめたいとき向けの、シンプルな画面です。
            </li>
          </ul>
          <p className="rounded-lg bg-[var(--soft)] px-3 py-2 text-xs leading-6 text-[var(--muted)]">
            ※
            シミュレーターは一人回しをしやすくするための補助ツールです。効果の自動処理やコストの支払い、勝敗の判定などは行いませんので、実際のルールに合わせて手動で操作してください。
          </p>
        </section>

        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <h2 className="font-display text-lg tracking-wide">
            データのバックアップについて
          </h2>
          <p className="text-[var(--muted)]">
            デッキデータは、いま使っている端末のブラウザ内に保存されています。
          </p>
          <p className="text-[var(--muted)]">
            会員登録をしてサーバーに保存する仕組みではないため、ブラウザのサイトデータを削除したり、端末やブラウザを変えたりすると、デッキが消えたり引き継がれなかったりします。
          </p>
          <p className="text-[var(--muted)]">
            消えてしまうのを防ぐために、定期的にバックアップを取っておくのがおすすめです。
          </p>
          <div className="space-y-2">
            <h3 className="font-medium text-[var(--ink)]">
              バックアップを取る（エクスポート）
            </h3>
            <p className="text-[var(--muted)]">
              画面上の「エクスポート」を押すと、マイデッキのデータが入ったファイル（JSONファイル）が端末に保存されます。
            </p>
            <p className="rounded-lg bg-[var(--soft)] px-3 py-2 text-xs leading-6 text-[var(--muted)]">
              ※
              作成中でまだマイデッキに保存していないレシピは含まれないので、必ずマイデッキに保存してから行ってください。
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium text-[var(--ink)]">
              データを復元する・別の端末に移す（インポート）
            </h3>
            <p className="text-[var(--muted)]">
              画面上の「インポート」から保存しておいたファイルを選ぶと、以前のデッキを読み込めます。
            </p>
            <p className="text-[var(--muted)]">
              必要なデッキだけを選んで取り込むことも、まとめて取り込むこともできます。
            </p>
            <p className="rounded-lg bg-[var(--soft)] px-3 py-2 text-xs leading-6 text-[var(--muted)]">
              ※
              すでに同じ名前のデッキがある場合は、そのデッキが更新されます。インポート前の確認画面で「新規」または「更新」と表示されるので、内容を確認してから取り込んでください。
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium text-[var(--ink)]">
              機種変更やパソコンへ移すとき
            </h3>
            <ol className="list-decimal space-y-1 pl-5 text-[var(--muted)] marker:font-medium marker:text-[var(--red)]">
              <li>いまの端末で「エクスポート」してファイルを保存する</li>
              <li>そのファイルをメールやクラウド等で新しい端末に送る</li>
              <li>
                新しい端末でデッキ帳を開き、「インポート」でそのファイルを選ぶ
              </li>
            </ol>
            <p className="text-[var(--muted)]">
              これで、新しい端末でも同じデッキが使えるようになります。
            </p>
          </div>
        </section>

        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <h2 className="font-display text-lg tracking-wide">困ったときは</h2>
          <ul className="space-y-3 text-[var(--muted)]">
            <li>
              <strong className="font-medium text-[var(--ink)]">
                カードが見つからない
              </strong>
              <p>
                前回の検索条件が残っていることがあります。「リセット」を押してもう一度探してみてください。
              </p>
            </li>
            <li>
              <strong className="font-medium text-[var(--ink)]">
                保存したデッキが見当たらない
              </strong>
              <p>
                検索欄に文字が入っていないか、「作成途中」などの絞り込みになっていないか確認してください。
              </p>
            </li>
            <li>
              <strong className="font-medium text-[var(--ink)]">
                インポートができない
              </strong>
              <p>
                このデッキ帳からエクスポートしたJSONファイルを選んでいるか確認してください。
              </p>
            </li>
            <li>
              <strong className="font-medium text-[var(--ink)]">
                一人回しが始まらない
              </strong>
              <p>
                レシピのメインデッキに10枚以上カードが入っているか確認してください。
              </p>
            </li>
          </ul>
        </section>
      </div>
    </section>
  );
}
