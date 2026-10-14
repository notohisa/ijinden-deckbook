'use client';

import { useEffect, useRef, useState } from 'react';
import type { useDeckBook } from '@/hooks/use-deck-book';
import { syncKey, type ReadyArchive } from '@/lib/deck-archive-repository';
import { loadStoredArchive, localStorageKey } from '@/lib/deck-storage';
import {
  changeRecord,
  mergeRecords,
  prepareForUpload,
  resolveConflict,
  validateSnapshot,
  type SyncConflict,
  type SyncRecord,
} from '@/lib/deck-sync';
import { createDriveClient } from '@/lib/google-drive-sync';
import {
  GOOGLE_CLIENT_ID,
  loadGoogleAuth,
  requestGoogleSession,
  type GoogleSession,
} from '@/lib/google-auth';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

export type AccountScope = { sub: string; email: string };
type Book = ReturnType<typeof useDeckBook>;
type Plan = {
  base: ReadyArchive;
  remoteKey: string;
  records: SyncRecord[];
  conflicts: SyncConflict[];
};
type Props = {
  book: Book;
  scope: AccountScope | null;
  session: GoogleSession | null;
  knownCardIds: ReadonlySet<string>;
  cardsById: ReadonlyMap<string, { name: string }>;
  onSession: (session: GoogleSession) => void;
  onDisconnect: () => void;
  notify: (message: string) => void;
};
const panelClass =
  'mx-auto mb-4 max-w-2xl rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 text-sm';

