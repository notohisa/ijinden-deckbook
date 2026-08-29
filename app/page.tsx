'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Pile = 'main' | 'side';
type Card = { id: string; name: string; category: string; color: string; level: number; description: string };
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

const cards: Card[] = [
  { id: 'scarlet-vanguard', name: '緋の先駆者', category: '人物', color: '赤', level: 2, description: '登場時、山札の上から1枚を見る。' },
  { id: 'blue-archive', name: '蒼海の書庫', category: '拠点', color: '青', level: 1, description: 'ターン終了時、カードを1枚引く。' },
  { id: 'golden-queen', name: '黄金の女王', category: '人物', color: '黄', level: 4, description: 'あなたの人物すべてに加護を与える。' },
  { id: 'verdant-path', name: '翠の道標', category: '術', color: '緑', level: 2, description: '山札からレベル2以下の人物を探す。' },
  { id: 'moonlit-oath', name: '月影の誓い', category: '術', color: '紫', level: 3, description: '選んだカードを手札へ戻す。' },
  { id: 'white-citadel', name: '白銀の城塞', category: '拠点', color: '白', level: 3, description: '次に受けるダメージを1減らす。' },
  { id: 'raven-scout', name: '夜鴉の斥候', category: '人物', color: '黒', level: 1, description: '相手の手札を1枚確認する。' },
  { id: 'clockwork-compass', name: '時計仕掛けの羅針盤', category: '道具', color: '青', level: 2, description: '使用後、カードを1枚引く。' },
  { id: 'crimson-rally', name: '紅蓮の号令', category: '術', color: '赤', level: 2, description: 'このターン、人物1体の力を上げる。' },
];
const sampleDeck: Deck = {
  id: 'sample-deck', name: 'はじめてのデッキ',
  main: { 'scarlet-vanguard': 3, 'blue-archive': 2, 'golden-queen': 2, 'verdant-path': 2, 'raven-scout': 3, 'clockwork-compass': 2, 'crimson-rally': 3 },
  side: { 'white-citadel': 2, 'moonlit-oath': 1 },
  updatedAt: '2026-08-29T10:00:00.000Z',
};
const driveScope = 'https://www.googleapis.com/auth/drive.appdata';
const driveFileName = 'deckbook-data.json';
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const countCards = (cardsInPile: Record<string, number>) => Object.values(cardsInPile).reduce((total, count) => total + count, 0);

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

