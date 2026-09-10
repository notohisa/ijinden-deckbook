import type { ArchiveData, Deck } from '@/app/types/deck';
import { copyDeckAsDraft } from './deck-utils.ts';

export const localStorageKey = 'ijinden-deckbook-v1';

export type ArchiveLoadResult =
  | {
      status: 'ready';
      source: 'empty' | 'v1' | 'v2';
      decks: Deck[];
      draft: Deck | null;
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

function cloneStoredDeck(deck: Deck, isSaved: boolean): Deck {
  const color =
    deck.color === 'default' || deck.color === 'orange' || deck.color === 'gray'
      ? deck.color
      : undefined;
  return {
    ...deck,
    main: { ...deck.main },
    side: { ...deck.side },
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
  };

  if (archive.version !== 1 && archive.version !== 2) {
    return blocked(raw, 'unsupported-version');
  }
  if (!Array.isArray(archive.decks) || !archive.decks.every(isStoredDeck)) {
    return blocked(raw, 'invalid-data');
  }

  if (archive.version === 2) {
    if (!isStoredDeck(archive.draft)) return blocked(raw, 'invalid-data');
    return {
      status: 'ready',
      source: 'v2',
      decks: archive.decks.map((deck) => cloneStoredDeck(deck, true)),
      draft: cloneStoredDeck(archive.draft, false),
    };
  }

  const savedDecks = archive.decks
    .filter((deck) => deck.isSaved)
    .map((deck) => cloneStoredDeck(deck, true));
  const legacyDraft = archive.decks.find((deck) => !deck.isSaved);
  return {
    status: 'ready',
    source: 'v1',
    decks: savedDecks,
    draft: legacyDraft ? copyDeckAsDraft(legacyDraft) : null,
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
