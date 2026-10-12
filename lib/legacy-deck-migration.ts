import type {
  Deck,
  DeckImportError,
  DeckImportParseResult,
} from '@/app/types/deck';
import { normalizedDeckName } from './deck-utils.ts';
import { migrateCardIdsInPile } from './card-id-migration.ts';

export const LEGACY_BACKUP_TYPE = 'ijinden-deck-builder-backup';

type LegacyDeck = {
  id: number;
  title?: string;
  timestamp: number;
  main: Array<[string, number]>;
  side: Array<[string, number]>;
};

type ParsedLegacyDeck = {
  legacyId: number;
  name: string;
  nameWasAdjusted: boolean;
  main: Record<string, number>;
  side: Record<string, number>;
  updatedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

/** Identifies a supported v1 export wrapper; deck rows are checked separately. */
export function isLegacyDeckBackup(source: unknown): boolean {
  return (
    isRecord(source) &&
    source.version === 1 &&
    source.type === LEGACY_BACKUP_TYPE &&
    isCanonicalIsoTimestamp(source.exportedAt) &&
    Array.isArray(source.decks)
  );
}

function mapLegacyCardId(
  cardId: string,
  knownCardIds: ReadonlySet<string>,
): string {
  if (knownCardIds.has(cardId)) return cardId;
  const match = /^(1|2|3|4|2nd1|2nd2|[RBGYP])-(\d+)$/.exec(cardId);
  if (!match) return cardId;

  const prefix = match[1];
  const number = Number(match[2]);
  if (!Number.isSafeInteger(number)) return cardId;
  const newPrefix: Record<string, string> = {
    '1': '01',
    '2': '02',
    '3': '03',
    '4': '04',
    '2nd1': '05',
    '2nd2': '06',
  };
  return `${newPrefix[prefix] ?? prefix}-${String(number).padStart(3, '0')}`;
}

function parsePile(
  value: unknown,
  knownCardIds: ReadonlySet<string>,
): Record<string, number> | null {
  if (!Array.isArray(value)) return null;

  const rawPile = Object.create(null) as Record<string, number>;
  for (const row of value) {
    if (
      !Array.isArray(row) ||
      row.length !== 2 ||
      typeof row[0] !== 'string' ||
      row[0].length === 0 ||
      typeof row[1] !== 'number' ||
      !Number.isSafeInteger(row[1]) ||
      row[1] <= 0
    ) {
      return null;
    }

    const cardId = mapLegacyCardId(row[0], knownCardIds);
    const combined = (rawPile[cardId] ?? 0) + row[1];
    if (!Number.isSafeInteger(combined) || combined <= 0) return null;
    rawPile[cardId] = combined;
  }

  const migrated = migrateCardIdsInPile(rawPile);
  if (!migrated || !Object.keys(migrated).every((id) => knownCardIds.has(id))) {
    return null;
  }

  let total = 0;
  for (const count of Object.values(migrated)) {
    total += count;
    if (!Number.isSafeInteger(total)) return null;
  }
  return migrated;
}

function createUpdatedAt(timestamp: number): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
}

function parseLegacyDeck(
  value: unknown,
  knownCardIds: ReadonlySet<string>,
): ParsedLegacyDeck | null {
  if (!isRecord(value)) return null;

  const legacy = value as Partial<LegacyDeck>;
  if (
    !Number.isSafeInteger(legacy.id) ||
    (legacy.id as number) <= 0 ||
    typeof legacy.timestamp !== 'number' ||
    !Number.isFinite(legacy.timestamp) ||
    ('title' in value && typeof legacy.title !== 'string')
  ) {
    return null;
  }

  const main = parsePile(legacy.main, knownCardIds);
  const side = parsePile(legacy.side, knownCardIds);
  if (!main || !side) return null;
  const total =
    Object.values(main).reduce((sum, count) => sum + count, 0) +
    Object.values(side).reduce((sum, count) => sum + count, 0);
  if (!Number.isSafeInteger(total)) return null;

  const legacyId = legacy.id as number;
  const title =
    typeof legacy.title === 'string' ? normalizedDeckName(legacy.title) : '';
  const providedTitle = typeof legacy.title === 'string' ? legacy.title : '';
  return {
    legacyId,
    name: title || `名称未設定（旧#${legacyId}）`,
    nameWasAdjusted: !title || title !== providedTitle,
    main,
    side,
    updatedAt: createUpdatedAt(legacy.timestamp),
  };
}

function pileSignature(pile: Record<string, number>): Array<[string, number]> {
  return Object.entries(pile).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}

function deckContentSignature(
  main: Record<string, number>,
  side: Record<string, number>,
): string {
  return JSON.stringify([pileSignature(main), pileSignature(side)]);
}

function reserveUniqueName(
  name: string,
  legacyId: number,
  names: Set<string>,
): string {
  const normalized = normalizedDeckName(name);
  if (!names.has(normalized)) {
    names.add(normalized);
    return normalized;
  }

  let suffix = 1;
  let candidate = `${normalized}（旧#${legacyId}）`;
  while (names.has(normalizedDeckName(candidate))) {
    suffix += 1;
    candidate = `${normalized}（旧#${legacyId}-${suffix}）`;
  }
  names.add(normalizedDeckName(candidate));
  return candidate;
}

function newUniqueDeckId(usedIds: Set<string>): string {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const id = globalThis.crypto.randomUUID();
    if (!usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }
  }
  throw new Error('デッキIDを安全に生成できませんでした。');
}

/**
 * Converts a v1 export from the legacy deck builder. Invalid legacy rows are
 * reported as a whole and are never partially imported.
 */
export function parseLegacyDeckImport(
  source: unknown,
  knownCardIds: ReadonlySet<string>,
  existing: readonly Deck[],
): DeckImportParseResult & { skippedCount: number; renamedCount: number } {
  if (!isLegacyDeckBackup(source)) {
    throw new Error('旧サイトから書き出したJSONファイルを選んでください。');
  }

  const rawDecks = (source as { decks: unknown[] }).decks;
  const decks: Deck[] = [];
  const invalidDecks: DeckImportError[] = [];
  const names = new Set(
    existing.map((deck) => normalizedDeckName(deck.name)).filter(Boolean),
  );
  const usedIds = new Set(existing.map((deck) => deck.id));
  const contentSignatures = new Set(
    existing.map((deck) => deckContentSignature(deck.main, deck.side)),
  );
  let skippedCount = 0;
  let renamedCount = 0;

  rawDecks.forEach((rawDeck, index) => {
    const parsed = parseLegacyDeck(rawDeck, knownCardIds);
    if (!parsed) {
      const name =
        isRecord(rawDeck) && typeof rawDeck.title === 'string'
          ? rawDeck.title
          : `デッキ${index + 1}`;
      invalidDecks.push({
        index,
        name,
        reason: 'デッキ情報、カードID、枚数の形式を確認してください。',
      });
      return;
    }

    const signature = deckContentSignature(parsed.main, parsed.side);
    if (contentSignatures.has(signature)) {
      skippedCount += 1;
      return;
    }

    const name = reserveUniqueName(parsed.name, parsed.legacyId, names);
    if (parsed.nameWasAdjusted || name !== parsed.name) renamedCount += 1;
    const deck: Deck = {
      id: newUniqueDeckId(usedIds),
      name,
      main: parsed.main,
      side: parsed.side,
      updatedAt: parsed.updatedAt,
      isSaved: true,
    };
    decks.push(deck);
    contentSignatures.add(signature);
  });

  return {
    decks,
    invalidDecks,
    totalCount: rawDecks.length,
    skippedCount,
    renamedCount,
  };
}