export default function Home() {
  const [decks, setDecks] = useState<Deck[]>([sampleDeck]);
  const [activeDeckId, setActiveDeckId] = useState(sampleDeck.id);
  const [query, setQuery] = useState('');
  const [mobileCardsOpen, setMobileCardsOpen] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>('local');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [notice, setNotice] = useState('カードを追加して、あなたの最初のデッキを作りましょう。');
  const initializedCloud = useRef(false);
  const activeDeck = decks.find((deck) => deck.id === activeDeckId) ?? decks[0];
  const mainCount = countCards(activeDeck.main);
  const sideCount = countCards(activeDeck.side);
  const matchingCards = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return cards;
    return cards.filter((card) => (card.name + ' ' + card.category + ' ' + card.color + ' ' + card.description).toLowerCase().includes(normalized));
  }, [query]);
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
        <section className={(mobileCardsOpen ? 'block ' : 'hidden ') + 'rounded-2xl border border-[var(--line)] bg-white/70 p-3 shadow-[0_12px_30px_rgb(33_38_45/0.04)] lg:block'} aria-label="カードを探す">
          <div className="mb-3 flex items-center justify-between gap-3 px-1 pt-1">
            <div><p className="label">CARD CATALOG</p><h1 className="font-display mt-1 text-xl tracking-wide">カードを探す</h1></div>
            <span className="rounded-full bg-[var(--mist)] px-2 py-1 text-[11px] text-[var(--muted)]">{matchingCards.length}件</span>
          </div>
          <div className="relative mb-3"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">⌕</span><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名前・色・種類で検索" className="h-10 border-[var(--line)] bg-white pl-9" /></div>
          <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1 lg:max-h-[calc(100vh-180px)]">
            {matchingCards.map((card) => {
              const inDeck = (activeDeck.main[card.id] ?? 0) + (activeDeck.side[card.id] ?? 0);
              return <article key={card.id} className="group rounded-xl border border-transparent bg-[var(--soft)] p-3 transition hover:border-[var(--line)] hover:bg-white">
                <div className="flex items-start gap-3">
                  <div className={'card-sigil sigil-' + card.color + ' shrink-0'} aria-hidden="true">{card.level}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2"><div><h2 className="font-display text-[15px] tracking-wide">{card.name}</h2><p className="mt-0.5 text-[11px] text-[var(--muted)]">{card.color} · {card.category} · Lv.{card.level}</p></div>{inDeck > 0 && <span className="rounded-full bg-[var(--ink)] px-2 py-0.5 text-[10px] font-medium text-white">×{inDeck}</span>}</div>
                    <p className="mt-2 line-clamp-1 text-xs leading-5 text-[var(--muted)]">{card.description}</p>
                    <div className="mt-2.5 flex gap-1.5"><Button size="sm" variant="outline" className="h-7 border-[var(--line)] bg-white text-[11px]" onClick={() => adjustCard(card.id, 'main', 1)}>＋ メイン</Button><Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => adjustCard(card.id, 'side', 1)}>＋ サイド</Button></div>
                  </div>
                </div>
              </article>;
            })}
          </div>
        </section>

        <section className="min-w-0 rounded-2xl border border-[var(--line)] bg-white/85 shadow-[0_16px_40px_rgb(33_38_45/0.06)]" aria-label="編集中のデッキ">
          <div className="border-b border-[var(--line)] px-4 py-4 sm:px-5">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="label">NOW EDITING</p><Input aria-label="デッキ名" value={activeDeck.name} onChange={(event) => updateActiveDeck((deck) => ({ ...deck, name: event.target.value }))} className="mt-1 h-auto border-0 bg-transparent px-0 py-0 font-display text-2xl tracking-[0.06em] shadow-none focus-visible:ring-0" /></div><Button variant="ghost" size="icon" className="shrink-0 text-[var(--muted)] hover:text-[var(--red)]" onClick={deleteDeck} aria-label="このデッキを削除">⌫</Button></div>
            <div className="mt-4 grid grid-cols-3 divide-x divide-[var(--line)] rounded-xl border border-[var(--line)] bg-[var(--soft)]">
              <div className="px-3 py-2 text-center"><p className="text-[10px] tracking-wide text-[var(--muted)]">MAIN</p><p className="font-display text-2xl">{mainCount}</p></div>
              <div className="px-3 py-2 text-center"><p className="text-[10px] tracking-wide text-[var(--muted)]">SIDE</p><p className="font-display text-2xl">{sideCount}</p></div>
              <div className="px-3 py-2 text-center"><p className="text-[10px] tracking-wide text-[var(--muted)]">STATUS</p><p className={'pt-1 text-xs font-medium ' + (mainCount === 40 ? 'text-[var(--green)]' : 'text-[var(--red)]')}>{mainCount === 40 ? '完成' : String(40 - mainCount) + '枚あと'}</p></div>
            </div>
          </div>
          <div className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between lg:hidden"><button type="button" className="flex items-center gap-2 text-sm font-medium" onClick={() => setMobileCardsOpen((open) => !open)}>☰ {mobileCardsOpen ? 'カード一覧を閉じる' : 'カードを追加する'}</button><span className="text-xs text-[var(--muted)]">検索・追加</span></div>
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
        </aside>
      </div>
      <footer className="mx-auto max-w-[1480px] px-4 pb-8 pt-2 text-center text-[11px] tracking-wide text-[var(--muted)] sm:px-6"><span className="inline-flex items-center gap-1.5">✦ デッキ帳は、あなたのカードデータをあなたのGoogle Driveに保存します。</span></footer>
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
        <div className={'card-sigil sigil-' + card.color + ' size-7 text-[10px]'} aria-hidden="true">{card.level}</div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{card.name}</p><p className="text-[10px] text-[var(--muted)]">{card.color} · {card.category}</p></div>
        <div className="flex items-center gap-1"><Button size="icon-xs" variant="ghost" onClick={() => onAdjust(card.id, pile, -1)} aria-label={card.name + 'を1枚減らす'}>−</Button><span className="w-5 text-center font-display text-lg">{count}</span><Button size="icon-xs" variant="ghost" onClick={() => onAdjust(card.id, pile, 1)} aria-label={card.name + 'を1枚増やす'}>＋</Button></div>
      </div>)}
    </div>}
  </section>;
}
