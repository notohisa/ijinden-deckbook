'use client';

import { type ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ijindenCards, type IjindenCard } from '@/app/ijinden-cards';
import { customCards, type CustomIjindenCard } from '@/app/custom-cards';

type Pile = 'main' | 'side';
type Card = IjindenCard | CustomIjindenCard;
type DeckColor = 'default' | 'orange' | 'gray';
type Deck = { id: string; name: string; main: Record<string, number>; side: Record<string, number>; updatedAt: string; isSaved?: boolean; color?: DeckColor };
type ArchiveData = { version: 2; updatedAt: string; decks: Deck[]; draft: Deck };
type LegacyArchiveData = { version: 1; updatedAt: string; decks: Deck[] };
type MyDeckExport = { version: 1; type: 'ijinden-deckbook-my-decks'; exportedAt: string; decks: Deck[] };
type AppTab = 'cards' | 'recipe' | 'myDecks' | 'help';

const cards: Card[] = [...ijindenCards, ...customCards];
const cardTypes = ['イジン', 'ハイケイ', 'マホウ', 'マリョク'] as const;
type CardType = (typeof cardTypes)[number];
type SortBy = 'official' | 'level' | 'power' | 'type' | 'color' | 'name';
type SortDirection = 'asc' | 'desc';
const colorOptions = ['赤', '青', '緑', '黄', '紫', '無'] as const;
const catalogColorTints: Record<string, string> = {
  赤: '#f9d2ca', 青: '#d7e8f7', 緑: '#d9eddf', 黄: '#fff0bb', 紫: '#e9dcf3', 無: '#e8edf0',
};
const abilityKeywordOptions = [
  '剣術', '美術', '音楽', '思想', '医術', '志願',
  '航海', '執筆', '決起', '徴募', '魔導', '勝鬨', '躍進', '魔力化', '冥府発動', '復元', '反魂', '木霊', '喪神',
  '即応', 'ダブルプレッシャー', 'トリプルプレッシャー', 'ドレイン', 'ウォッチャー', 'スタンド', 'モータル', '消耗', '装備', '冥装',
];
const sortOptions: Array<{ value: SortBy; label: string }> = [
  { value: 'official', label: '公式順' }, { value: 'level', label: 'レベル順' }, { value: 'power', label: 'パワー順' },
  { value: 'type', label: '種類順' }, { value: 'color', label: '色順' }, { value: 'name', label: '名前順' },
];
const sortDirectionOptions: Array<{ value: SortDirection; label: string }> = [
  { value: 'asc', label: '昇順' }, { value: 'desc', label: '降順' },
];
const deckColorOptions: Array<{ value: DeckColor; label: string; swatchClass: string }> = [
  { value: 'default', label: '標準', swatchClass: 'bg-[var(--mist)]' },
  { value: 'orange', label: 'オレンジ', swatchClass: 'bg-orange-400' },
  { value: 'gray', label: 'グレー', swatchClass: 'bg-slate-400' },
];
const deckRowColorClasses: Record<DeckColor, string> = {
  default: 'bg-white/50 hover:bg-[var(--soft)]',
  orange: 'bg-orange-100 hover:bg-orange-200',
  gray: 'bg-slate-200 hover:bg-slate-300',
};
const cardsById = new Map(cards.map((card) => [card.id, card]));
const cardOrder = new Map(cards.map((card, index) => [card.id, index]));
const releaseOptions = Array.from(new Set(cards.map((card) => card.release)));
const rarityOptions = Array.from(new Set(cards.map((card) => card.rarity))).sort((a, b) => ['N', 'm', 'R', 'SR', 'PSR'].indexOf(a) - ['N', 'm', 'R', 'SR', 'PSR'].indexOf(b));
const maxCardLevel = Math.max(17, ...cards.map((card) => card.level ?? 0));
const maxCardPower = Math.max(10000, ...cards.map((card) => card.cardType === 'イジン' ? card.power ?? 0 : 0));
const powerFilterCeiling = Math.ceil(maxCardPower / 500) * 500;
const initialDeck: Deck = { id: 'new-deck', name: '新しいデッキ', main: {}, side: {}, updatedAt: new Date().toISOString(), isSaved: false };
const localStorageKey = 'ijinden-deckbook-v1';
const countCards = (cardsInPile: Record<string, number>) => Object.values(cardsInPile).reduce((total, count) => total + count, 0);
const toggleFilterValue = <T,>(values: T[], value: T) => values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
const releaseLabel = (release: string) => release === 'ブースター' ? '第1弾ブースター' : release;
const countByCardType = (cardsInPile: Record<string, number>) => {
  const totals: Record<CardType, number> = { イジン: 0, ハイケイ: 0, マホウ: 0, マリョク: 0 };
  for (const [cardId, count] of Object.entries(cardsInPile)) {
    const cardType = cardsById.get(cardId)?.cardType;
    if (cardType) totals[cardType] += count;
  }
  return totals;
};

function newDeck(index: number): Deck {
  return { id: crypto.randomUUID(), name: '新しいデッキ ' + String(index), main: {}, side: {}, updatedAt: new Date().toISOString(), isSaved: false };
}

function copyDeckAsDraft(deck: Deck): Deck {
  return { ...deck, id: crypto.randomUUID(), main: { ...deck.main }, side: { ...deck.side }, updatedAt: new Date().toISOString(), isSaved: false };
}

function parseImportedDeck(value: unknown): Deck | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const deck = value as Partial<Deck>;
  const isPile = (pile: unknown): pile is Record<string, number> => Boolean(pile) && typeof pile === 'object' && !Array.isArray(pile) && Object.entries(pile).every(([cardId, count]) => cardsById.has(cardId) && Number.isInteger(count) && count > 0);
  if (typeof deck.id !== 'string' || typeof deck.name !== 'string' || !isPile(deck.main) || !isPile(deck.side)) return null;
  const color = deck.color === 'default' || deck.color === 'orange' || deck.color === 'gray' ? deck.color : undefined;
  return {
    id: deck.id,
    name: deck.name,
    main: { ...deck.main },
    side: { ...deck.side },
    updatedAt: typeof deck.updatedAt === 'string' ? deck.updatedAt : new Date().toISOString(),
    isSaved: true,
    ...(color ? { color } : {}),
  };
}

