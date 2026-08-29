'use client';

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ijindenCards, type IjindenCard } from '@/app/ijinden-cards';

type Pile = 'main' | 'side';
type Card = IjindenCard;
type Deck = { id: string; name: string; main: Record<string, number>; side: Record<string, number>; updatedAt: string };
type ArchiveData = { version: 1; updatedAt: string; decks: Deck[] };
type SyncState = 'local' | 'syncing' | 'saved' | 'error';
type GoogleTokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };
type GoogleTokenResponse = { access_token?: string; error?: string };

declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient: (options: {
      client_id: string; scope: string; callback: (response: GoogleTokenResponse) => void;
    }) => GoogleTokenClient } } };
  }
}

const cards: Card[] = ijindenCards;
const cardTypes = ['イジン', 'ハイケイ', 'マホウ', 'マリョク'] as const;
type CardType = (typeof cardTypes)[number];
type SortBy = 'official' | 'level' | 'power' | 'type' | 'color' | 'name';
const colorOptions = ['赤', '青', '緑', '黄', '紫', '無'] as const;
const abilityKeywordOptions = ['剣術', '美術', '音楽', '思想', '医術', '志願', '航海', '執筆', '決起', '徴募', '魔導', '勝鬨', '躍進', '魔力化', '冥府発動', '復元', '反魂', '木霊', '喪神'];
const sortOptions: Array<{ value: SortBy; label: string }> = [
  { value: 'official', label: '公式順' }, { value: 'level', label: 'レベル順' }, { value: 'power', label: 'パワー順' },
  { value: 'type', label: '種類順' }, { value: 'color', label: '色順' }, { value: 'name', label: '名前順' },
];
const cardsById = new Map(cards.map((card) => [card.id, card]));
const cardOrder = new Map(cards.map((card, index) => [card.id, index]));
const releaseOptions = Array.from(new Set(cards.map((card) => card.release)));
const rarityOptions = Array.from(new Set(cards.map((card) => card.rarity))).sort((a, b) => ['C', 'N', 'm', 'R', 'SR', 'PSR'].indexOf(a) - ['C', 'N', 'm', 'R', 'SR', 'PSR'].indexOf(b));
const initialDeck: Deck = { id: 'new-deck', name: '新しいデッキ', main: {}, side: {}, updatedAt: new Date().toISOString() };
const driveScope = 'https://www.googleapis.com/auth/drive.appdata';
const driveFileName = 'deckbook-data.json';
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
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
  return { id: crypto.randomUUID(), name: '新しいデッキ ' + String(index), main: {}, side: {}, updatedAt: new Date().toISOString() };
}

function loadGoogleIdentity() {
  return new Promise<void>((resolve, reject) => {
    if (window.google) return resolve();
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-identity]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google identity load failed')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true; script.dataset.googleIdentity = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google identity load failed'));
    document.head.appendChild(script);
  });
}

async function findDriveFile(token: string) {
  const query = encodeURIComponent("name = '" + driveFileName + "' and trashed = false");
  const response = await fetch(
    'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=' + query + '&fields=files(id,name,modifiedTime)',
    { headers: { Authorization: 'Bearer ' + token } },
  );
  if (!response.ok) throw new Error('Driveの保存データを確認できませんでした。');
  const result = await response.json() as { files?: Array<{ id: string }> };
  return result.files?.[0];
}

async function uploadToDrive(token: string, archive: ArchiveData) {
  const existingFile = await findDriveFile(token);
  const boundary = 'deckbook_' + crypto.randomUUID();
  const metadata = existingFile
    ? { name: driveFileName, mimeType: 'application/json' }
    : { name: driveFileName, mimeType: 'application/json', parents: ['appDataFolder'] };
  const body = [
    '--' + boundary, 'Content-Type: application/json; charset=UTF-8', '',
    JSON.stringify(metadata), '--' + boundary, 'Content-Type: application/json; charset=UTF-8', '',
    JSON.stringify(archive), '--' + boundary + '--', '',
  ].join('\r\n');
  const endpoint = existingFile
    ? 'https://www.googleapis.com/upload/drive/v3/files/' + existingFile.id + '?uploadType=multipart'
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  const response = await fetch(endpoint, {
    method: existingFile ? 'PATCH' : 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + boundary },
    body,
  });
  if (!response.ok) throw new Error('Driveへの保存に失敗しました。');
}

