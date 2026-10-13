import type { ArchiveData, Deck, LocalSyncState } from '@/app/types/deck';
import { validateSnapshot } from './deck-sync.ts';
import { copyDeckAsDraft } from './deck-utils.ts';
import { migrateCardIdsInPile } from './card-id-migration.ts';

export const localStorageKey = 'ijinden-deckbook-v1';

export type ArchiveLoadResult =
  | {
      status: 'ready';
      source: 'empty' | 'v1' | 'v2' | 'v3';
      decks: Deck[];
      draft: Deck | null;
      sync?: LocalSyncState;
    }
  | {
      status: 'blocked';
      raw: string | null;
      reason: 'read-error' | 'invalid-data' | 'unsupported-version';
    };

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

function cloneStoredDeck(deck: Deck, isSaved: boolean): Deck | null {
  const main = migrateCardIdsInPile(deck.main);
  const side = migrateCardIdsInPile(deck.side);
  if (!main || !side) return null;

  const color =
    deck.color === 'default' || deck.color === 'orange' || deck.color === 'gray'
      ? deck.color
      : undefined;
  return {
    ...deck,
    main,
    side,
    isSaved,
    ...(color ? { color } : {}),
  };
}

function blocked(
  raw: string,
  reason: 'invalid-data' | 'unsupported-version',
): ArchiveLoadResult {
  return { status: 'blocked', raw, reason };
}

/**
 * Reads and validates the browser archive without changing storage.
 * Invalid input is deliberately returned to the caller so it cannot be
 * replaced by the initial archive during the first save effect.
 */
export function loadStoredArchive(
  read: () => string | null,
): ArchiveLoadResult {
  let raw: string | null;
  try {
    raw = read();
  } catch {
    return { status: 'blocked', raw: null, reason: 'read-error' };
  }

  if (raw === null) {
    return { status: 'ready', source: 'empty', decks: [], draft: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return blocked(raw, 'invalid-data');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return blocked(raw, 'invalid-data');
  }

  const archive = parsed as {
    version?: unknown;
    decks?: unknown;
    draft?: unknown;
    sync?: unknown;
  };

  if (archive.version !== 1 && archive.version !== 2 && archive.version !== 3) {
    return blocked(raw, 'unsupported-version');
  }
  if (!Array.isArray(archive.decks) || !archive.decks.every(isStoredDeck)) {
    return blocked(raw, 'invalid-data');
  }

  if (archive.version === 2 || archive.version === 3) {
    if (!isStoredDeck(archive.draft)) return blocked(raw, 'invalid-data');
    const decks = archive.decks.map((deck) => cloneStoredDeck(deck, true));
    const draft = cloneStoredDeck(archive.draft, false);
    if (decks.some((deck) => deck === null) || !draft) {
      return blocked(raw, 'invalid-data');
    }
    let sync: LocalSyncState | undefined;
    if (archive.version === 3) {
      try {
        const stored = archive.sync as LocalSyncState;
        const checked = validateSnapshot({
          writerId: stored.writerId,
          records: stored.records,
          format: 'ijinden-deckbook-sync',
          version: 1,
        });
        if (
          stored.lastSyncedAt !== undefined &&
          (typeof stored.lastSyncedAt !== 'string' ||
            !Number.isFinite(Date.parse(stored.lastSyncedAt)))
        )
          return blocked(raw, 'invalid-data');
        const active = checked.records
          .filter((r) => r.state === 'active')
          .map((r) => r.deck);
        if (
          active.length !== decks.length ||
          decks.some(
            (d) =>
              !active.some(
                (a) =>
                  a &&
                  d &&
                  a.id === d.id &&
                  JSON.stringify([
                    a.name,
                    a.main,
                    a.side,
                    a.color ?? 'default',
                    a.updatedAt,
                  ]) ===
                    JSON.stringify([
                      d.name,
                      d.main,
                      d.side,
                      d.color ?? 'default',
                      d.updatedAt,
                    ]),
              ),
          )
        )
          return blocked(raw, 'invalid-data');
        sync = {
          writerId: checked.writerId,
          records: checked.records,
          ...(stored.lastSyncedAt ? { lastSyncedAt: stored.lastSyncedAt } : {}),
        };
      } catch {
        return blocked(raw, 'invalid-data');
      }
    }
    return {
      status: 'ready',
      source: archive.version === 3 ? 'v3' : 'v2',
      decks: decks.filter((deck): deck is Deck => deck !== null),
      draft,
      ...(sync ? { sync } : {}),
    };
  }

  const savedDecks = archive.decks
    .filter((deck) => deck.isSaved)
    .map((deck) => cloneStoredDeck(deck, true));
  const legacyDraft = archive.decks.find((deck) => !deck.isSaved);
  const draft = legacyDraft
    ? cloneStoredDeck(copyDeckAsDraft(legacyDraft), false)
    : null;
  if (savedDecks.some((deck) => deck === null) || (legacyDraft && !draft)) {
    return blocked(raw, 'invalid-data');
  }
  return {
    status: 'ready',
    source: 'v1',
    decks: savedDecks.filter((deck): deck is Deck => deck !== null),
    draft,
  };
}

/** Saves only after the original archive has been read successfully. */
export function saveStoredArchive(
  loadResult: ArchiveLoadResult | null,
  archive: ArchiveData,
  write: (raw: string) => void,
): void {
  if (loadResult?.status !== 'ready') return;
  write(JSON.stringify(archive));
}