function normalizedDeckName(name: string) {
  return name.trim();
}

function FilterPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <Button type="button" size="xs" variant="outline" aria-pressed={active} onClick={onClick} className={active ? 'border-[var(--ink)] bg-[var(--ink)] !text-white hover:bg-[var(--ink)]/85 hover:!text-white' : 'border-[var(--line)] bg-white text-[var(--ink)]'}>{label}</Button>;
}

function CollapsibleFilterGroup({ label, selectedCount, children }: { label: string; selectedCount: number; children: ReactNode }) {
  return <details open className="rounded-lg border border-[var(--line)] bg-[var(--soft)]/45">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2 text-xs font-medium marker:content-none">
      <span>{label}</span>
      <span className={selectedCount > 0 ? 'rounded-full bg-[var(--red)] px-1.5 py-0.5 text-[10px] text-white' : 'text-[var(--muted)]'}>{selectedCount > 0 ? selectedCount + '件選択中' : '開く／しまう'}</span>
    </summary>
    <div className="border-t border-[var(--line)] px-2.5 py-2.5"><div className="flex flex-wrap gap-1.5">{children}</div></div>
  </details>;
}

function RangeFilter({ label, min, max, ceiling, step = 1, onMinChange, onMaxChange }: { label: string; min: number; max: number; ceiling: number; step?: number; onMinChange: (value: number) => void; onMaxChange: (value: number) => void }) {
  return <div><p className="text-xs font-medium">{label}</p><p className="mt-1 text-[11px] text-[var(--muted)]">{min} 〜 {max}</p><div className="mt-1 grid grid-cols-2 gap-2"><input aria-label={label + 'の下限'} type="range" min="0" max={ceiling} step={step} value={min} onChange={(event) => onMinChange(Math.min(Number(event.target.value), max))} /><input aria-label={label + 'の上限'} type="range" min="0" max={ceiling} step={step} value={max} onChange={(event) => onMaxChange(Math.max(Number(event.target.value), min))} /></div></div>;
}

function CatalogCardCounter({ label, count, onDecrease, onIncrease }: { label: string; count: number; onDecrease: () => void; onIncrease: () => void }) {
  return <div role="group" aria-label={label + 'の枚数'} className="grid min-w-0 grid-cols-3 overflow-hidden rounded-md border border-[var(--line)] bg-white">
    <Button type="button" variant="ghost" disabled={count === 0} onClick={onDecrease} aria-label={label + 'から1枚減らす'} className="h-11 min-w-0 touch-manipulation rounded-none border-r border-[var(--line)] px-0 text-base text-[var(--muted)]">−</Button>
    <output aria-label={label + 'に入っている枚数'} className="grid h-11 min-w-0 place-items-center text-base tabular-nums">{count}</output>
    <Button type="button" variant="ghost" onClick={onIncrease} aria-label={label + 'に1枚追加する'} className="h-11 min-w-0 touch-manipulation rounded-none border-l border-[var(--line)] px-0 text-base text-[var(--ink)]">＋</Button>
  </div>;
}