export function DriveSyncPanel({
  book,
  scope,
  session,
  knownCardIds,
  cardsById,
  onSession,
  onDisconnect,
  notify,
}: Props) {
  const [authReady, setAuthReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [choices, setChoices] = useState<Record<string, number | 'both'>>({});
  const alive = useRef(true);
  const running = useRef(false);
  /* oxlint-disable react/react-compiler -- Load the external Google authorization library only when this panel is mounted. */
  useEffect(() => {
    alive.current = true;
    if (GOOGLE_CLIENT_ID)
      void loadGoogleAuth()
        .then(() => {
          if (alive.current) setAuthReady(true);
        })
        .catch((cause: unknown) => {
          if (alive.current) setError(message(cause));
        });
    return () => {
      alive.current = false;
    };
  }, []);
  /* oxlint-enable react/react-compiler */

  function assertSession(): GoogleSession {
    if (!alive.current)
      throw new Error('接続先が変わりました。もう一度同期してください。');
    if (
      !session ||
      session.sub !== scope?.sub ||
      session.expiresAt <= Date.now() + 5000
    )
      throw new Error(
        'Googleへの再接続が必要です。「Googleに接続」を押してください。',
      );
    if (!navigator.onLine)
      throw new Error(
        'オフラインです。端末には保存されています。通信が戻ってから同期してください。',
      );
    return session;
  }

  async function perform(operation: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch (cause) {
      if (alive.current) setError(message(cause));
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  }

  function connect() {
    // This call stays in the click handler so browsers can open the Google popup.
    void perform(async () => {
      const next = await requestGoogleSession();
      if (alive.current) onSession(next);
    });
  }

  function preview() {
    void perform(async () => {
      const auth = assertSession();
      const base = await book.getSyncSnapshot();
      if (!base?.sync) throw new Error('端末の保存を確認できませんでした。');
      validateSnapshot(
        {
          format: 'ijinden-deckbook-sync',
          version: 1,
          writerId: base.sync.writerId,
          records: base.sync.records,
        },
        knownCardIds,
      );
      const remote = await createDriveClient(auth.accessToken).readAll(
        knownCardIds,
      );
      assertSession();
      const merged = mergeRecords(
        base.sync.records,
        remote.snapshots.map((s) => s.records),
      );
      // Keep the Drive candidate under the original ID when choosing both.
      for (const conflict of merged.conflicts)
        conflict.candidates.sort(
          (a, b) =>
            Number(isLocalCandidate(base, a)) -
            Number(isLocalCandidate(base, b)),
        );
      setChoices({});
      setPlan({ base, remoteKey: JSON.stringify(remote.snapshots), ...merged });
    });
  }

  function commit() {
    if (!plan) return;
    const approved = plan;
    void perform(async () => {
      if (!navigator.locks)
        throw new Error(
          'このブラウザでは安全に同期できません。最新のブラウザを使用してください。',
        );
      await navigator.locks.request(
        `ijinden-deckbook:drive:${scope?.sub}`,
        async () => {
          const auth = assertSession();
          const latest = await book.getSyncSnapshot();
          if (!latest?.sync || syncKey(latest) !== syncKey(approved.base))
            throw new Error(
              '確認中に端末のデッキが変わりました。閉じて同期内容を確認し直してください。',
            );
          const client = createDriveClient(auth.accessToken);
          const remote = await client.readAll(knownCardIds);
          if (JSON.stringify(remote.snapshots) !== approved.remoteKey)
            throw new Error(
              '別の端末から更新がありました。閉じて同期内容を確認し直してください。',
            );
          const resolved = [...approved.records];
          for (const conflict of approved.conflicts) {
            const choice = choices[conflict.id];
            if (choice === undefined)
              throw new Error('競合しているデッキの残し方を選んでください。');
            resolved.push(
              ...resolveConflict(conflict, choice, latest.sync.writerId),
            );
          }
          const now = new Date().toISOString();
          const records = prepareForUpload(resolved, latest.sync.writerId, now);
          // Preserve a local recovery copy before the first remote write. Failure stops sync.
          localStorage.setItem(
            `${book.storageKey}:before-sync`,
            JSON.stringify({
              version: 3,
              updatedAt: now,
              decks: latest.decks,
              draft: latest.draft,
              sync: latest.sync,
            }),
          );
          assertSession();
          await client.write(
            {
              format: 'ijinden-deckbook-sync',
              version: 1,
              writerId: latest.sync.writerId,
              records,
            },
            remote.files,
          );
          assertSession();
          const applied = await book.applySyncSnapshot(
            syncKey(latest),
            records,
            now,
          );
          if (!applied)
            throw new Error(
              'Driveへの保存後に端末が変更されました。端末の変更は残しています。もう一度同期してください。',
            );
          setPlan(null);
          notify(
            '同期しました。同時に別の端末で変更した場合は、もう一度同期して確認してください。',
          );
        },
      );
    });
  }

  function addLocalDecks() {
    void perform(async () => {
      const local = loadStoredArchive(() =>
        localStorage.getItem(localStorageKey),
      );
      if (local.status !== 'ready')
        throw new Error('この端末だけのデッキを読み込めませんでした。');
      if (!local.decks.length)
        throw new Error('この端末だけの保存済みデッキはありません。');
      if (
        !window.confirm(
          `この端末だけのデッキ ${local.decks.length}件を ${scope?.email} の保存領域にコピーします。Driveには次の同期で保存します。よろしいですか？`,
        )
      )
        return;
      const base = await book.getSyncSnapshot();
      if (!base?.sync) throw new Error('保存領域を読み込めませんでした。');
      const records = [...base.sync.records];
      for (const deck of local.decks) {
        const existing = records.find((r) => r.id === deck.id);
        if (
          existing?.state === 'active' &&
          JSON.stringify(existing.deck) === JSON.stringify(deck)
        )
          continue;
        const copy = { ...deck, id: existing ? crypto.randomUUID() : deck.id };
        delete copy.sourceId;
        records.push(
          changeRecord(undefined, 'active', copy, base.sync.writerId),
        );
      }
      if (await book.applySyncSnapshot(syncKey(base), records))
        notify(
          'この端末のデッキを追加しました。「同期内容を確認」からDriveに保存できます。',
        );
    });
  }

  function exportBackup() {
    try {
      const raw = localStorage.getItem(`${book.storageKey}:before-sync`);
      if (!raw) throw new Error('同期前バックアップはまだありません。');
      const url = URL.createObjectURL(
        new Blob([raw], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'deckbook-before-sync.json';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(message(cause));
    }
  }

  const lastSyncedAt =
    book.archiveLoad?.status === 'ready'
      ? book.archiveLoad.sync?.lastSyncedAt
      : undefined;
  return (
    <section className={panelClass} aria-label="Google Drive同期">
      <h2 className="font-display text-lg">Google Drive同期</h2>
      <p className="mt-2 break-all">
        {scope ? `保存先：${scope.email}` : '保存先：この端末のみ'}
      </p>
      <p className="mt-1 text-[var(--muted)]">
        自分のGoogle
        Driveで、保存済みマイデッキすべてとゴミ箱を同期します。作業中のレシピは端末ごとに保存します。
      </p>
      <p className="mt-2 text-xs text-[var(--muted)]">
        同期は任意・手動です。ページの再読み込み後や認証の有効期限が切れた場合は、Googleへの再接続が必要です。
      </p>
      {!GOOGLE_CLIENT_ID && (
        <p className="mt-2">
          Google接続は準備中です。管理者の設定後に利用できます。
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={busy || !authReady || book.pendingWrites > 0}
          onClick={connect}
        >
          {scope ? 'Googleに接続' : 'Googleで接続'}
        </Button>
        {scope && (
          <>
            <Button
              variant="outline"
              disabled={busy || !session || book.pendingWrites > 0}
              onClick={preview}
            >
              同期内容を確認
            </Button>
            <Button
              variant="outline"
              disabled={busy || book.pendingWrites > 0}
              onClick={addLocalDecks}
            >
              この端末だけのデッキを追加
            </Button>
            <Button
              variant="ghost"
              disabled={busy || book.pendingWrites > 0}
              onClick={onDisconnect}
            >
              ログアウト
            </Button>
            <Button variant="ghost" disabled={busy} onClick={exportBackup}>
              同期前バックアップ
            </Button>
          </>
        )}
      </div>
      {scope && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          {lastSyncedAt
            ? `最後の同期：${new Date(lastSyncedAt).toLocaleString('ja-JP')}`
            : 'まだ同期していません。'}{' '}
          変更は「同期内容を確認」後に反映されます。
        </p>
      )}
      {scope && !session && (
        <p className="mt-2 text-xs">
          端末内のデッキを表示しています。同期するにはGoogleに再接続してください。
        </p>
      )}
      {scope && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          ログアウトしても端末内のデッキは残ります。共用端末では、利用後に
          <a
            className="underline"
            href={`${import.meta.env.BASE_URL ?? '/'}privacy.html#local-data`}
            target="_blank"
            rel="noreferrer"
          >
            端末内データの消去方法
          </a>
          を確認してください。
        </p>
      )}
      <a
        className="mt-2 inline-block text-xs underline"
        href={`${import.meta.env.BASE_URL ?? '/'}privacy.html`}
        target="_blank"
        rel="noreferrer"
      >
        プライバシーポリシー
      </a>
      {busy && <output className="mt-2 block">処理中です…</output>}
      {error && (
        <p role="alert" className="mt-2 break-words text-[var(--red)]">
          {error}
        </p>
      )}
      <Dialog
        open={plan !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setPlan(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto bg-[var(--paper)] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>同期内容の確認</DialogTitle>
            <DialogDescription>
              端末とDriveの変更を合わせます。確認後に保存します。競合がある場合は、残す内容を選んでください。
            </DialogDescription>
          </DialogHeader>
          {plan && (
            <>
              <p>
                競合なし：マイデッキ{' '}
                {plan.records.filter((r) => r.state === 'active').length}
                件・ゴミ箱{' '}
                {plan.records.filter((r) => r.state === 'trash').length}件 ／
                競合 {plan.conflicts.length}件
              </p>
              <p className="text-xs text-[var(--muted)]">
                Driveに削除を反映してから30日を過ぎたゴミ箱は、この同期で完全削除されます。
              </p>
              <details>
                <summary className="cursor-pointer">同期するデッキ一覧</summary>
                <ul className="mt-2 space-y-1">
                  {plan.records
                    .filter((r) => r.deck)
                    .map((r) => (
                      <li key={r.id}>
                        {r.state === 'trash' ? '［ゴミ箱］' : ''}
                        {r.deck?.name || '名前のないデッキ'}
                      </li>
                    ))}
                </ul>
              </details>
              {plan.conflicts.map((conflict) => (
                <fieldset
                  key={conflict.id}
                  className="space-y-2 rounded-lg border border-[var(--line)] p-3"
                >
                  <legend className="px-1 font-medium">
                    {conflict.candidates.find((r) => r.deck)?.deck?.name ||
                      '削除の競合'}
                  </legend>
                  {conflict.candidates.map((record, index) => (
                    <div key={index}>
                      <label className="flex items-start gap-2">
                        <input
                          type="radio"
                          name={conflict.id}
                          checked={choices[conflict.id] === index}
                          onChange={() =>
                            setChoices((old) => ({
                              ...old,
                              [conflict.id]: index,
                            }))
                          }
                        />
                        <span>
                          {isLocalCandidate(plan.base, record)
                            ? 'この端末'
                            : 'Drive'}
                          ・候補{index + 1}：
                          {record.state === 'purged'
                            ? '完全削除'
                            : `${record.state === 'trash' ? 'ゴミ箱' : '保存済み'}・${record.deck?.name}・メイン${Object.values(record.deck?.main ?? {}).reduce((a, b) => a + b, 0)}枚・${record.deck?.updatedAt}`}
                        </span>
                      </label>
                      {record.deck && (
                        <details className="ml-5 text-xs">
                          <summary className="cursor-pointer">
                            カード構成を見る
                          </summary>
                          {(['main', 'side'] as const).map((pile) => (
                            <div key={pile} className="mt-2">
                              <p className="font-medium">
                                {pile === 'main' ? 'メイン' : 'サイド'}
                              </p>
                              <ul>
                                {Object.entries(record.deck![pile]).map(
                                  ([id, count]) => (
                                    <li key={id}>
                                      {cardsById.get(id)?.name ?? id} × {count}
                                    </li>
                                  ),
                                )}
                              </ul>
                            </div>
                          ))}
                        </details>
                      )}
                    </div>
                  ))}
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name={conflict.id}
                      checked={choices[conflict.id] === 'both'}
                      onChange={() =>
                        setChoices((old) => ({ ...old, [conflict.id]: 'both' }))
                      }
                    />
                    <span>内容を別々のデッキとして残す</span>
                  </label>
                  {conflict.candidates.some((r) => r.state === 'purged') && (
                    <p className="text-xs">
                      完全削除したIDは復活しません。内容を残す場合は新しいデッキとして作成します。
                    </p>
                  )}
                </fieldset>
              ))}
              {error && (
                <p role="alert" className="text-[var(--red)]">
                  {error}
                </p>
              )}
            </>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setPlan(null)}
            >
              あとで
            </Button>
            <Button
              disabled={
                busy ||
                !plan ||
                plan.conflicts.some((c) => choices[c.id] === undefined)
              }
              onClick={commit}
            >
              この内容で同期
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function message(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : '同期できませんでした。端末の内容は保持しています。';
}

function isLocalCandidate(base: ReadyArchive, record: SyncRecord) {
  const key = (value: SyncRecord) =>
    JSON.stringify([
      value.state,
      value.deck?.name,
      Object.entries(value.deck?.main ?? {}).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
      Object.entries(value.deck?.side ?? {}).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
      value.deck?.color ?? 'default',
      value.deck?.updatedAt,
      value.trashedAt,
    ]);
  return (
    base.sync?.records.some(
      (local) => local.id === record.id && key(local) === key(record),
    ) ?? false
  );
}

export function DeckTrash({ book }: { book: Book }) {
  return (
    <section className={panelClass} aria-label="ゴミ箱">
      <details>
        <summary className="cursor-pointer font-medium">
          ゴミ箱（{book.trash.length}件）
        </summary>
        <p className="my-3 text-xs text-[var(--muted)]">
          削除をDriveに同期してから30日後、次の同期で完全削除します。同期していないデッキは自動削除しません。
        </p>
        {book.trash.map((record) => (
          <div
            key={record.id}
            className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] p-2"
          >
            <span className="min-w-0 break-all">
              {record.deck?.name || '名前のないデッキ'}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => book.changeTrash(record.id, 'restore')}
              >
                復元
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (
                    window.confirm(
                      'このデッキを完全削除しますか？ アプリのゴミ箱から復元できなくなります。',
                    )
                  )
                    book.changeTrash(record.id, 'purge');
                }}
              >
                完全削除
              </Button>
            </div>
          </div>
        ))}
      </details>
    </section>
  );
}
