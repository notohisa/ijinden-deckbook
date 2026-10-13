'use client';

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import type { Deck, DeckColor, Pile } from '@/app/types/deck';
import {
  createArchiveRepository,
  ArchiveReadError,
  SavedDecksChangedError,
  savedDecksKey,
  draftKey,
  syncKey,
  type ArchiveRepository,
  type ReadyArchive,
} from '@/lib/deck-archive-repository';
import {
  loadStoredArchive,
  localStorageKey,
  type ArchiveLoadResult,
} from '@/lib/deck-storage';
import {
  addSavedDeck,
  adjustDraftCard,
  colorDeck,
  editDraft,
  moveDraftCard,
  renameDeck,
} from '@/lib/deck-operations';
import { copyDeckAsDraft, newDeck } from '@/lib/deck-utils';
import { mergeImportedDecks } from '@/lib/deck-import';
import type { SyncRecord } from '@/lib/deck-sync';

const TAB_DRAFT_KEY = 'ijinden-deckbook:tab-draft-v1';
const ARCHIVE_LOCK = 'ijinden-deckbook:archive';
const unsupportedMessage =
  'このブラウザでは安全に保存できません。最新のブラウザで開いてください。編集中の内容はテキストでコピーできます。';

type TabDraft = { draft: Deck; baseline: string; touched: boolean };

function readTabDraft(key: string): TabDraft | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<TabDraft>;
    if (
      typeof value.baseline !== 'string' ||
      typeof value.touched !== 'boolean'
    )
      return null;
    const decoded = loadStoredArchive(() =>
      JSON.stringify({ version: 2, decks: [], draft: value.draft }),
    );
    return decoded.status === 'ready' && decoded.draft
      ? {
          draft: decoded.draft,
          baseline: value.baseline,
          touched: value.touched,
        }
      : null;
  } catch {
    return null;
  }
}