export default function Home() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [activeDeck, setActiveDeck] = useState<Deck>(initialDeck);
  const [query, setQuery] = useState('');
  const [queryDraft, setQueryDraft] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<CardType[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedRarities, setSelectedRarities] = useState<string[]>([]);
  const [selectedReleases, setSelectedReleases] = useState<string[]>([]);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [levelMin, setLevelMin] = useState(0);
  const [levelMax, setLevelMax] = useState(maxCardLevel);
  const [powerMin, setPowerMin] = useState(0);
  const [powerMax, setPowerMax] = useState(powerFilterCeiling);
  const [sortBy, setSortBy] = useState<SortBy>('official');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [catalogLimit, setCatalogLimit] = useState(80);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [renamingDeckId, setRenamingDeckId] = useState<string | null>(null);
  const [renamingDeckName, setRenamingDeckName] = useState('');
  const [colorPickerDeckId, setColorPickerDeckId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('cards');
  const [localDataReady, setLocalDataReady] = useState(false);
  const [notice, setNotice] = useState('カードを追加して、あなたの最初のデッキを作りましょう。');
  const [toast, setToast] = useState<string | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const isComposingQueryRef = useRef(false);
  const savedDecks = decks;
  const mainCount = countCards(activeDeck.main);
  const sideCount = countCards(activeDeck.side);
  const mainTypeCounts = countByCardType(activeDeck.main);
  const sideTypeCounts = countByCardType(activeDeck.side);
  const matchingCards = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = cards.filter((card) => {
      const allText = (card.name + ' ' + card.number + ' ' + card.release + ' ' + card.rarity + ' ' + card.color + ' ' + card.cardType + ' ' + card.trait + ' ' + card.description).toLowerCase();
      const matchesColor = selectedColors.length === 0 || selectedColors.some((color) => color === '無' ? card.color === '無' : card.color.includes(color));
      const matchesLevel = card.level === null || (card.level >= levelMin && card.level <= levelMax);
      const matchesPower = card.cardType !== 'イジン' || (card.power !== null && card.power >= powerMin && card.power <= powerMax);
      const abilityText = card.trait + ' ' + card.description;
      return (
        (!normalized || allText.includes(normalized)) &&
        (selectedTypes.length === 0 || selectedTypes.includes(card.cardType)) &&
        matchesColor &&
        (selectedRarities.length === 0 || selectedRarities.includes(card.rarity)) &&
        (selectedReleases.length === 0 || selectedReleases.includes(card.release)) &&
        (selectedKeywords.length === 0 || selectedKeywords.some((keyword) => abilityText.includes(keyword))) &&
        matchesLevel && matchesPower
      );
    });
    return filtered.sort((left, right) => {
      const compareOptionalNumber = (leftValue: number | null, rightValue: number | null) => {
        if (leftValue === null) return rightValue === null ? 0 : 1;
        if (rightValue === null) return -1;
        return leftValue - rightValue;
      };
      const nameOrder = left.name.localeCompare(right.name, 'ja');
      let order = 0;
      if (sortBy === 'level') order = compareOptionalNumber(left.level, right.level) || nameOrder;
      else if (sortBy === 'power') order = compareOptionalNumber(left.power, right.power) || nameOrder;
      else if (sortBy === 'type') order = cardTypes.indexOf(left.cardType) - cardTypes.indexOf(right.cardType) || nameOrder;
      else if (sortBy === 'color') order = colorOptions.findIndex((color) => left.color.includes(color)) - colorOptions.findIndex((color) => right.color.includes(color)) || nameOrder;
      else if (sortBy === 'name') order = nameOrder;
      else order = (cardOrder.get(left.id) ?? 0) - (cardOrder.get(right.id) ?? 0);
      return sortDirection === 'asc' ? order : -order;
    });
  }, [levelMax, levelMin, powerMax, powerMin, query, selectedColors, selectedKeywords, selectedRarities, selectedReleases, selectedTypes, sortBy, sortDirection]);
  const visibleCards = useMemo(() => matchingCards.slice(0, catalogLimit), [catalogLimit, matchingCards]);
  const selectedCard = useMemo(() => cards.find((card) => card.id === selectedCardId) ?? null, [selectedCardId]);
  const activeFilterCount = selectedTypes.length + selectedColors.length + selectedRarities.length + selectedReleases.length + selectedKeywords.length + Number(levelMin !== 0 || levelMax !== maxCardLevel) + Number(powerMin !== 0 || powerMax !== powerFilterCeiling);
  const archive = useMemo<ArchiveData>(() => ({ version: 2, updatedAt: new Date().toISOString(), decks, draft: activeDeck }), [activeDeck, decks]);
  const showNotice = (message: string) => {
    setNotice(message);
    setToast(message);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      setToast(null);
      noticeTimerRef.current = null;
    }, 4500);
  };
  const applyQuery = (value: string) => {
    setQuery(value);
    setCatalogLimit(80);
  };

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(localStorageKey);
      if (!saved) return;
      const savedArchive = JSON.parse(saved) as ArchiveData | LegacyArchiveData;
      if (savedArchive.version === 2) {
        setDecks(savedArchive.decks);
        setActiveDeck({ ...savedArchive.draft, main: { ...savedArchive.draft.main }, side: { ...savedArchive.draft.side }, isSaved: false });
        showNotice('保存済みデッキと作業中のレシピを読み込みました。');
      } else if (savedArchive.version === 1 && savedArchive.decks.length > 0) {
        const legacyDraft = savedArchive.decks.find((deck) => !deck.isSaved);
        setDecks(savedArchive.decks.filter((deck) => deck.isSaved));
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
      showNotice('この端末に保存できませんでした。マイデッキをエクスポートしてください。');
    }
  }, [archive, localDataReady]);

  const updateActiveDeck = (updater: (deck: Deck) => Deck) => setActiveDeck((previous) => ({ ...updater(previous), updatedAt: new Date().toISOString(), isSaved: false }));
  const adjustCard = (cardId: string, pile: Pile, difference: number) => updateActiveDeck((deck) => {
    const currentPile = { ...deck[pile] };
    const next = Math.max(0, (currentPile[cardId] ?? 0) + difference);
    if (next === 0) delete currentPile[cardId]; else currentPile[cardId] = next;
    return { ...deck, [pile]: currentPile };
  });
  const moveCard = (cardId: string, fromPile: Pile) => updateActiveDeck((deck) => {
    const toPile: Pile = fromPile === 'main' ? 'side' : 'main';
    const source = { ...deck[fromPile] };
    const destination = { ...deck[toPile] };
    const next = (source[cardId] ?? 0) - 1;
    if (next === 0) delete source[cardId]; else source[cardId] = next;
    destination[cardId] = (destination[cardId] ?? 0) + 1;
    return { ...deck, [fromPile]: source, [toPile]: destination };
  });
  const saveActiveDeck = () => {
    if (mainCount + sideCount === 0) {
      showNotice('空のデッキはマイデッキに保存できません。カードを追加してから保存してください。');
      return;
    }
    const name = normalizedDeckName(activeDeck.name);
    if (decks.some((deck) => normalizedDeckName(deck.name) === name)) {
      showNotice('同名のデッキはマイデッキに保存できません。デッキ名を変更してください。');
      return;
    }
    const savedDeck = { ...activeDeck, id: crypto.randomUUID(), name, main: { ...activeDeck.main }, side: { ...activeDeck.side }, updatedAt: new Date().toISOString(), isSaved: true };
    setDecks((previous) => [savedDeck, ...previous]);
    showNotice('「' + (activeDeck.name || '名前のないデッキ') + '」をマイデッキに保存しました。');
  };
  const selectCard = (cardId: string) => {
    setSelectedCardId(cardId);
  };
  const resetCardSearch = () => {
    setQuery(''); setQueryDraft(''); setSelectedTypes([]); setSelectedColors([]); setSelectedRarities([]); setSelectedReleases([]); setSelectedKeywords([]);
    setLevelMin(0); setLevelMax(maxCardLevel); setPowerMin(0); setPowerMax(powerFilterCeiling); setSortBy('official'); setSortDirection('asc'); setCatalogLimit(80);
  };
  const createDeck = () => {
    const created = newDeck(decks.length + 1);
    setActiveDeck(created); setActiveTab('recipe');
    showNotice('空のデッキを作成しました。');
  };
  const startRenamingDeck = (deck: Deck) => {
    setRenamingDeckId(deck.id);
    setRenamingDeckName(deck.name);
  };
  const saveDeckName = () => {
    if (!renamingDeckId) return;
    const name = normalizedDeckName(renamingDeckName);
    if (decks.some((deck) => deck.id !== renamingDeckId && normalizedDeckName(deck.name) === name)) {
      showNotice('同名のデッキには変更できません。別のデッキ名を入力してください。');
      return;
    }
    setDecks((previous) => previous.map((deck) => deck.id === renamingDeckId
      ? { ...deck, name, updatedAt: new Date().toISOString() } : deck));
    setRenamingDeckId(null);
    showNotice('デッキ名を変更しました。');
  };
  const setDeckColor = (deckId: string, color: DeckColor) => {
    setDecks((previous) => previous.map((deck) => deck.id === deckId
      ? { ...deck, color, updatedAt: new Date().toISOString() } : deck));
    setColorPickerDeckId(null);
    showNotice('マイデッキの色を変更しました。');
  };
  const deleteSavedDeck = (deckId: string) => {
    const deck = decks.find((item) => item.id === deckId);
    if (!deck || !window.confirm('「' + (deck.name || '名前のないデッキ') + '」を削除しますか？')) return;
    setDecks((previous) => previous.filter((item) => item.id !== deckId));
    setRenamingDeckId(null);
    showNotice('マイデッキから削除しました。');
  };
  const clearActiveDeck = () => {
    updateActiveDeck((deck) => ({ ...deck, name: '', main: {}, side: {} }));
    showNotice('編集中のレシピとデッキ名をクリアしました。');
  };
  const exportMyDecks = () => {
    const exported: MyDeckExport = {
      version: 1,
      type: 'ijinden-deckbook-my-decks',
      exportedAt: new Date().toISOString(),
      decks: decks.map((deck) => ({ ...deck, main: { ...deck.main }, side: { ...deck.side }, isSaved: true })),
    };
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'deckbook-my-decks-' + new Date().toISOString().slice(0, 10) + '.json';
    link.click(); URL.revokeObjectURL(url);
    showNotice('マイデッキ' + String(decks.length) + '件をエクスポートしました。');
  };
  const importMyDecks = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const source = JSON.parse(await file.text()) as { decks?: unknown };
      if (!Array.isArray(source.decks)) throw new Error('invalid export');
      const importedDecks = source.decks.map(parseImportedDeck).filter((deck): deck is Deck => deck !== null);
      if (importedDecks.length === 0) throw new Error('empty export');
      const merged = new Map(decks.map((deck) => [deck.id, deck]));
      const deckIdByName = new Map(
        decks
          .map((deck) => [normalizedDeckName(deck.name), deck.id] as const)
          .filter(([name]) => name.length > 0),
      );
      let added = 0;
      let updated = 0;
      for (const deck of importedDecks) {
        const name = normalizedDeckName(deck.name);
        const existingId = (name ? deckIdByName.get(name) : undefined) ?? (merged.has(deck.id) ? deck.id : undefined);
        if (!existingId) {
          merged.set(deck.id, { ...deck, name });
          if (name) deckIdByName.set(name, deck.id);
          added += 1;
          continue;
        }
        const current = merged.get(existingId);
        const previousName = current ? normalizedDeckName(current.name) : '';
        if (previousName && previousName !== name) deckIdByName.delete(previousName);
        merged.set(existingId, { ...deck, id: existingId, name, updatedAt: new Date().toISOString(), isSaved: true });
        if (name) deckIdByName.set(name, existingId);
        updated += 1;
      }
      setDecks(Array.from(merged.values()).sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)));
      showNotice('マイデッキを読み込みました。新規 ' + String(added) + '件・更新 ' + String(updated) + '件です。');
    } catch {
      showNotice('読み込めませんでした。このアプリでエクスポートしたJSONファイルを選んでください。');
    }
  };
  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--paper)] text-[var(--ink)]">
      <div className="page-grain" aria-hidden="true" />
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[#f4f0e7]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--ink)] text-lg text-[var(--paper)] shadow-[3px_3px_0_var(--red)]">◆</div>
            <div className="min-w-0"><p className="font-display text-lg leading-none tracking-[0.08em]">デッキ帳</p><p className="mt-1 text-[10px] tracking-[0.12em] text-[var(--muted)]">YOUR DECK, YOUR DEVICE</p></div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <input ref={importFileInputRef} type="file" accept="application/json,.json" className="sr-only" onChange={importMyDecks} />
            <Button variant="outline" size="sm" className="border-[var(--line)] bg-white/70" onClick={exportMyDecks} aria-label="マイデッキをエクスポート"><span className="sm:hidden">↓ 出力</span><span className="hidden sm:inline">↓ エクスポート</span></Button>
            <Button variant="outline" size="sm" className="border-[var(--line)] bg-white/70" onClick={() => importFileInputRef.current?.click()} aria-label="マイデッキをインポート"><span className="sm:hidden">↑ 取込</span><span className="hidden sm:inline">↑ インポート</span></Button>
          </div>
        </div>
        <nav className="mx-auto max-w-[1180px] overflow-x-auto px-4 sm:px-6" aria-label="メインメニュー">
          <div className="flex min-w-max gap-1" role="tablist" aria-label="デッキ帳のタブ">
            {([
              ['cards', 'カード'], ['recipe', 'レシピ'], ['myDecks', 'マイデッキ'], ['help', 'ヘルプ'],
            ] as Array<[AppTab, string]>).map(([tab, label]) => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)} className={'border-b-2 px-4 py-3 text-sm font-medium transition ' + (activeTab === tab ? 'border-[var(--red)] text-[var(--red)]' : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]')}>{label}</button>)}
          </div>
        </nav>
      </header>

      <div className="mx-auto max-w-[1180px] px-4 py-5 sm:px-6">
        {activeTab === 'cards' && <section className="rounded-2xl border border-[var(--line)] bg-white/70 p-3 shadow-[0_12px_30px_rgb(33_38_45/0.04)] sm:p-4" role="tabpanel" aria-label="カードを探す">
          <div className="mb-3 flex items-center justify-between gap-3 px-1 pt-1">
            <div><p className="label">CARD CATALOG</p><h1 className="font-display mt-1 text-xl tracking-wide">カードを探す</h1><p className="mt-1 text-[11px] text-[var(--muted)]">編集中：{activeDeck.name || '名前のないデッキ'} · メイン {mainCount}枚 / サイド {sideCount}枚</p></div>
            <span className="rounded-full bg-[var(--mist)] px-2 py-1 text-[11px] text-[var(--muted)]">{matchingCards.length}件</span>
          </div>
          <div className="relative mb-3"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">⌕</span><input type="search" inputMode="search" value={queryDraft} onCompositionStart={() => { isComposingQueryRef.current = true; }} onCompositionEnd={(event) => { isComposingQueryRef.current = false; const value = event.currentTarget.value; setQueryDraft(value); applyQuery(value); }} onChange={(event) => { const value = event.target.value; setQueryDraft(value); if (!isComposingQueryRef.current) applyQuery(value); }} placeholder="名前・能力文・特性・カード番号で検索" className="h-10 w-full rounded-lg border border-[var(--line)] bg-white py-1 pr-2 pl-9 text-base outline-none placeholder:text-[var(--muted)] focus-visible:border-[var(--ring)] focus-visible:ring-3 focus-visible:ring-[var(--ring)]/50 md:text-sm" /></div>
          <details className="mb-3 rounded-xl border border-[var(--line)] bg-white/80">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium marker:content-none"><span>⌘ 条件で絞り込む</span><span className={activeFilterCount > 0 ? 'rounded-full bg-[var(--red)] px-2 py-0.5 text-[10px] text-white' : 'rounded-full bg-[var(--mist)] px-2 py-0.5 text-[10px] text-[var(--muted)]'}>{activeFilterCount > 0 ? activeFilterCount + '件選択中' : 'すべて'}</span></summary>
            <div className="space-y-4 border-t border-[var(--line)] px-3 pb-3 pt-3">
              <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium">絞り込み条件</p><Button size="xs" variant="ghost" className="text-[var(--red)]" onClick={resetCardSearch}>リセット</Button></div>
              <CollapsibleFilterGroup label="種類" selectedCount={selectedTypes.length}>{cardTypes.map((type) => <FilterPill key={type} label={type} active={selectedTypes.includes(type)} onClick={() => { setSelectedTypes((values) => toggleFilterValue(values, type)); setCatalogLimit(80); }} />)}</CollapsibleFilterGroup>
              <CollapsibleFilterGroup label="色" selectedCount={selectedColors.length}>{colorOptions.map((color) => <FilterPill key={color} label={color === '無' ? '無色' : color} active={selectedColors.includes(color)} onClick={() => { setSelectedColors((values) => toggleFilterValue(values, color)); setCatalogLimit(80); }} />)}</CollapsibleFilterGroup>
              <CollapsibleFilterGroup label="レアリティ" selectedCount={selectedRarities.length}>{rarityOptions.map((rarity) => <FilterPill key={rarity} label={rarity} active={selectedRarities.includes(rarity)} onClick={() => { setSelectedRarities((values) => toggleFilterValue(values, rarity)); setCatalogLimit(80); }} />)}</CollapsibleFilterGroup>
              <CollapsibleFilterGroup label="収録" selectedCount={selectedReleases.length}>{releaseOptions.map((release) => <FilterPill key={release} label={releaseLabel(release)} active={selectedReleases.includes(release)} onClick={() => { setSelectedReleases((values) => toggleFilterValue(values, release)); setCatalogLimit(80); }} />)}</CollapsibleFilterGroup>
              <CollapsibleFilterGroup label="特性・能力語・遺業" selectedCount={selectedKeywords.length}>{abilityKeywordOptions.map((keyword) => <FilterPill key={keyword} label={keyword} active={selectedKeywords.includes(keyword)} onClick={() => { setSelectedKeywords((values) => toggleFilterValue(values, keyword)); setCatalogLimit(80); }} />)}</CollapsibleFilterGroup>
              <div className="grid gap-3 sm:grid-cols-2">
                <RangeFilter label="レベル" min={levelMin} max={levelMax} ceiling={maxCardLevel} onMinChange={setLevelMin} onMaxChange={setLevelMax} />
                <RangeFilter label="パワー（イジンのみ）" min={powerMin} max={powerMax} ceiling={powerFilterCeiling} step={500} onMinChange={setPowerMin} onMaxChange={setPowerMax} />
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
                <div><label htmlFor="card-sort" className="text-xs font-medium">並べ替え</label><select id="card-sort" value={sortBy} onChange={(event) => setSortBy(event.target.value as SortBy)} className="mt-1 h-8 w-full rounded-lg border border-[var(--line)] bg-white px-2 text-xs">{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                <div><label htmlFor="card-sort-direction" className="text-xs font-medium">順序</label><select id="card-sort-direction" value={sortDirection} onChange={(event) => setSortDirection(event.target.value as SortDirection)} className="mt-1 h-8 w-full rounded-lg border border-[var(--line)] bg-white px-2 text-xs">{sortDirectionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
              </div>
            </div>
          </details>
          <div className="-mx-3 max-h-[calc(100vh-180px)] overflow-y-auto sm:mx-0">
            <Table aria-label="カード選択一覧" className="min-w-[18rem] table-fixed text-sm">
              <TableHeader className="bg-[var(--mist)]/70">
                <TableRow className="border-[var(--line)] hover:bg-transparent">
                  <TableHead scope="col" className="w-12 px-1 text-center font-bold sm:w-20">ID</TableHead>
                  <TableHead scope="col" className="px-2 font-bold">カード名</TableHead>
                  <TableHead scope="col" className="w-20 px-1 text-center font-bold sm:w-36">メイン</TableHead>
                  <TableHead scope="col" className="w-20 px-1 text-center font-bold sm:w-36">サイド</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleCards.map((card) => {
                  const mainInDeck = activeDeck.main[card.id] ?? 0;
                  const sideInDeck = activeDeck.side[card.id] ?? 0;
                  const tints = Array.from(card.color).map((color) => catalogColorTints[color] ?? catalogColorTints['無']);
                  const idBackground = tints.length > 1 ? 'linear-gradient(135deg, ' + tints.join(', ') + ')' : tints[0];
                  return <TableRow key={card.id} className={'border-[var(--line)] ' + (mainInDeck + sideInDeck > 0 ? 'bg-[var(--mist)]/70' : 'bg-white/70')}>
                    <TableCell className="whitespace-normal break-all px-1 py-2 text-center text-xs text-[var(--ink)] sm:text-sm" style={{ background: idBackground }}><span aria-label={card.color + '色・' + card.id}>{card.id}</span></TableCell>
                    <TableCell className="whitespace-normal px-1 py-1 sm:px-2">
                      <button type="button" onClick={() => selectCard(card.id)} aria-label={card.name + '（' + card.id + '）の詳細を開く'} className="block min-h-11 w-full touch-manipulation rounded px-1 py-1 text-left text-base leading-6 break-words hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--red)]">
                        <span aria-hidden="true">🔍</span>{card.name}
                      </button>
                    </TableCell>
                    <TableCell className="px-1 py-2"><CatalogCardCounter label={card.name + '（' + card.id + '）のメイン'} count={mainInDeck} onDecrease={() => adjustCard(card.id, 'main', -1)} onIncrease={() => adjustCard(card.id, 'main', 1)} /></TableCell>
                    <TableCell className="px-1 py-2"><CatalogCardCounter label={card.name + '（' + card.id + '）のサイド'} count={sideInDeck} onDecrease={() => adjustCard(card.id, 'side', -1)} onIncrease={() => adjustCard(card.id, 'side', 1)} /></TableCell>
                  </TableRow>;
                })}
                {visibleCards.length === 0 && <TableRow><TableCell colSpan={4} className="whitespace-normal px-3 py-8 text-center text-sm text-[var(--muted)]">一致するカードがありません。</TableCell></TableRow>}
              </TableBody>
            </Table>
            {visibleCards.length < matchingCards.length && <Button variant="outline" className="mt-2 w-full border-[var(--line)] bg-white" onClick={() => setCatalogLimit((limit) => limit + 80)}>さらにカードを表示（残り {matchingCards.length - visibleCards.length}件）</Button>}
          </div>
        </section>}

        {activeTab === 'recipe' && <section className="mx-auto min-w-0 max-w-4xl rounded-2xl border border-[var(--line)] bg-white/85 shadow-[0_16px_40px_rgb(33_38_45/0.06)]" role="tabpanel" aria-label="レシピ">
          <div className="border-b border-[var(--line)] px-4 py-4 sm:px-5">
            <p className="label">NOW EDITING</p><h1 className="mt-1 font-display text-2xl tracking-wide">デッキレシピ</h1>
            <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" className="bg-[var(--green)] text-white hover:bg-[var(--green)]/85" onClick={saveActiveDeck}>マイデッキに保存</Button><Button size="sm" variant="outline" className="border-[var(--red)] text-[var(--red)] hover:bg-red-50 hover:text-[var(--red)]" onClick={clearActiveDeck}>レシピをクリア</Button></div>
            <div className="mt-3"><label htmlFor="deck-name" className="sr-only">デッキ名</label><Input id="deck-name" aria-label="デッキ名" placeholder="デッキ名を入力（任意）" value={activeDeck.name} onChange={(event) => updateActiveDeck((deck) => ({ ...deck, name: event.target.value }))} className="h-11 w-full border-[var(--line)] bg-white px-3 text-base shadow-none" /></div>
            <div className="mt-4 grid grid-cols-3 divide-x divide-[var(--line)] rounded-xl border border-[var(--line)] bg-[var(--soft)]">
              <div className="px-3 py-2 text-center"><p className="text-[10px] tracking-wide text-[var(--muted)]">MAIN</p><p className="font-display text-2xl">{mainCount}</p></div>
              <div className="px-3 py-2 text-center"><p className="text-[10px] tracking-wide text-[var(--muted)]">SIDE</p><p className="font-display text-2xl">{sideCount}</p></div>
              <div className="px-3 py-2 text-center"><p className="text-[10px] tracking-wide text-[var(--muted)]">STATUS</p><p className={'pt-1 text-xs font-medium ' + (mainCount === 40 ? 'text-[var(--green)]' : 'text-[var(--red)]')}>{mainCount === 40 ? '完成' : mainCount < 40 ? String(40 - mainCount) + '枚あと' : String(mainCount - 40) + '枚超過'}</p></div>
            </div>
            <div className="mt-3 rounded-xl border border-[var(--line)] bg-white px-3 py-2.5">
              <div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-medium tracking-wide text-[var(--muted)]">種類別枚数</p><p className="text-[10px] text-[var(--muted)]">メイン / サイド</p></div>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">{cardTypes.map((cardType) => <div key={cardType} className="rounded-lg bg-[var(--soft)] px-2 py-1.5 text-center"><p className="text-[11px] font-medium">{cardType}</p><p className="mt-0.5 text-xs text-[var(--muted)]"><span className="font-display text-base text-[var(--ink)]">{mainTypeCounts[cardType]}</span> / <span className="font-display text-base text-[var(--ink)]">{sideTypeCounts[cardType]}</span></p></div>)}</div>
            </div>
          </div>
          <div className="p-4 sm:p-5">
            <div className="mb-4"><Button type="button" variant="outline" className="w-full border-[var(--line)] bg-[var(--paper)]" onClick={() => setActiveTab('cards')}>⌕ カードタブを開く</Button></div>
            <DeckPile title="メインデッキ" pile="main" deck={activeDeck} onAdjust={adjustCard} onMoveCard={moveCard} onSelectCard={selectCard} />
            <DeckPile title="サイドデッキ" pile="side" deck={activeDeck} onAdjust={adjustCard} onMoveCard={moveCard} onSelectCard={selectCard} />
          </div>
          <div className="border-t border-[var(--line)] bg-[var(--soft)] px-4 py-3 sm:px-5"><p className="flex items-start gap-2 text-xs leading-5 text-[var(--muted)]"><span className="text-[var(--green)]">●</span>{notice}</p></div>
        </section>}

        {activeTab === 'myDecks' && <section className="mx-auto max-w-2xl space-y-4" role="tabpanel" aria-label="マイデッキ">
          <section className="rounded-2xl border border-[var(--line)] bg-white/75 p-3">
            <div className="mb-2 flex items-center justify-between px-1 pt-1"><div><p className="label">MY DECKS</p><h2 className="font-display mt-1 text-lg tracking-wide">マイデッキ</h2></div><Button size="icon-sm" variant="outline" className="border-[var(--line)]" onClick={createDeck} aria-label="新しいデッキ">＋</Button></div>
            {savedDecks.length === 0 ? <p className="rounded-xl bg-[var(--soft)] px-3 py-7 text-center text-xs leading-5 text-[var(--muted)]">保存済みのデッキはありません。<br />レシピタブの「マイデッキに保存」から追加できます。</p> : <div className="space-y-2">{savedDecks.map((deck) => {
              const isRenaming = renamingDeckId === deck.id;
              const isChoosingColor = colorPickerDeckId === deck.id;
              const deckColor = deck.color ?? 'default';
              return isRenaming ? <div key={deck.id} className="rounded-xl bg-[var(--mist)] p-2 ring-1 ring-[var(--line)]"><label htmlFor={'deck-name-' + deck.id} className="sr-only">デッキ名</label><Input id={'deck-name-' + deck.id} value={renamingDeckName} onChange={(event) => setRenamingDeckName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveDeckName(); }} className="h-9 border-[var(--line)] bg-white text-sm" autoFocus /><div className="mt-2 flex justify-end gap-1"><Button size="xs" variant="ghost" onClick={() => setRenamingDeckId(null)}>キャンセル</Button><Button size="xs" onClick={saveDeckName}>変更を保存</Button></div></div> : <div key={deck.id} className="space-y-1">
                <div className={'flex w-full items-center gap-1 rounded-xl transition ' + deckRowColorClasses[deckColor]}><button type="button" onClick={() => { setActiveDeck(copyDeckAsDraft(deck)); setActiveTab('recipe'); showNotice('マイデッキを作業用レシピに読み込みました。変更は保存済みデッキへ反映されません。'); }} className="min-w-0 flex-1 px-3 py-2.5 text-left"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{deck.name || '名前のないデッキ'}</span></span><span className="mt-1 block text-[11px] text-[var(--muted)]">メイン {countCards(deck.main)}枚 · サイド {countCards(deck.side)}枚</span></button><div className="flex shrink-0 gap-0.5 pr-1"><Button type="button" size="icon-xs" variant="ghost" className="text-[var(--muted)]" onClick={() => setColorPickerDeckId(isChoosingColor ? null : deck.id)} aria-label={deck.name + 'の色を変更'}><span aria-hidden="true" className={'size-3 rounded-full border border-black/20 ' + deckColorOptions.find((option) => option.value === deckColor)?.swatchClass} /></Button><Button type="button" size="icon-xs" variant="ghost" className="text-[var(--muted)]" onClick={() => startRenamingDeck(deck)} aria-label={deck.name + 'の名前を変更'}>✎</Button><Button type="button" size="icon-xs" variant="ghost" className="text-[var(--red)] hover:text-[var(--red)]" onClick={() => deleteSavedDeck(deck.id)} aria-label={deck.name + 'を削除'}>×</Button></div></div>{isChoosingColor && <div className="grid grid-cols-3 gap-1 rounded-lg border border-[var(--line)] bg-white p-1.5"><p className="col-span-3 px-1 text-[11px] text-[var(--muted)]">デッキの色</p>{deckColorOptions.map((option) => <Button key={option.value} type="button" size="xs" className="w-full" variant={deckColor === option.value ? 'secondary' : 'ghost'} onClick={() => setDeckColor(deck.id, option.value)}><span aria-hidden="true" className={'size-2.5 rounded-full ' + option.swatchClass} />{option.label}</Button>)}</div>}</div>;
            })}</div>}
          </section>
        </section>}

        {activeTab === 'help' && <section className="mx-auto max-w-3xl rounded-2xl border border-[var(--line)] bg-white/80 p-5 text-sm leading-7 shadow-[0_12px_30px_rgb(33_38_45/0.04)] sm:p-7" role="tabpanel" aria-label="ヘルプ">
          <p className="label">HELP</p>
          <h1 className="mt-1 font-display text-2xl tracking-wide">デッキ帳の使い方</h1>
          <div className="mt-6 space-y-6">
            <section><h2 className="font-display text-lg">カード</h2><p className="mt-1 text-[var(--muted)]">名前・能力文・特性・カード番号から探せます。各カードのメイン／サイドの＋・−で、その場で枚数を調整できます。</p></section>
            <section><h2 className="font-display text-lg">レシピ</h2><p className="mt-1 text-[var(--muted)]">編集中のデッキの合計枚数、種類別枚数、メインデッキ、サイドデッキを確認できます。レシピのカード画像左下に枚数を表示します。メイン40枚で完成表示になります。</p></section>
            <section><h2 className="font-display text-lg">マイデッキ</h2><p className="mt-1 text-[var(--muted)]">レシピタブで「マイデッキに保存」を押したデッキだけを表示します。保存済みデッキの切り替え、名前変更、削除、新しいデッキの作成を行えます。</p></section>
            <section><h2 className="font-display text-lg">エクスポート・インポート</h2><p className="mt-1 text-[var(--muted)]">この端末では、保存済みマイデッキと作業中レシピを自動保存します。上部の「エクスポート」で保存済みマイデッキだけをJSONファイルに出力し、別の端末で「インポート」すると追加・更新できます。同じ名前の保存済みデッキがある場合は、インポートした内容で上書きします。作業中レシピは出力されません。</p></section>
            <section><h2 className="font-display text-lg">アクセス解析</h2><p className="mt-1 text-[var(--muted)]">ページ閲覧数と訪問者数の把握に、Cloudflare Web Analyticsを使用しています。マイデッキの内容、デッキ名、カード選択や検索語は送信しません。</p><a className="mt-2 inline-block text-xs text-[var(--red)] underline underline-offset-2" href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Cloudflareのプライバシーについて ↗</a></section>
            <section className="rounded-xl bg-[var(--soft)] p-4 text-xs text-[var(--muted)]"><p className="font-medium text-[var(--ink)]">公式カードデータについて</p><p className="mt-1">全576種の名称・能力文と画像はイジンデン公式カードリストを参照しています。画像は公式サイトから直接表示します。</p><a className="mt-2 inline-block text-[var(--red)] underline underline-offset-2" href="https://one-draw.jp/ijinden/cardlist.html" target="_blank" rel="noreferrer">公式カードリストを開く ↗</a></section>
          </div>
        </section>}
      </div>
      {toast && <div className="fixed inset-x-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-[60] mx-auto flex max-w-lg items-start gap-2 rounded-xl border border-[var(--green)] bg-white px-3 py-3 text-sm leading-5 text-[var(--ink)] shadow-lg" role="status" aria-live="polite">
        <span className="mt-0.5 text-[var(--green)]" aria-hidden="true">●</span>
        <p className="min-w-0 flex-1">{toast}</p>
        <button type="button" className="-mr-1 -mt-1 grid size-7 shrink-0 place-items-center rounded-md text-lg text-[var(--muted)] hover:bg-[var(--soft)]" onClick={() => setToast(null)} aria-label="通知を閉じる">×</button>
      </div>}
      {selectedCard && <div className="fixed inset-0 z-50 grid place-items-end bg-black/45 p-0 sm:place-items-center sm:p-5" role="dialog" aria-modal="true" aria-label={selectedCard.name + 'を追加'}>
        <button type="button" className="absolute inset-0 cursor-default" aria-label="カード詳細を閉じる" onClick={() => setSelectedCardId(null)} />
        <section className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-[#f8f5ee] p-4 shadow-2xl sm:rounded-3xl sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <p className="label">CARD DETAIL</p>
            <Button variant="ghost" size="icon-sm" onClick={() => setSelectedCardId(null)} aria-label="閉じる">×</Button>
          </div>
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:gap-6">
            <img src={selectedCard.imageUrl} alt={selectedCard.name + 'のカード画像'} className="mx-auto h-[240px] w-[172px] shrink-0 rounded-lg border border-black/20 bg-white object-cover object-top shadow-lg sm:mx-0 sm:h-[310px] sm:w-[222px]" />
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-2xl tracking-wide sm:text-3xl">{selectedCard.name}</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">{selectedCard.id} · {selectedCard.release}</p>
              <div className="mt-3 flex flex-wrap gap-1.5 text-xs"><span className="rounded-full bg-[var(--ink)] px-2 py-1 text-white">{selectedCard.cardType}</span><span className="rounded-full bg-[var(--mist)] px-2 py-1">{selectedCard.rarity}</span><span className="rounded-full bg-[var(--mist)] px-2 py-1">{selectedCard.color}</span><span className="rounded-full bg-[var(--mist)] px-2 py-1">Lv.{selectedCard.level ?? '-'}</span>{selectedCard.power !== null && <span className="rounded-full bg-[var(--mist)] px-2 py-1">パワー {selectedCard.power}</span>}</div>
              {selectedCard.trait && <p className="mt-3 text-xs text-[var(--muted)]">{selectedCard.trait}</p>}
              <p className="mt-3 whitespace-pre-line text-xs leading-5 text-[var(--ink)] sm:text-sm">{selectedCard.description || '公式カード情報'}</p>
              {'illustrator' in selectedCard && selectedCard.illustrator && <p className="mt-3 text-xs text-[var(--muted)]">イラストレーター：{selectedCard.illustrator}</p>}
            </div>
          </div>
        </section>
      </div>}
      <footer className="mx-auto max-w-[1480px] px-4 pb-8 pt-2 text-center text-[11px] tracking-wide text-[var(--muted)] sm:px-6"><span className="inline-flex items-center gap-1.5">✦ 非公式のデッキ作成補助アプリです。デッキデータはこの端末に保存します。</span></footer>
    </main>
  );
}

function DeckPile({ title, pile, deck, onAdjust, onMoveCard, onSelectCard }: {
  title: string; pile: Pile; deck: Deck;
  onAdjust: (cardId: string, pile: Pile, difference: number) => void;
  onMoveCard: (cardId: string, pile: Pile) => void;
  onSelectCard: (cardId: string) => void;
}) {
  const entries = Object.entries(deck[pile])
    .map(([cardId, count]) => ({ card: cards.find((card) => card.id === cardId), count }))
    .filter((entry): entry is { card: Card; count: number } => Boolean(entry.card))
    .sort((left, right) => cardTypes.indexOf(left.card.cardType) - cardTypes.indexOf(right.card.cardType)
      || (left.card.level ?? 99) - (right.card.level ?? 99)
      || colorOptions.findIndex((color) => left.card.color.includes(color)) - colorOptions.findIndex((color) => right.card.color.includes(color))
      || (left.card.power ?? 99999) - (right.card.power ?? 99999)
      || (cardOrder.get(left.card.id) ?? 0) - (cardOrder.get(right.card.id) ?? 0));
  return <section className="mb-6 last:mb-0">
    <div className="mb-2 flex items-center justify-between"><h2 className="font-display text-lg tracking-wide">{title}</h2><span className="text-xs text-[var(--muted)]">{countCards(deck[pile])}枚</span></div>
    {entries.length === 0 ? <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--soft)] px-4 py-6 text-center text-xs text-[var(--muted)]">カードタブから追加してください</div> : <ul className="flex flex-wrap gap-2" aria-label={title + 'のカード一覧'}>
      {entries.map(({ card, count }) => <li key={card.id} className="relative h-[112px] w-[80px] overflow-hidden rounded-md border border-black/15 bg-white shadow-sm">
        <button type="button" onClick={() => onSelectCard(card.id)} aria-label={card.name + 'の詳細を開く'} className="absolute inset-0 z-0"><img src={card.imageUrl} alt={card.name} loading="lazy" className="h-full w-full object-cover object-top" /></button>
        <Button type="button" size="icon-xs" onClick={() => onAdjust(card.id, pile, -1)} aria-label={card.name + 'を1枚減らす'} className="absolute left-0 top-0 z-20 rounded-none rounded-br-md bg-[#1769db] text-base text-white hover:bg-[#0f56b7]">−</Button>
        <Button type="button" size="icon-xs" onClick={() => onAdjust(card.id, pile, 1)} aria-label={card.name + 'を1枚増やす'} className="absolute right-0 top-0 z-20 rounded-none rounded-bl-md bg-[#1769db] text-base text-white hover:bg-[#0f56b7]">＋</Button>
        <button type="button" onClick={() => onSelectCard(card.id)} aria-label={card.name + 'の詳細を開く'} className="absolute left-1/2 top-1/2 z-20 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-md border border-white/80 bg-white/95 text-base text-[var(--ink)] shadow-sm hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--red)]">⌕</button>
        <output aria-label={card.name + '：' + count + '枚'} className="absolute bottom-0 left-0 min-w-6 rounded-tr-md border-r border-t border-black/30 bg-white px-1.5 py-0.5 text-center font-display text-sm leading-none text-[var(--ink)]">{count}</output>
        <Button type="button" size="icon-xs" onClick={() => onMoveCard(card.id, pile)} aria-label={card.name + 'を' + (pile === 'main' ? 'サイドデッキ' : 'メインデッキ') + 'へ1枚移動'} className="absolute bottom-0 right-0 z-20 rounded-none rounded-tl-md bg-[#1769db] text-base text-white hover:bg-[#0f56b7]">{pile === 'main' ? '↓' : '↑'}</Button>
      </li>)}
    </ul>}
  </section>;
}
