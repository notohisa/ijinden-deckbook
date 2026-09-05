import type {
  Deck,
  DeckImportError,
  DeckImportParseResult,
  ImportPreviewItem,
} from '@/app/types/deck';
import { normalizedDeckName } from './deck-utils.ts';

function parsePile(
  value: unknown,
  knownCardIds: ReadonlySet<string>,
): Record<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (
    !entries.every(
      ([cardId, count]) =>
        knownCardIds.has(cardId) && Number.isSafeInteger(count) && count > 0,
    )
  )
    return null;
  return Object.fromEntries(entries) as Record<string, number>;
}

export function parseImportedDeck(
  value: unknown,
  knownCardIds: ReadonlySet<string>,
): Deck | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Partial<Deck>;
  const main = parsePile(raw.main, knownCardIds);
  const side = parsePile(raw.side, knownCardIds);
  if (
    typeof raw.id !== 'string' ||
    typeof raw.name !== 'string' ||
    !main ||
    !side
  )
    return null;
  const color =
    raw.color === 'default' || raw.color === 'orange' || raw.color === 'gray'
      ? raw.color
      : undefined;
  return {
    id: raw.id,
    name: raw.name,
    main,
    side,
    updatedAt:
      typeof raw.updatedAt === 'string'
        ? raw.updatedAt
        : new Date().toISOString(),
    isSaved: true,
    ...(color ? { color } : {}),
  };
}

export function parseDeckImport(
  source: unknown,
  knownCardIds: ReadonlySet<string>,
): DeckImportParseResult {
  if (
    !source ||
    typeof source !== 'object' ||
    Array.isArray(source) ||
    !Array.isArray((source as { decks?: unknown }).decks)
  ) {
    throw new Error(
      'このアプリでエクスポートしたJSONファイルを選んでください。',
    );
  }
  const input = (source as { decks: unknown[] }).decks;
  const decks: Deck[] = [];
  const invalidDecks: DeckImportError[] = [];
  input.forEach((value, index) => {
    const deck = parseImportedDeck(value, knownCardIds);
    if (deck) {
      decks.push(deck);
      return;
    }
    const possibleName =
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof (value as { name?: unknown }).name === 'string'
        ? (value as { name: string }).name
        : 'デッキ' + String(index + 1);
    invalidDecks.push({
      index,
      name: possibleName,
      reason: 'カードIDまたは枚数の形式を確認してください。',
    });
  });
  return { decks, invalidDecks, totalCount: input.length };
}

function findExistingDeck(
  deck: Deck,
  targets: Map<string, Deck>,
  idsByName: Map<string, string>,
): Deck | undefined {
  const name = normalizedDeckName(deck.name);
  const id =
    (name ? idsByName.get(name) : undefined) ??
    (targets.has(deck.id) ? deck.id : undefined);
  return id ? targets.get(id) : undefined;
}

export function createImportPreview(
  imported: readonly Deck[],
  existing: readonly Deck[],
): ImportPreviewItem[] {
  const targets = new Map(existing.map((deck) => [deck.id, deck]));
  const idsByName = new Map(
    existing
      .map((deck) => [normalizedDeckName(deck.name), deck.id] as const)
      .filter(([name]) => name.length > 0),
  );
  return imported.map((deck, index) => {
    const existingDeck = findExistingDeck(deck, targets, idsByName);
    const name = normalizedDeckName(deck.name);
    const targetId = existingDeck?.id ?? deck.id;
    const normalized = { ...deck, id: targetId, name };
    targets.set(targetId, normalized);
    if (name) idsByName.set(name, targetId);
    return {
      key: String(index) + ':' + deck.id,
      deck,
      action: existingDeck ? 'update' : 'add',
      existingDeck,
    };
  });
}

export function mergeImportedDecks(
  existing: readonly Deck[],
  imported: readonly Deck[],
): { decks: Deck[]; added: number; updated: number } {
  const targets = new Map(existing.map((deck) => [deck.id, deck]));
  const idsByName = new Map(
    existing
      .map((deck) => [normalizedDeckName(deck.name), deck.id] as const)
      .filter(([name]) => name.length > 0),
  );
  let added = 0;
  let updated = 0;
  const updatedAt = new Date().toISOString();
  for (const importedDeck of imported) {
    const existingDeck = findExistingDeck(importedDeck, targets, idsByName);
    const name = normalizedDeckName(importedDeck.name);
    const targetId = existingDeck?.id ?? importedDeck.id;
    const merged: Deck = {
      ...importedDeck,
      id: targetId,
      name,
      main: { ...importedDeck.main },
      side: { ...importedDeck.side },
      updatedAt,
      isSaved: true,
    };
    if (existingDeck) {
      const previousName = normalizedDeckName(existingDeck.name);
      if (previousName && previousName !== name) idsByName.delete(previousName);
      updated += 1;
    } else {
      added += 1;
    }
    targets.set(targetId, merged);
    if (name) idsByName.set(name, targetId);
  }
  return {
    decks: Array.from(targets.values()).sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    ),
    added,
    updated,
  };
}
