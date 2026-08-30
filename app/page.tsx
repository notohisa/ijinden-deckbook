'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ijindenCards, type IjindenCard } from '@/app/ijinden-cards';

type Pile = 'main' | 'side';
type Card = IjindenCard;
type Deck = { id: string; name: string; main: Record<string, number>; side: Record<string, number>; updatedAt: string; isSaved?: boolean };
type ArchiveData = { version: 2; updatedAt: string; decks: Deck[]; draft: Deck };
type LegacyArchiveData = { version: 1; updatedAt: string; decks: Deck[] };
type AppTab = 'cards' | 'recipe' | 'myDecks' | 'help';

const cards: Card[] = ijindenCards;
const cardTypes = ['イジン', 'ハイケイ', 'マホウ', 'マリョク'] as const;
type CardType = (typeof cardTypes)[number];
type SortBy = 'official' | 'level' | 'power' | 'type' | 'color' | 'name';
type SortDirection = 'asc' | 'desc';
const colorOptions = ['赤', '青', '緑', '黄', '紫', '無'] as const;
const abilityKeywordOptions = ['剣術', '美術', '音楽', '思想', '医術', '志願', '航海', '執筆', '決起', '徴募', '魔導', '勝鬨', '躍進', '魔力化', '冥府発動', '復元', '反魂', '木霊', '喪神'];
const sortOptions: Array<{ value: SortBy; label: string }> = [
  { value: 'official', label: '公式順' }, { value: 'level', label: 'レベル順' }, { value: 'power', label: 'パワー順' },
  { value: 'type', label: '種類順' }, { value: 'color', label: '色順' }, { value: 'name', label: '名前順' },
];
const sortDirectionOptions: Array<{ value: SortDirection; label: string }> = [
  { value: 'asc', label: '昇順' }, { value: 'desc', label: '降順' },
];
const cardsById = new Map(cards.map((card) => [card.id, card]));
const cardOrder = new Map(cards.map((card, index) => [card.id, index]));
const releaseOptions = Array.from(new Set(cards.map((card) => card.release)));
const rarityOptions = Array.from(new Set(cards.map((card) => card.rarity))).sort((a, b) => ['C', 'N', 'm', 'R', 'SR', 'PSR'].indexOf(a) - ['C', 'N', 'm', 'R', 'SR', 'PSR'].indexOf(b));
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

function FilterPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <Button type="button" size="xs" variant="outline" aria-pressed={active} onClick={onClick} className={active ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--ink)]/85 hover:text-[var(--paper)]' : 'border-[var(--line)] bg-white'}>{label}</Button>;
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return <div><p className="mb-1.5 text-xs font-medium">{label}</p><div className="flex flex-wrap gap-1">{children}</div></div>;
}

function RangeFilter({ label, min, max, ceiling, step = 1, onMinChange, onMaxChange }: { label: string; min: number; max: number; ceiling: number; step?: number; onMinChange: (value: number) => void; onMaxChange: (value: number) => void }) {
  return <div><p className="text-xs font-medium">{label}</p><p className="mt-1 text-[11px] text-[var(--muted)]">{min} 〜 {max}</p><div className="mt-1 grid grid-cols-2 gap-2"><input aria-label={label + 'の下限'} type="range" min="0" max={ceiling} step={step} value={min} onChange={(event) => onMinChange(Math.min(Number(event.target.value), max))} /><input aria-label={label + 'の上限'} type="range" min="0" max={ceiling} step={step} value={max} onChange={(event) => onMaxChange(Math.max(Number(event.target.value), min))} /></div></div>;
}

function CatalogCardCounter({ label, count, onDecrease, onIncrease }: { label: string; count: number; onDecrease: () => void; onIncrease: () => void }) {
  return <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-white">
    <h3 className="border-b border-[var(--line)] px-2 py-1 text-center text-[11px] font-medium tracking-wide text-[var(--muted)]">{label}</h3>
    <div className="grid grid-cols-[1fr_1.1fr_1fr]">
      <Button type="button" variant="ghost" disabled={count === 0} onClick={onDecrease} aria-label={label + 'から1枚減らす'} className="h-9 rounded-none border-r border-[var(--line)] text-lg text-[var(--muted)]">−</Button>
      <output aria-label={label + 'に入っている枚数'} className="grid h-9 place-items-center font-display text-xl">{count}</output>
      <Button type="button" variant="ghost" onClick={onIncrease} aria-label={label + 'に1枚追加する'} className="h-9 rounded-none border-l border-[var(--line)] text-lg text-[var(--ink)]">＋</Button>
    </div>
  </section>;
}