async function readFromDrive(token: string) {
  const existingFile = await findDriveFile(token);
  if (!existingFile) return null;
  const response = await fetch('https://www.googleapis.com/drive/v3/files/' + existingFile.id + '?alt=media', {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!response.ok) throw new Error('Driveの保存データを読み込めませんでした。');
  const archive = await response.json() as ArchiveData;
  if (archive.version !== 1 || !Array.isArray(archive.decks)) throw new Error('保存データの形式を確認できませんでした。');
  return archive;
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

function CardCounter({ label, count, onDecrease, onIncrease }: { label: string; count: number; onDecrease: () => void; onIncrease: () => void }) {
  return <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
    <h3 className="border-b border-[var(--line)] px-3 py-2 text-center font-display text-lg tracking-wide">{label}</h3>
    <div className="grid grid-cols-[1fr_1.1fr_1fr]">
      <Button type="button" variant="ghost" disabled={count === 0} onClick={onDecrease} className="h-14 rounded-none border-r border-[var(--line)] text-2xl text-[var(--muted)]">−</Button>
      <output aria-label={label + 'に入っている枚数'} className="grid h-14 place-items-center font-display text-3xl">{count}</output>
      <Button type="button" variant="ghost" onClick={onIncrease} className="h-14 rounded-none border-l border-[var(--line)] text-2xl text-[var(--ink)]">＋</Button>
    </div>
  </section>;
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
  const [decks, setDecks] = useState<Deck[]>([initialDeck]);
  const [activeDeckId, setActiveDeckId] = useState(initialDeck.id);
  const [query, setQuery] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<CardType[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedRarities, setSelectedRarities] = useState<string[]>([]);
  const [selectedReleases, setSelectedReleases] = useState<string[]>([]);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [levelMin, setLevelMin] = useState(0);
  const [levelMax, setLevelMax] = useState(17);
  const [powerMin, setPowerMin] = useState(0);
  const [powerMax, setPowerMax] = useState(10000);
  const [sortBy, setSortBy] = useState<SortBy>('official');
  const [catalogLimit, setCatalogLimit] = useState(80);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [mobileCardsOpen, setMobileCardsOpen] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>('local');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [notice, setNotice] = useState('カードを追加して、あなたの最初のデッキを作りましょう。');
  const initializedCloud = useRef(false);
  const activeDeck = decks.find((deck) => deck.id === activeDeckId) ?? decks[0];
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
      const nameOrder = left.name.localeCompare(right.name, 'ja');
      if (sortBy === 'level') return (left.level ?? 99) - (right.level ?? 99) || nameOrder;
      if (sortBy === 'power') return (left.power ?? 99999) - (right.power ?? 99999) || nameOrder;
      if (sortBy === 'type') return cardTypes.indexOf(left.cardType) - cardTypes.indexOf(right.cardType) || nameOrder;
      if (sortBy === 'color') return colorOptions.findIndex((color) => left.color.includes(color)) - colorOptions.findIndex((color) => right.color.includes(color)) || nameOrder;
      if (sortBy === 'name') return nameOrder;
      return (cardOrder.get(left.id) ?? 0) - (cardOrder.get(right.id) ?? 0);
    });
  }, [levelMax, levelMin, powerMax, powerMin, query, selectedColors, selectedKeywords, selectedRarities, selectedReleases, selectedTypes, sortBy]);
  const visibleCards = useMemo(() => matchingCards.slice(0, catalogLimit), [catalogLimit, matchingCards]);
  const selectedCard = useMemo(() => cards.find((card) => card.id === selectedCardId) ?? null, [selectedCardId]);
  const selectedMainCount = selectedCard ? activeDeck.main[selectedCard.id] ?? 0 : 0;
  const selectedSideCount = selectedCard ? activeDeck.side[selectedCard.id] ?? 0 : 0;
  const activeFilterCount = selectedTypes.length + selectedColors.length + selectedRarities.length + selectedReleases.length + selectedKeywords.length + Number(levelMin !== 0 || levelMax !== 17) + Number(powerMin !== 0 || powerMax !== 10000);
  const archive = useMemo<ArchiveData>(() => ({ version: 1, updatedAt: new Date().toISOString(), decks }), [decks]);
  const persist = async (token: string, sourceArchive = archive) => {
    setSyncState('syncing');
    try {
      await uploadToDrive(token, sourceArchive);
      setSyncState('saved'); setNotice('Google Driveに安全に保存しました。');
    } catch (error) {
      setSyncState('error'); setNotice(error instanceof Error ? error.message : 'Driveへの保存に失敗しました。');
    }
  };

  useEffect(() => {
    if (!accessToken || !initializedCloud.current) return;
    const timer = window.setTimeout(() => { void persist(accessToken); }, 900);
    return () => window.clearTimeout(timer);
  }, [accessToken, decks]);

  const connectGoogleDrive = async () => {
    if (!googleClientId) {
      setNotice('公開前に Google OAuth クライアントIDを設定してください。');
      setSyncState('error');
      return;
    }
    try {
      setSyncState('syncing'); await loadGoogleIdentity();
      const token = await new Promise<string>((resolve, reject) => {
        const client = window.google?.accounts.oauth2.initTokenClient({
          client_id: googleClientId, scope: driveScope,
          callback: (response) => response.error || !response.access_token
            ? reject(new Error('Google Driveの連携を完了できませんでした。'))
            : resolve(response.access_token as string),
        });
        if (!client) return reject(new Error('Googleログインを開始できませんでした。'));
        client.requestAccessToken({ prompt: 'consent' });
      });
      const saved = await readFromDrive(token);
      if (saved?.decks.length) {
        setDecks(saved.decks); setActiveDeckId(saved.decks[0].id);
        setNotice('Google Driveからマイデッキを読み込みました。'); setSyncState('saved');
      } else {
        await persist(token);
      }
      initializedCloud.current = true; setAccessToken(token);
    } catch (error) {
      setSyncState('error'); setNotice(error instanceof Error ? error.message : 'Google Driveに接続できませんでした。');
    }
  };

  const updateActiveDeck = (updater: (deck: Deck) => Deck) => setDecks((previous) =>
    previous.map((deck) => deck.id === activeDeckId
      ? { ...updater(deck), updatedAt: new Date().toISOString() } : deck),
  );
  const adjustCard = (cardId: string, pile: Pile, difference: number) => updateActiveDeck((deck) => {
    const currentPile = { ...deck[pile] };
    const next = Math.max(0, (currentPile[cardId] ?? 0) + difference);
    if (next === 0) delete currentPile[cardId]; else currentPile[cardId] = next;
    return { ...deck, [pile]: currentPile };
  });
  const selectCard = (cardId: string) => {
    setSelectedCardId(cardId);
    setMobileCardsOpen(false);
  };
  const addSelectedCard = (pile: Pile) => {
    if (!selectedCard) return;
    adjustCard(selectedCard.id, pile, 1);
    setNotice(selectedCard.name + 'を' + (pile === 'main' ? 'メインデッキ' : 'サイドデッキ') + 'に追加しました。');
  };
  const removeSelectedCard = (pile: Pile) => {
    if (!selectedCard) return;
    adjustCard(selectedCard.id, pile, -1);
    setNotice(selectedCard.name + 'を' + (pile === 'main' ? 'メインデッキ' : 'サイドデッキ') + 'から1枚減らしました。');
  };
  const resetCardSearch = () => {
    setQuery(''); setSelectedTypes([]); setSelectedColors([]); setSelectedRarities([]); setSelectedReleases([]); setSelectedKeywords([]);
    setLevelMin(0); setLevelMax(17); setPowerMin(0); setPowerMax(10000); setSortBy('official'); setCatalogLimit(80);
  };
  const createDeck = () => {
    const created = newDeck(decks.length + 1);
    setDecks((previous) => [created, ...previous]); setActiveDeckId(created.id);
    setNotice('空のデッキを作成しました。');
  };
  const deleteDeck = () => {
    if (decks.length === 1) return setNotice('最後の1つのデッキは削除できません。');
    const remaining = decks.filter((deck) => deck.id !== activeDeckId);
    setDecks(remaining); setActiveDeckId(remaining[0].id);
    setNotice('デッキを削除しました。Drive連携中なら自動保存されます。');
  };
  const downloadBackup = () => {
    const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'deckbook-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    link.click(); URL.revokeObjectURL(url);
    setNotice('復旧用バックアップをダウンロードしました。');
  };
  const syncLabel = { local: 'この端末で編集中', syncing: 'Driveへ保存中…', saved: 'Google Driveに保存済み', error: 'Drive設定が必要です' }[syncState];
  const saveOrConnect = () => void (accessToken ? persist(accessToken) : connectGoogleDrive());

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--paper)] text-[var(--ink)]">
      <div className="page-grain" aria-hidden="true" />
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[#f4f0e7]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--ink)] text-lg text-[var(--paper)] shadow-[3px_3px_0_var(--red)]">◆</div>
            <div className="min-w-0"><p className="font-display text-lg leading-none tracking-[0.08em]">デッキ帳</p><p className="mt-1 text-[10px] tracking-[0.12em] text-[var(--muted)]">YOUR DECK, YOUR DRIVE</p></div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-[var(--line)] bg-white/60 px-3 py-1.5 text-xs text-[var(--muted)] md:flex">
            <span className={syncState === 'saved' ? 'text-[var(--green)]' : ''}>{syncState === 'saved' ? '✓' : '☁'}</span>{syncLabel}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="hidden border-[var(--line)] bg-white/70 sm:flex" onClick={downloadBackup}>↓ バックアップ</Button>
            <Button className="bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--ink)]/85" onClick={saveOrConnect}>☁<span className="hidden sm:inline">{accessToken ? '今すぐ保存' : 'Google Driveに保存'}</span><span className="sm:hidden">保存</span></Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1480px] gap-5 px-4 py-5 lg:grid-cols-[minmax(290px,0.85fr)_minmax(420px,1.4fr)_minmax(240px,0.65fr)] lg:px-6">
        <section className={(mobileCardsOpen ? 'fixed inset-x-0 bottom-0 top-16 z-40 block overflow-y-auto rounded-t-2xl border-t border-[var(--line)] bg-[#f4f0e7] p-3 shadow-[0_-12px_30px_rgb(33_38_45/0.12)] ' : 'hidden ') + 'lg:relative lg:inset-auto lg:z-auto lg:block lg:overflow-visible lg:rounded-2xl lg:border lg:border-[var(--line)] lg:bg-white/70 lg:shadow-[0_12px_30px_rgb(33_38_45/0.04)]'} aria-label="カードを探す">
          <div className="mb-3 flex items-center justify-between gap-3 px-1 pt-1">
            <div><p className="label">CARD CATALOG</p><h1 className="font-display mt-1 text-xl tracking-wide">カードを探す</h1></div>
            <div className="flex items-center gap-2"><span className="rounded-full bg-[var(--mist)] px-2 py-1 text-[11px] text-[var(--muted)]">{matchingCards.length}件</span><Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setMobileCardsOpen(false)}>閉じる</Button></div>
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
                <RangeFilter label="レベル" min={levelMin} max={levelMax} ceiling={17} onMinChange={setLevelMin} onMaxChange={setLevelMax} />
                <RangeFilter label="パワー（イジンのみ）" min={powerMin} max={powerMax} ceiling={10000} step={500} onMinChange={setPowerMin} onMaxChange={setPowerMax} />
              </div>
              <div><label htmlFor="card-sort" className="text-xs font-medium">並べ替え</label><select id="card-sort" value={sortBy} onChange={(event) => setSortBy(event.target.value as SortBy)} className="mt-1 h-8 w-full rounded-lg border border-[var(--line)] bg-white px-2 text-xs">{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
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
        </section>

        <section className="min-w-0 rounded-2xl border border-[var(--line)] bg-white/85 shadow-[0_16px_40px_rgb(33_38_45/0.06)]" aria-label="編集中のデッキ">
          <div className="border-b border-[var(--line)] px-4 py-4 sm:px-5">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="label">NOW EDITING</p><Input aria-label="デッキ名" value={activeDeck.name} onChange={(event) => updateActiveDeck((deck) => ({ ...deck, name: event.target.value }))} className="mt-1 h-auto border-0 bg-transparent px-0 py-0 font-display text-2xl tracking-[0.06em] shadow-none focus-visible:ring-0" /></div><Button variant="ghost" size="icon" className="shrink-0 text-[var(--muted)] hover:text-[var(--red)]" onClick={deleteDeck} aria-label="このデッキを削除">⌫</Button></div>
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
            <div className="mb-4 lg:hidden"><Button type="button" variant="outline" className="w-full border-[var(--line)] bg-[var(--paper)]" onClick={() => setMobileCardsOpen((open) => !open)}>⌕ {mobileCardsOpen ? 'カード一覧を閉じる' : 'カードを探して追加する'}</Button></div>
            <DeckPile title="メインデッキ" pile="main" deck={activeDeck} onAdjust={adjustCard} />
            <DeckPile title="サイドデッキ" pile="side" deck={activeDeck} onAdjust={adjustCard} />
          </div>
          <div className="border-t border-[var(--line)] bg-[var(--soft)] px-4 py-3 sm:px-5"><p className="flex items-start gap-2 text-xs leading-5 text-[var(--muted)]"><span className="text-[var(--green)]">●</span>{notice}</p></div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--ink)] p-4 text-[var(--paper)] shadow-[4px_4px_0_var(--red)]">
            <div className="flex items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10">☁</div><div><p className="text-[10px] font-semibold tracking-[0.13em] text-white/60">PRIVATE CLOUD SAVE</p><h2 className="font-display mt-1 text-lg tracking-wide">あなたのDriveへ</h2></div></div>
            <p className="mt-3 text-xs leading-5 text-white/70">デッキはGoogle Drive内のアプリ専用領域へ保存します。他のDriveファイルは読みません。</p>
            <Button className="mt-4 w-full bg-[var(--paper)] text-[var(--ink)] hover:bg-white" onClick={saveOrConnect}>{accessToken ? '☁ ' : '↥ '}{accessToken ? '変更をDriveへ保存' : 'Google Driveを連携'}</Button>
            {!googleClientId && <p className="mt-3 text-[10px] leading-4 text-[#f2d7bf]">現在は公開前デモです。OAuthクライアントIDを設定すると連携できます。</p>}
          </section>
          <section className="rounded-2xl border border-[var(--line)] bg-white/75 p-3">
            <div className="mb-2 flex items-center justify-between px-1 pt-1"><div><p className="label">MY DECKS</p><h2 className="font-display mt-1 text-lg tracking-wide">マイデッキ</h2></div><Button size="icon-sm" variant="outline" className="border-[var(--line)]" onClick={createDeck} aria-label="新しいデッキ">＋</Button></div>
            <div className="space-y-1">{decks.map((deck) => {
              const isActive = deck.id === activeDeckId;
              return <button type="button" key={deck.id} onClick={() => setActiveDeckId(deck.id)} className={'w-full rounded-xl px-3 py-2.5 text-left transition ' + (isActive ? 'bg-[var(--mist)] ring-1 ring-[var(--line)]' : 'hover:bg-[var(--soft)]')}>
                <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{deck.name || '名前のないデッキ'}</span>{isActive && <span className="shrink-0 text-[var(--green)]">✓</span>}</span><span className="mt-1 block text-[11px] text-[var(--muted)]">メイン {countCards(deck.main)}枚 · サイド {countCards(deck.side)}枚</span>
              </button>;
            })}</div>
          </section>
          <section className="rounded-2xl border border-dashed border-[var(--line)] bg-[#f4f0e7]/70 p-4">
            <div className="flex gap-3"><span className="text-[var(--red)]">▣</span><div><p className="text-sm font-medium">自分でも保管できる</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">いつでもJSONバックアップをダウンロード。機種変更時の復元にも使えます。</p></div></div>
            <Button variant="link" className="mt-2 h-auto px-0 text-[var(--red)]" onClick={downloadBackup}>↓ バックアップを作る</Button>
          </section>
          <section className="rounded-2xl border border-dashed border-[var(--line)] bg-white/60 p-4 text-xs leading-5 text-[var(--muted)]">
            <p className="font-medium text-[var(--ink)]">公式カードデータについて</p>
            <p className="mt-1">全576種の名称・能力文と画像は、イジンデン公式カードリストを参照しています。画像は公式サイトから直接表示します。</p>
            <a className="mt-2 inline-block text-[var(--red)] underline underline-offset-2" href="https://one-draw.jp/ijinden/cardlist.html" target="_blank" rel="noreferrer">公式カードリストを開く ↗</a>
          </section>
        </aside>
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
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[var(--line)] pt-4">
            <CardCounter label="メイン" count={selectedMainCount} onDecrease={() => removeSelectedCard('main')} onIncrease={() => addSelectedCard('main')} />
            <CardCounter label="サイド" count={selectedSideCount} onDecrease={() => removeSelectedCard('side')} onIncrease={() => addSelectedCard('side')} />
          </div>
          <p className="mt-2 text-center text-[11px] text-[var(--muted)]">＋／−でこのカードの枚数を直接調整できます。</p>
        </section>
      </div>}
      <footer className="mx-auto max-w-[1480px] px-4 pb-8 pt-2 text-center text-[11px] tracking-wide text-[var(--muted)] sm:px-6"><span className="inline-flex items-center gap-1.5">✦ 非公式のデッキ作成補助アプリです。デッキデータはあなたのGoogle Driveに保存します。</span></footer>
    </main>
  );
}

