'use client';

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { customCards } from '@/app/custom-cards';
import { ijindenCards } from '@/app/ijinden-cards';
import type {
  Deck,
  DeckImportParseResult,
  MyDeckExport,
} from '@/app/types/deck';
import { CardCatalog } from '@/components/card-catalog';
import { CardDetailDialog } from '@/components/card-detail-dialog';
import { DeckRecipe } from '@/components/deck-recipe';
import { DeckSimulator } from '@/components/deck-simulator';
import { ImportDeckDialog } from '@/components/import-deck-dialog';
import { DeckImportSourceDialog } from '@/components/deck-import-source-dialog';
import { IncomingDeckShare } from '@/components/incoming-deck-share';
import { MyDecks } from '@/components/my-decks';
import { Button } from '@/components/ui/button';
import { applyCardCatalogCorrections } from '@/lib/card-catalog-corrections';
import { applyEffectProcessTags } from '@/lib/card-effect-processes';
import { parseDeckImport } from '@/lib/deck-import';
import { Help } from '@/components/help';
import { useDeckBook } from '@/hooks/use-deck-book';
import { parseDeckTextImport } from '@/lib/deck-text-import';
import { applyCardRuleMetadata } from '@/lib/deck-utils';

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
export default function Home() {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedDeckCardIds, setSelectedDeckCardIds] = useState<
    readonly string[] | null
  >(null);
  const [activeTab, setActiveTab] = useState<AppTab>('cards');
  const [notice, setNotice] = useState(
    'カードを追加して、あなたの最初のデッキを作りましょう。',
  );
  const [toast, setToast] = useState<string | null>(null);
  const [pendingImport, setPendingImport] =
    useState<DeckImportParseResult | null>(null);
  const [importSourceOpen, setImportSourceOpen] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const showNotice = useCallback((message: string) => {
    setNotice(message);
    setToast(message);
    if (noticeTimerRef.current !== null)
      window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      setToast(null);
      noticeTimerRef.current = null;
    }, 4500);
  }, []);

  function openDeckCard(cardId: string, orderedCardIds: readonly string[]) {
    setSelectedDeckCardIds(orderedCardIds);
    setSelectedCardId(cardId);
  }

  const openCatalogCard = useCallback((cardId: string) => {
    setSelectedDeckCardIds(null);
    setSelectedCardId(cardId);
  }, []);

  const openRecipeTab = useCallback(() => setActiveTab('recipe'), []);

  useEffect(
    () => () => {
      if (noticeTimerRef.current !== null)
        window.clearTimeout(noticeTimerRef.current);
    },
    [],
  );

  const book = useDeckBook(showNotice);
  const {
    decks,
    activeDeck,
    archiveLoad,
    adjustCard,
    moveCard,
    updateActiveDeck,
    renameSavedDeck,
    setDeckColor,
    deleteSavedDeck,
  } = book;

  const selectedCard = selectedCardId
    ? (cardsById.get(selectedCardId) ?? null)
    : null;

  function createDeck() {
    book.createDeck();
    setActiveTab('recipe');
    showNotice('空のデッキを作成しました。');
  }

  function openSavedDeck(deck: Deck) {
    book.openSavedDeck(deck);
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

  function downloadUnreadableArchive() {
    if (archiveLoad?.status !== 'blocked' || archiveLoad.raw === null) return;
    const blob = new Blob([archiveLoad.raw], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download =
      'deckbook-recovery-' + new Date().toISOString().slice(0, 10) + '.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
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

  async function importSelectedDecks(selectedDecks: Deck[]) {
    if (await book.importSelectedDecks(selectedDecks)) setPendingImport(null);
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
              disabled={archiveLoad?.status !== 'ready'}
            />
            <Button
              variant="outline"
              size="sm"
              className="border-[var(--line)] bg-white/70 max-[419px]:px-1.5"
              onClick={exportMyDecks}
              aria-label="マイデッキをエクスポート"
              disabled={archiveLoad?.status !== 'ready'}
            >
              <span className="min-[420px]:hidden">↓</span>
              <span className="hidden min-[420px]:inline">↓ エクスポート</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-[var(--line)] bg-white/70 max-[419px]:px-1.5"
              onClick={() => setImportSourceOpen(true)}
              aria-label="マイデッキをインポート"
              disabled={archiveLoad?.status !== 'ready'}
            >
              ↑ インポート
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
                disabled={archiveLoad?.status !== 'ready'}
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
        {archiveLoad === null && (
          <output className="block text-base text-[var(--muted)]">
            保存データを読み込んでいます。
          </output>
        )}
        {archiveLoad?.status === 'blocked' && (
          <section
            role="alert"
            aria-labelledby="storage-recovery-title"
            className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-[var(--red)] bg-white/80 p-5 text-base leading-7 sm:p-7"
          >
            <h1
              id="storage-recovery-title"
              className="font-display text-xl text-[var(--ink)]"
            >
              保存データを読み込めませんでした
            </h1>
            <p>
              元のデータを上書きしないよう、自動保存とデッキの編集を停止しています。
              保存データの削除や初期化は行っていません。
            </p>
            <p className="text-[var(--muted)]">
              {archiveLoad.reason === 'read-error'
                ? 'ブラウザの保存領域にアクセスできません。ブラウザの設定を確認してから、ページを再読み込みしてください。'
                : archiveLoad.reason === 'unsupported-version'
                  ? 'この保存形式には対応していません。元のデータをダウンロードして保管し、アプリの更新後に再度お試しください。'
                  : '保存データの形式を確認できません。元のデータをダウンロードして保管し、復旧にお使いください。'}
            </p>
            <div className="flex flex-wrap gap-3">
              {archiveLoad.raw !== null && (
                <Button
                  onClick={downloadUnreadableArchive}
                  className="h-auto min-h-11 whitespace-normal px-4 py-2"
                >
                  元の保存データをダウンロード
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
                className="h-auto min-h-11 whitespace-normal px-4 py-2"
              >
                ページを再読み込み
              </Button>
            </div>
          </section>
        )}
        {archiveLoad?.status === 'ready' && (
          <>
            {book.storageIssue && (
              <p
                role="alert"
                className="mb-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900"
              >
                {book.storageIssue}
              </p>
            )}
            {book.draftConflict && (
              <section
                role="alert"
                aria-label="他のタブとの編集の競合"
                className="mb-4 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"
              >
                <p>
                  別のタブでレシピが更新されました。このタブの内容は保持していますが、自動保存を止めています。
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={book.pendingWrites > 0}
                    onClick={() => {
                      void book.saveActiveDeck(true);
                    }}
                  >
                    このタブの内容を別名で保存
                  </Button>
                  <Button
                    variant="outline"
                    disabled={book.pendingWrites > 0}
                    onClick={book.loadLatestDraft}
                  >
                    他のタブのレシピを読み込む
                  </Button>
                </div>
              </section>
            )}
            {/* Keep search inputs, filters, and sorting mounted across tabs. */}
            <div hidden={activeTab !== 'cards'}>
              <CardCatalog
                cards={cards}
                activeDeck={activeDeck}
                onAdjustCard={adjustCard}
                onSelectCard={openCatalogCard}
              />
            </div>
            {activeTab === 'recipe' && (
              <DeckRecipe
                deck={activeDeck}
                cardsById={cardsById}
                cardOrder={cardOrder}
                notice={notice}
                onSave={() => {
                  void book.saveActiveDeck();
                }}
                onClear={() => {
                  book.clearActiveDeck();
                  showNotice('編集中のレシピとデッキ名をクリアしました。');
                }}
                onNameChange={(name) =>
                  updateActiveDeck((deck) => ({ ...deck, name }))
                }
                onAdjustCard={adjustCard}
                onMoveCard={moveCard}
                onSelectCard={openDeckCard}
                onOpenCards={() => setActiveTab('cards')}
                onOpenSimulator={() => setActiveTab('simulator')}
              />
            )}
            <DeckSimulator
              active={activeTab === 'simulator'}
              recipeName={activeDeck.name}
              main={activeDeck.main}
              cardsById={cardsById}
              onEditRecipe={openRecipeTab}
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
          </>
        )}
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
        navigationCardIds={selectedDeckCardIds}
        onNavigate={(cardId) => setSelectedCardId(cardId)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedCardId(null);
            setSelectedDeckCardIds(null);
          }
        }}
      />
      {importSourceOpen && (
        <DeckImportSourceDialog
          open
          onOpenChange={setImportSourceOpen}
          onChooseFile={() => importFileInputRef.current?.click()}
          onInspectText={(source, name, selections) =>
            setPendingImport(
              parseDeckTextImport(source, cards, name, selections),
            )
          }
        />
      )}
      <IncomingDeckShare
        cardsById={cardsById}
        canImport={archiveLoad?.status === 'ready'}
        onImport={(deck) =>
          setPendingImport({ decks: [deck], invalidDecks: [], totalCount: 1 })
        }
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
