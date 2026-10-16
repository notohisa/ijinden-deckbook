import type { ArchiveData, Deck, LocalSyncState } from '@/app/types/deck';
import {
  changeRecord,
  validateSnapshot,
  type SyncRecord,
} from './deck-sync.ts';
import {
  loadStoredArchive,
  saveStoredArchive,
  type ArchiveLoadResult,
} from './deck-storage.ts';

export type ReadyArchive = Extract<ArchiveLoadResult, { status: 'ready' }>;
export type ArchivePort = {
  read: () => string | null;
  write: (raw: string) => void;
  exclusive: <T>(operation: () => T) => Promise<T>;
};

export class ArchiveReadError extends Error {
  readonly snapshot: Exclude<ArchiveLoadResult, ReadyArchive>;
  constructor(snapshot: Exclude<ArchiveLoadResult, ReadyArchive>) {
    super('保存データを確認できないため、書き込みを停止しました。');
    this.snapshot = snapshot;
  }
}

export class SavedDecksChangedError extends Error {
  readonly snapshot: ReadyArchive;
  constructor(snapshot: ReadyArchive) {
    super(
      '別のタブでマイデッキが変更されました。更新した内容を確認して、もう一度操作してください。',
    );
    this.snapshot = snapshot;
  }
}

export function savedDecksKey(decks: readonly Deck[]): string {
  return JSON.stringify([...decks].sort((a, b) => a.id.localeCompare(b.id)));
}

/** Compare editable content, ignoring IDs/timestamps regenerated during v1 migration. */
export function draftKey(deck: Deck | null): string {
  if (!deck) return 'null';
  return JSON.stringify([
    deck.name,
    Object.entries(deck.main).sort(([a], [b]) => a.localeCompare(b)),
    Object.entries(deck.side).sort(([a], [b]) => a.localeCompare(b)),
    deck.color ?? 'default',
    deck.sourceId ?? null,
    deck.sourceUpdatedAt ?? null,
  ]);
}

export function syncKey(snapshot: ReadyArchive): string {
  return JSON.stringify([snapshot.decks, snapshot.sync ?? null]);
}

function initialSync(snapshot: ReadyArchive): LocalSyncState {
  if (snapshot.sync) return snapshot.sync;
  const writerId = crypto.randomUUID();
  return {
    writerId,
    records: snapshot.decks.map((deck) =>
      changeRecord(undefined, 'active', deck, writerId),
    ),
  };
}

function syncDecks(sync: LocalSyncState, decks: Deck[]): LocalSyncState {
  const records = new Map(sync.records.map((record) => [record.id, record]));
  const ids = new Set(decks.map((deck) => deck.id));
  for (const record of records.values()) {
    if (record.state === 'active' && !ids.has(record.id))
      records.set(
        record.id,
        changeRecord(record, 'trash', record.deck, sync.writerId),
      );
  }
  for (const deck of decks) {
    const previous = records.get(deck.id);
    if (previous?.state === 'purged')
      throw new Error(
        '完全削除されたデッキです。別のデッキとして保存してください。',
      );
    if (
      !previous ||
      previous.state !== 'active' ||
      savedDecksKey([previous.deck!]) !== savedDecksKey([deck])
    )
      records.set(
        deck.id,
        changeRecord(previous, 'active', deck, sync.writerId),
      );
  }
  return { ...sync, records: [...records.values()] };
}

/** Every mutation reads the latest archive inside the same cross-tab lock. */
export function createArchiveRepository(port: ArchivePort, initialDraft: Deck) {
  const read = () => loadStoredArchive(port.read);
  function latest() {
    const snapshot = read();
    if (snapshot.status !== 'ready') throw new ArchiveReadError(snapshot);
    return snapshot;
  }
  function write(
    decks: Deck[],
    draft: Deck,
    sync?: LocalSyncState,
  ): ReadyArchive {
    if (sync)
      validateSnapshot({
        format: 'ijinden-deckbook-sync',
        version: 1,
        writerId: sync.writerId,
        records: sync.records,
      });
    const archive: ArchiveData = {
      version: sync ? 3 : 2,
      updatedAt: new Date().toISOString(),
      decks,
      draft,
      ...(sync ? { sync } : {}),
    };
    const snapshot: ReadyArchive = {
      status: 'ready',
      source: sync ? 'v3' : 'v2',
      decks,
      draft,
      ...(sync ? { sync } : {}),
    };
    saveStoredArchive(snapshot, archive, port.write);
    return snapshot;
  }
  return {
    read,
    changeDecks<T>(
      change: (decks: Deck[]) => { decks: Deck[]; value: T },
      expectedKey?: string,
    ) {
      return port.exclusive(() => {
        const snapshot = latest();
        if (
          expectedKey !== undefined &&
          expectedKey !== savedDecksKey(snapshot.decks)
        ) {
          throw new SavedDecksChangedError(snapshot);
        }
        const changed = change(snapshot.decks);
        return {
          snapshot: write(
            changed.decks,
            snapshot.draft ?? initialDraft,
            syncDecks(initialSync(snapshot), changed.decks),
          ),
          value: changed.value,
        };
      });
    },
    changeDraft(expectedKey: string, draft: Deck) {
      return port.exclusive(() => {
        const snapshot = latest();
        if (draftKey(snapshot.draft) !== expectedKey) {
          return { conflict: true as const, snapshot };
        }
        return {
          conflict: false as const,
          snapshot: write(snapshot.decks, draft, snapshot.sync),
        };
      });
    },
    initializeSync() {
      return port.exclusive(() => {
        const snapshot = latest();
        if (snapshot.sync) return snapshot;
        return write(
          snapshot.decks,
          snapshot.draft ?? initialDraft,
          initialSync(snapshot),
        );
      });
    },
    applySync(expected: string, records: SyncRecord[], lastSyncedAt?: string) {
      return port.exclusive(() => {
        const snapshot = latest();
        if (syncKey(snapshot) !== expected)
          throw new SavedDecksChangedError(snapshot);
        const sync = initialSync(snapshot);
        return write(
          records
            .filter((r) => r.state === 'active')
            .map((r) => ({ ...r.deck!, isSaved: true })),
          snapshot.draft ?? initialDraft,
          { ...sync, records, ...(lastSyncedAt ? { lastSyncedAt } : {}) },
        );
      });
    },
    changeTrash(id: string, action: 'restore' | 'purge', expected: string) {
      return port.exclusive(() => {
        const snapshot = latest();
        if (syncKey(snapshot) !== expected)
          throw new SavedDecksChangedError(snapshot);
        const sync = initialSync(snapshot);
        const record = sync.records.find((r) => r.id === id);
        if (!record || record.state !== 'trash')
          throw new Error(
            'ゴミ箱の内容が変わりました。もう一度確認してください。',
          );
        const changed = changeRecord(
          record,
          action === 'restore' ? 'active' : 'purged',
          action === 'restore' ? record.deck : undefined,
          sync.writerId,
        );
        const records = sync.records.map((r) => (r.id === id ? changed : r));
        return write(
          records.filter((r) => r.state === 'active').map((r) => r.deck!),
          snapshot.draft ?? initialDraft,
          { ...sync, records },
        );
      });
    },
  };
}

export type ArchiveRepository = ReturnType<typeof createArchiveRepository>;