function DeckPile({ title, pile, deck, onAdjust }: {
  title: string; pile: Pile; deck: Deck;
  onAdjust: (cardId: string, pile: Pile, difference: number) => void;
}) {
  const entries = Object.entries(deck[pile])
    .map(([cardId, count]) => ({ card: cards.find((card) => card.id === cardId), count }))
    .filter((entry): entry is { card: Card; count: number } => Boolean(entry.card));
  return <section className="mb-6 last:mb-0">
    <div className="mb-2 flex items-center justify-between"><h2 className="font-display text-lg tracking-wide">{title}</h2><span className="text-xs text-[var(--muted)]">{countCards(deck[pile])}枚</span></div>
    {entries.length === 0 ? <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--soft)] px-4 py-6 text-center text-xs text-[var(--muted)]">左のカード一覧から追加してください</div> : <div className="overflow-hidden rounded-xl border border-[var(--line)]">
      {entries.map(({ card, count }) => <div key={card.id} className="flex items-center gap-3 border-b border-[var(--line)] bg-white px-3 py-2.5 last:border-b-0">
        <img src={card.imageUrl} alt="" className="size-9 shrink-0 rounded border border-black/15 bg-white object-cover object-top" />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{card.name}</p><p className="text-[10px] text-[var(--muted)]">{card.cardType} · {card.id} · {card.rarity} · {card.color}</p></div>
        <div className="flex items-center gap-1"><Button size="icon-xs" variant="ghost" onClick={() => onAdjust(card.id, pile, -1)} aria-label={card.name + 'を1枚減らす'}>−</Button><span className="w-5 text-center font-display text-lg">{count}</span><Button size="icon-xs" variant="ghost" onClick={() => onAdjust(card.id, pile, 1)} aria-label={card.name + 'を1枚増やす'}>＋</Button></div>
      </div>)}
    </div>}
  </section>;
}
