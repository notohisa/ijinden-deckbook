import type { ArchiveData, Deck } from '@/app/types/deck';
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
  ]);
}

/** Every mutation reads the latest archive inside the same cross-tab lock. */
export function createArchiveRepository(port: ArchivePort, initialDraft: Deck) {
  const read = () => loadStoredArchive(port.read);
  function latest() {
    const snapshot = read();
    if (snapshot.status !== 'ready') throw new ArchiveReadError(snapshot);
    return snapshot;
  }
  function write(decks: Deck[], draft: Deck): ReadyArchive {
    const archive: ArchiveData = {
      version: 2,
      updatedAt: new Date().toISOString(),
      decks,
      draft,
    };
    const snapshot: ReadyArchive = {
      status: 'ready',
      source: 'v2',
      decks,
      draft,
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
          snapshot: write(changed.decks, snapshot.draft ?? initialDraft),
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
          snapshot: write(snapshot.decks, draft),
        };
      });
    },
  };
}

export type ArchiveRepository = ReturnType<typeof createArchiveRepository>;