export default function Home() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [activeDeck, setActiveDeck] = useState<Deck>(initialDeck);
  const [query, setQuery] = useState('');
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
  const [activeTab, setActiveTab] = useState<AppTab>('cards');
  const [localDataReady, setLocalDataReady] = useState(false);
  const [notice, setNotice] = useState('カードを追加して、あなたの最初のデッキを作りましょう。');
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

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(localStorageKey);
      if (!saved) return;
      const savedArchive = JSON.parse(saved) as ArchiveData | LegacyArchiveData;
      if (savedArchive.version === 2) {
        setDecks(savedArchive.decks);
        setActiveDeck({ ...savedArchive.draft, main: { ...savedArchive.draft.main }, side: { ...savedArchive.draft.side }, isSaved: false });
        setNotice('保存済みデッキと作業中のレシピを読み込みました。');
      } else if (savedArchive.version === 1 && savedArchive.decks.length > 0) {
        const legacyDraft = savedArchive.decks.find((deck) => !deck.isSaved);
        setDecks(savedArchive.decks.filter((deck) => deck.isSaved));
        if (legacyDraft) setActiveDeck(copyDeckAsDraft(legacyDraft));
        setNotice('保存済みデッキを読み込みました。');
      }
    } catch {
      setNotice('この端末の保存データを読み込めませんでした。');
    } finally {
      setLocalDataReady(true);
    }
  }, []);

  useEffect(() => {
    if (!localDataReady) return;
    try {
      window.localStorage.setItem(localStorageKey, JSON.stringify(archive));
    } catch {
      setNotice('この端末に保存できませんでした。バックアップを作成してください。');
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
      setNotice('空のデッキはマイデッキに保存できません。カードを追加してから保存してください。');
      return;
    }
    const savedDeck = { ...activeDeck, id: crypto.randomUUID(), main: { ...activeDeck.main }, side: { ...activeDeck.side }, updatedAt: new Date().toISOString(), isSaved: true };
    setDecks((previous) => [savedDeck, ...previous]);
    setNotice('「' + (activeDeck.name || '名前のないデッキ') + '」をマイデッキに保存しました。');
  };
  const selectCard = (cardId: string) => {
    setSelectedCardId(cardId);
  };
  const resetCardSearch = () => {
    setQuery(''); setSelectedTypes([]); setSelectedColors([]); setSelectedRarities([]); setSelectedReleases([]); setSelectedKeywords([]);
    setLevelMin(0); setLevelMax(maxCardLevel); setPowerMin(0); setPowerMax(powerFilterCeiling); setSortBy('official'); setSortDirection('asc'); setCatalogLimit(80);
  };
  const createDeck = () => {
    const created = newDeck(decks.length + 1);
    setActiveDeck(created); setActiveTab('recipe');
    setNotice('空のデッキを作成しました。');
  };
  const startRenamingDeck = (deck: Deck) => {
    setRenamingDeckId(deck.id);
    setRenamingDeckName(deck.name);
  };
  const saveDeckName = () => {
    if (!renamingDeckId) return;
    setDecks((previous) => previous.map((deck) => deck.id === renamingDeckId
      ? { ...deck, name: renamingDeckName.trim(), updatedAt: new Date().toISOString() } : deck));
    setRenamingDeckId(null);
    setNotice('デッキ名を変更しました。');
  };
  const deleteSavedDeck = (deckId: string) => {
    const deck = decks.find((item) => item.id === deckId);
    if (!deck || !window.confirm('「' + (deck.name || '名前のないデッキ') + '」を削除しますか？')) return;
    setDecks((previous) => previous.filter((item) => item.id !== deckId));
    setRenamingDeckId(null);
    setNotice('マイデッキから削除しました。');
  };
  const clearActiveDeck = () => {
    updateActiveDeck((deck) => ({ ...deck, name: '', main: {}, side: {} }));
    setNotice('編集中のレシピとデッキ名をクリアしました。');
  };
  const downloadBackup = () => {
    const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'deckbook-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    link.click(); URL.revokeObjectURL(url);
    setNotice('復旧用バックアップをダウンロードしました。');
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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="border-[var(--line)] bg-white/70" onClick={downloadBackup}>↓ バックアップ</Button>
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
          <div className="relative mb-3"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">⌕</span><Input value={query} onChange={(event) => { setQuery(event.target.value); setCatalogLimit(80); }} placeholder="名前・能力文・特性・カード番号で検索" className="h-10 border-[var(--line)] bg-white pl-9" /></div>
          <details className="mb-3 rounded-xl border border-[var(--line)] bg-white/80">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium marker:content-none"><span>⌘ 条件で絞り込む</span><span className={activeFilterCount > 0 ? 'rounded-full bg-[var(--red)] px-2 py-0.5 text-[10px] text-white' : 'rounded-full bg-[var(--mist)] px-2 py-0.5 text-[10px] text-[var(--muted)]'}>{activeFilterCount > 0 ? activeFilterCount + '件選択中' : 'すべて'}</span></summary>
            <div className="space-y-4 border-t border-[var(--line)] px-3 pb-3 pt-3">
              <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium">絞り込み条件</p><Button size="xs" variant="ghost" className="text-[var(--red)]" onClick={resetCardSearch}>リセット</Button></div>
              <FilterGroup label="種類">{cardTypes.map((type) => <FilterPill key={type} label={type} active={selectedTypes.includes(type)} onClick={() => { setSelectedTypes((values) => toggleFilterValue(values, type)); setCatalogLimit(80); }} />)}</FilterGroup>
              <FilterGroup label="色">{colorOptions.map((color) => <FilterPill key={color} label={color === '無' ? '無色' : color} active={selectedColors.includes(color)} onClick={() => { setSelectedColors((values) => toggleFilterValue(values, color)); setCatalogLimit(80); }} />)}</FilterGroup>
              <FilterGroup label="レアリティ">{rarityOptions.map((rarity) => <FilterPill key={rarity} label={rarity} active={selectedRarities.includes(rarity)} onClick={() => { setSelectedRarities((values) => toggleFilterValue(values, rarity)); setCatalogLimit(80); }} />)}</FilterGroup>
              <FilterGroup label="収録">{releaseOptions.map((release) => <FilterPill key={release} label={releaseLabel(release)} active={selectedReleases.includes(release)} onClick={() => { setSelectedReleases((values) => toggleFilterValue(values, release)); setCatalogLimit(80); }} />)}</FilterGroup>
              <FilterGroup label="特性・能力語・遺業">{abilityKeywordOptions.map((keyword) => <FilterPill key={keyword} label={keyword} active={selectedKeywords.includes(keyword)} onClick={() => { setSelectedKeywords((values) => toggleFilterValue(values, keyword)); setCatalogLimit(80); }} />)}</FilterGroup>
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
          <div className="max-h-[calc(100vh-180px)] space-y-2 overflow-y-auto pr-1 lg:max-h-[calc(100vh-180px)]">
            {visibleCards.map((card) => {
              const mainInDeck = activeDeck.main[card.id] ?? 0;
              const sideInDeck = activeDeck.side[card.id] ?? 0;
              const inDeck = mainInDeck + sideInDeck;
              return <article key={card.id} className="rounded-xl border border-transparent bg-[var(--soft)] p-3 transition hover:border-[var(--line)] hover:bg-white">
                <button type="button" onClick={() => selectCard(card.id)} aria-label={card.name + 'の詳細を開く'} className="group w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--red)]">
                  <div className="flex items-start gap-3">
                    <img src={card.imageUrl} alt={card.name + 'のカード画像'} loading="lazy" className="h-[92px] w-[66px] shrink-0 rounded-md border border-black/15 bg-white object-cover object-top shadow-sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2"><div><h2 className="font-display text-[15px] tracking-wide">{card.name}</h2><p className="mt-0.5 text-[11px] text-[var(--muted)]">{card.cardType} · {card.id} · {card.rarity} · {card.color} · Lv.{card.level ?? '-'}</p></div>{inDeck > 0 && <span className="rounded-full bg-[var(--ink)] px-2 py-0.5 text-[10px] font-medium text-white">計×{inDeck}</span>}</div>
                      <p className="mt-1 text-[10px] text-[var(--muted)]">{card.release}{card.power !== null ? ' · パワー ' + card.power : ''}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{card.description || card.trait || '公式カード情報'}</p>
                      <p className="mt-2 text-[11px] font-medium text-[var(--red)]">カード詳細を見る</p>
                    </div>
                  </div>
                </button>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <CatalogCardCounter label="メイン" count={mainInDeck} onDecrease={() => adjustCard(card.id, 'main', -1)} onIncrease={() => adjustCard(card.id, 'main', 1)} />
                  <CatalogCardCounter label="サイド" count={sideInDeck} onDecrease={() => adjustCard(card.id, 'side', -1)} onIncrease={() => adjustCard(card.id, 'side', 1)} />
                </div>
              </article>;
            })}
            {visibleCards.length === 0 && <p className="rounded-xl bg-[var(--soft)] px-3 py-8 text-center text-xs text-[var(--muted)]">一致するカードがありません。</p>}
            {visibleCards.length < matchingCards.length && <Button variant="outline" className="w-full border-[var(--line)] bg-white" onClick={() => setCatalogLimit((limit) => limit + 80)}>さらにカードを表示（残り {matchingCards.length - visibleCards.length}件）</Button>}
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
              return isRenaming ? <div key={deck.id} className="rounded-xl bg-[var(--mist)] p-2 ring-1 ring-[var(--line)]"><label htmlFor={'deck-name-' + deck.id} className="sr-only">デッキ名</label><Input id={'deck-name-' + deck.id} value={renamingDeckName} onChange={(event) => setRenamingDeckName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveDeckName(); }} className="h-9 border-[var(--line)] bg-white text-sm" autoFocus /><div className="mt-2 flex justify-end gap-1"><Button size="xs" variant="ghost" onClick={() => setRenamingDeckId(null)}>キャンセル</Button><Button size="xs" onClick={saveDeckName}>変更を保存</Button></div></div> : <div key={deck.id} className="flex items-center gap-1 rounded-xl transition hover:bg-[var(--soft)]">
                <button type="button" onClick={() => { setActiveDeck(copyDeckAsDraft(deck)); setActiveTab('recipe'); setNotice('マイデッキを作業用レシピに読み込みました。変更は保存済みデッキへ反映されません。'); }} className="min-w-0 flex-1 px-3 py-2.5 text-left"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{deck.name || '名前のないデッキ'}</span></span><span className="mt-1 block text-[11px] text-[var(--muted)]">メイン {countCards(deck.main)}枚 · サイド {countCards(deck.side)}枚</span></button>
                <div className="flex shrink-0 gap-0.5 pr-1"><Button type="button" size="icon-xs" variant="ghost" className="text-[var(--muted)]" onClick={() => startRenamingDeck(deck)} aria-label={deck.name + 'の名前を変更'}>✎</Button><Button type="button" size="icon-xs" variant="ghost" className="text-[var(--red)] hover:text-[var(--red)]" onClick={() => deleteSavedDeck(deck.id)} aria-label={deck.name + 'を削除'}>×</Button></div>
              </div>;
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
            <section><h2 className="font-display text-lg">バックアップ</h2><p className="mt-1 text-[var(--muted)]">上部の「バックアップ」から、現在のマイデッキをJSONファイルとして控えられます。ブラウザのデータを消す前に作成してください。</p></section>
            <section className="rounded-xl bg-[var(--soft)] p-4 text-xs text-[var(--muted)]"><p className="font-medium text-[var(--ink)]">公式カードデータについて</p><p className="mt-1">全576種の名称・能力文と画像はイジンデン公式カードリストを参照しています。画像は公式サイトから直接表示します。</p><a className="mt-2 inline-block text-[var(--red)] underline underline-offset-2" href="https://one-draw.jp/ijinden/cardlist.html" target="_blank" rel="noreferrer">公式カードリストを開く ↗</a></section>
          </div>
        </section>}
      </div>
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