/** Owns browser persistence; page components only issue deck operations. */
export function useDeckBook(
  notify: (message: string) => void,
  storageKey = localStorageKey,
) {
  const tabDraftKey =
    storageKey === localStorageKey
      ? TAB_DRAFT_KEY
      : `${TAB_DRAFT_KEY}:${storageKey}`;
  const archiveLock =
    storageKey === localStorageKey
      ? ARCHIVE_LOCK
      : `${ARCHIVE_LOCK}:${storageKey}`;
  const [activeDeck, setActiveDeck] = useState<Deck>(() => ({
    id: 'new-deck',
    name: '新しいデッキ',
    main: {},
    side: {},
    updatedAt: new Date().toISOString(),
    isSaved: false,
  }));
  const [decks, setDecks] = useState<Deck[]>([]);
  const [archiveLoad, setArchiveLoad] = useState<ArchiveLoadResult | null>(
    null,
  );
  const [draftConflict, setDraftConflict] = useState(false);
  const [storageIssue, setStorageIssue] = useState('');
  const [pendingWrites, setPendingWrites] = useState(0);
  const draft = useRef(activeDeck);
  const baseline = useRef('null');
  const touched = useRef(false);
  const conflict = useRef(false);
  const repository = useRef<ArchiveRepository | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const mounted = useRef(false);

  const checkpoint = useCallback(() => {
    try {
      sessionStorage.setItem(
        tabDraftKey,
        JSON.stringify({
          draft: draft.current,
          baseline: baseline.current,
          touched: touched.current,
        } satisfies TabDraft),
      );
    } catch {
      // Shared persistence still works when optional per-tab recovery is unavailable.
    }
  }, [tabDraftKey]);

  const receive = useCallback(
    (snapshot: ReadyArchive) => {
      setArchiveLoad(snapshot);
      setDecks(snapshot.decks);
      const nextKey = draftKey(snapshot.draft);
      if (nextKey === baseline.current) return;
      if (!touched.current || nextKey === draftKey(draft.current)) {
        baseline.current = nextKey;
        conflict.current = false;
        setDraftConflict(false);
        if (snapshot.draft) {
          draft.current = snapshot.draft;
          setActiveDeck(snapshot.draft);
        }
      } else {
        conflict.current = true;
        setDraftConflict(true);
      }
      checkpoint();
    },
    [checkpoint],
  );

  const failed = useCallback(
    (error: unknown) => {
      if (error instanceof ArchiveReadError) setArchiveLoad(error.snapshot);
      if (error instanceof SavedDecksChangedError) receive(error.snapshot);
      const message =
        error instanceof Error ? error.message : '保存できませんでした。';
      setStorageIssue(message);
      notify(message);
    },
    [notify, receive],
  );

  const enqueue = useCallback(
    <T>(
      operation: (repo: ArchiveRepository) => Promise<T>,
    ): Promise<T | undefined> => {
      setPendingWrites((count) => count + 1);
      const next = queue.current.then(async () => {
        if (!mounted.current || !repository.current) return undefined;
        try {
          return await operation(repository.current);
        } catch (error) {
          failed(error);
          return undefined;
        } finally {
          if (mounted.current) setPendingWrites((count) => count - 1);
        }
      });
      queue.current = next;
      return next;
    },
    [failed],
  );

  const persistDraft = useCallback(
    (proposed: Deck) => {
      void enqueue(async (repo) => {
        if (conflict.current) return;
        const result = await repo.changeDraft(baseline.current, proposed);
        if (result.conflict) {
          conflict.current = true;
          setDraftConflict(true);
          setDecks(result.snapshot.decks);
        } else {
          baseline.current = draftKey(result.snapshot.draft);
          setArchiveLoad(result.snapshot);
          setDecks(result.snapshot.decks);
          setStorageIssue('');
        }
        checkpoint();
      });
    },
    [checkpoint, enqueue],
  );

  /* oxlint-disable react/react-compiler -- Synchronize the external browser archive and tab recovery store with React state. */
  const connect = useEffectEvent(() => {
    mounted.current = true;
    repository.current = createArchiveRepository(
      {
        read: () => localStorage.getItem(storageKey),
        write: (raw) => {
          try {
            localStorage.setItem(storageKey, raw);
          } catch {
            throw new Error(
              'この端末に保存できませんでした。編集中の内容をコピーし、マイデッキをエクスポートしてください。',
            );
          }
        },
        exclusive: (operation) => {
          if (!navigator.locks)
            return Promise.reject(new Error(unsupportedMessage));
          return navigator.locks.request(archiveLock, operation);
        },
      },
      draft.current,
    );
    const snapshot = repository.current.read();
    setArchiveLoad(snapshot);
    if (snapshot.status === 'ready') {
      setDecks(snapshot.decks);
      const recovery = readTabDraft(tabDraftKey);
      draft.current = recovery?.draft ?? snapshot.draft ?? draft.current;
      baseline.current = recovery?.baseline ?? draftKey(snapshot.draft);
      touched.current = recovery?.touched ?? false;
      setActiveDeck(draft.current);
      receive(snapshot);
      if (snapshot.source !== 'empty')
        notify('保存済みデッキと作業中のレシピを読み込みました。');
      if (!navigator.locks) setStorageIssue(unsupportedMessage);
      // Finish an already requested edit if the tab reloaded before its write completed.
      if (
        touched.current &&
        !conflict.current &&
        draftKey(draft.current) !== baseline.current
      )
        persistDraft(draft.current);
    }
    function refresh(event?: StorageEvent) {
      if (event && event.key !== storageKey && event.key !== null) return;
      // Read current storage, not event.newValue, which may already be stale.
      void enqueue(async (repo) => {
        const current = repo.read();
        if (current.status === 'ready') receive(current);
        else setArchiveLoad(current);
      });
    }
    function beforeUnload(event: BeforeUnloadEvent) {
      if (
        touched.current &&
        (conflict.current || draftKey(draft.current) !== baseline.current)
      ) {
        event.preventDefault();
        // oxlint-disable-next-line typescript/no-deprecated -- Required for beforeunload compatibility in older browsers.
        event.returnValue = '';
      }
    }
    const onFocus = () => refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', onFocus);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      mounted.current = false;
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  });
  useEffect(() => connect(), []);
  /* oxlint-enable react/react-compiler */

  const updateActiveDeck = useCallback(
    (change: (deck: Deck) => Deck) => {
      if (archiveLoad?.status !== 'ready') return;
      draft.current = editDraft(draft.current, change);
      touched.current = true;
      setActiveDeck(draft.current);
      checkpoint();
      persistDraft(draft.current);
    },
    [archiveLoad?.status, checkpoint, persistDraft],
  );

  const adjustCard = useCallback(
    (id: string, pile: Pile, difference: number) =>
      updateActiveDeck((deck) => adjustDraftCard(deck, id, pile, difference)),
    [updateActiveDeck],
  );

  async function changeDecks<T>(
    change: (current: Deck[]) => { decks: Deck[]; value: T },
    expectedKey?: string,
  ) {
    return enqueue(async (repo) => {
      const result = await repo.changeDecks(change, expectedKey);
      receive(result.snapshot);
      setStorageIssue('');
      return result.value;
    });
  }

  async function saveActiveDeck(asCopy = false) {
    const current = draft.current;
    const saved = await changeDecks((latest) => {
      const result = addSavedDeck(latest, current, asCopy);
      return {
        decks: result.decks,
        value: result.decks.find((deck) => deck.name === result.value)!,
      };
    });
    if (saved !== undefined) {
      updateActiveDeck((deck) => ({
        ...deck,
        sourceId: saved.id,
        sourceUpdatedAt: saved.updatedAt,
      }));
      notify(
        '「' +
          (saved.name || '名前のないデッキ') +
          '」をマイデッキに保存しました。',
      );
    }
  }

  async function renameSavedDeck(id: string, name: string): Promise<boolean> {
    const changed = await changeDecks((latest) => ({
      decks: renameDeck(latest, id, name),
      value: true,
    }));
    if (changed) notify('デッキ名を変更しました。');
    return changed ?? false;
  }

  async function setDeckColor(id: string, color: DeckColor) {
    const changed = await changeDecks((latest) => ({
      decks: colorDeck(latest, id, color),
      value: true,
    }));
    if (changed) notify('マイデッキの色を変更しました。');
  }

  async function deleteSavedDeck(id: string) {
    const changed = await changeDecks(
      (latest) => ({
        decks: latest.filter((deck) => deck.id !== id),
        value: true,
      }),
      savedDecksKey(decks),
    );
    if (changed)
      notify('ゴミ箱に移しました。同期すると他の端末にも反映されます。');
  }

  async function importSelectedDecks(selected: Deck[]) {
    const result = await changeDecks((latest) => {
      const merged = mergeImportedDecks(latest, selected);
      return { decks: merged.decks, value: merged };
    }, savedDecksKey(decks));
    if (!result) return false;
    notify(
      `マイデッキを読み込みました。新規 ${result.added}件・更新 ${result.updated}件です。`,
    );
    return true;
  }

  function loadLatestDraft() {
    void enqueue(async (repo) => {
      const latest = repo.read();
      if (latest.status !== 'ready') throw new ArchiveReadError(latest);
      touched.current = false;
      conflict.current = false;
      setDraftConflict(false);
      baseline.current = draftKey(latest.draft);
      draft.current = latest.draft ?? newDeck(1);
      setActiveDeck(draft.current);
      setDecks(latest.decks);
      checkpoint();
    });
  }

  return {
    decks,
    activeDeck,
    archiveLoad,
    draftConflict,
    storageIssue,
    pendingWrites,
    storageKey,
    trash:
      archiveLoad?.status === 'ready'
        ? (archiveLoad.sync?.records.filter((r) => r.state === 'trash') ?? [])
        : [],
    getSyncSnapshot: () =>
      enqueue(async (repo) => {
        const snapshot = await repo.initializeSync();
        receive(snapshot);
        return snapshot;
      }),
    applySyncSnapshot: (
      expected: string,
      records: SyncRecord[],
      lastSyncedAt?: string,
    ) =>
      enqueue(async (repo) => {
        const snapshot = await repo.applySync(expected, records, lastSyncedAt);
        receive(snapshot);
        return snapshot;
      }),
    changeTrash: (id: string, action: 'restore' | 'purge') => {
      if (archiveLoad?.status !== 'ready') return;
      const expected = syncKey(archiveLoad);
      void enqueue(async (repo) => {
        receive(await repo.changeTrash(id, action, expected));
        notify(
          action === 'restore'
            ? 'デッキを復元しました。'
            : '完全削除しました。',
        );
      });
    },
    updateActiveDeck,
    saveActiveDeck,
    renameSavedDeck,
    setDeckColor,
    deleteSavedDeck,
    importSelectedDecks,
    loadLatestDraft,
    adjustCard,
    moveCard: (id: string, from: Pile) =>
      updateActiveDeck((deck) => moveDraftCard(deck, id, from)),
    clearActiveDeck: () =>
      updateActiveDeck((deck) => ({ ...deck, name: '', main: {}, side: {} })),
    createDeck: () => updateActiveDeck(() => newDeck(decks.length + 1)),
    openSavedDeck: (deck: Deck) =>
      updateActiveDeck(() => ({
        ...copyDeckAsDraft(deck),
        sourceId: deck.id,
        sourceUpdatedAt: deck.updatedAt,
      })),
  };
}
