import type { AppCard, Deck } from '@/app/types/deck';
import { migrateCardIdsInPile } from './card-id-migration.ts';

const MAX_SHARE_URL_LENGTH = 16_000;
const MAX_DECK_NAME_LENGTH = 200;
const MAX_CARD_ID_LENGTH = 80;
const MAX_TOTAL_CARDS = 1_000;
const SHARE_HASH_KEY = 'deck';
const SHARE_VERSION = 'v1';

const invalidDeckMessage = '共有デッキの形式が正しくありません。';
const invalidCountMessage = 'カード枚数は1以上の安全な整数で指定してください。';
const tooManyCardsMessage = '共有できるカードは合計1000枚までです。';
const tooLongCardIdMessage = 'カードIDは80文字以内で指定してください。';
const tooLongDeckNameMessage = 'デッキ名は200文字以内で指定してください。';
const tooLongUrlMessage = '共有リンクは16000文字以内にしてください。';
const unsupportedVersionMessage =
  'この共有リンクのバージョンには対応していません。';

type ShareDeckData = Pick<Deck, 'name' | 'main' | 'side'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function characterLength(value: string): number {
  return Array.from(value).length;
}

function assertDeckName(name: unknown): asserts name is string {
  if (typeof name !== 'string') throw new Error(invalidDeckMessage);
  if (characterLength(name) > MAX_DECK_NAME_LENGTH) {
    throw new Error(tooLongDeckNameMessage);
  }
}

function readPile(value: unknown): Record<string, number> {
  if (!isRecord(value)) throw new Error(invalidDeckMessage);

  const pile = Object.create(null) as Record<string, number>;
  let total = 0;
  for (const [cardId, count] of Object.entries(value)) {
    if (cardId.length === 0 || characterLength(cardId) > MAX_CARD_ID_LENGTH) {
      throw new Error(tooLongCardIdMessage);
    }
    if (
      typeof count !== 'number' ||
      !Number.isSafeInteger(count) ||
      count <= 0
    ) {
      throw new Error(invalidCountMessage);
    }
    if (count > MAX_TOTAL_CARDS - total) {
      throw new Error(tooManyCardsMessage);
    }
    total += count;
    pile[cardId] = count;
  }
  return pile;
}

function countPile(pile: Record<string, number>): number {
  return Object.values(pile).reduce((total, count) => total + count, 0);
}

function assertTotalCardLimit(
  main: Record<string, number>,
  side: Record<string, number>,
): void {
  if (countPile(main) + countPile(side) > MAX_TOTAL_CARDS) {
    throw new Error(tooManyCardsMessage);
  }
}

function validateShareData(value: unknown): ShareDeckData {
  if (!isRecord(value)) throw new Error(invalidDeckMessage);
  const keys = Object.keys(value).sort();
  if (
    keys.length !== 3 ||
    keys[0] !== 'main' ||
    keys[1] !== 'name' ||
    keys[2] !== 'side'
  ) {
    throw new Error(invalidDeckMessage);
  }

  assertDeckName(value.name);
  const main = readPile(value.main);
  const side = readPile(value.side);
  assertTotalCardLimit(main, side);
  return { name: value.name, main, side };
}

function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodeBase64Url(encoded: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) {
    throw new Error(invalidDeckMessage);
  }
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(base64 + padding);
  } catch {
    throw new Error(invalidDeckMessage);
  }

  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const canonical = encodeBase64Url(new TextDecoder().decode(bytes));
  if (canonical !== encoded) throw new Error(invalidDeckMessage);

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(invalidDeckMessage);
  }
}

function createDeckId(): string {
  return globalThis.crypto.randomUUID();
}

/** Builds a versioned, self-contained link containing only name and card counts. */
export function buildDeckShareUrl(deck: Deck, baseUrl: string): string {
  const data = validateShareData({
    name: deck?.name,
    main: deck?.main,
    side: deck?.side,
  });
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new Error('共有リンクのURLを作成できませんでした。');
  }
  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    throw new Error('共有リンクにはHTTPまたはHTTPSのURLを指定してください。');
  }
  base.username = '';
  base.password = '';
  base.search = '';
  base.hash = '';

  const payload = encodeBase64Url(JSON.stringify(data));
  const shareUrl =
    base.toString() +
    '#' +
    SHARE_HASH_KEY +
    '=' +
    SHARE_VERSION +
    '.' +
    payload;
  if (shareUrl.length > MAX_SHARE_URL_LENGTH) {
    throw new Error(tooLongUrlMessage);
  }
  return shareUrl;
}

/** Parses a deck share hash, returning null when it does not contain `deck`. */
export function parseDeckShareHash(
  hash: string,
  knownCardIds: ReadonlySet<string>,
): Deck | null {
  const parameters = new URLSearchParams(
    hash.startsWith('#') ? hash.slice(1) : hash,
  );
  const values = parameters.getAll(SHARE_HASH_KEY);
  if (values.length === 0) return null;
  if (values.length !== 1) {
    throw new Error('共有リンクにデッキ指定が複数あります。');
  }
  if (hash.length > MAX_SHARE_URL_LENGTH) throw new Error(tooLongUrlMessage);

  const separatorIndex = values[0].indexOf('.');
  if (separatorIndex < 0 || values[0].indexOf('.', separatorIndex + 1) >= 0) {
    throw new Error(invalidDeckMessage);
  }
  const version = values[0].slice(0, separatorIndex);
  const encoded = values[0].slice(separatorIndex + 1);
  if (version !== SHARE_VERSION) {
    if (/^v\d+$/.test(version ?? ''))
      throw new Error(unsupportedVersionMessage);
    throw new Error(invalidDeckMessage);
  }
  if (!encoded) throw new Error(invalidDeckMessage);

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeBase64Url(encoded)) as unknown;
  } catch (error) {
    if (error instanceof Error && error.message !== invalidDeckMessage) {
      throw new Error('共有リンクのデータを読み取れません。');
    }
    throw error;
  }

  const data = validateShareData(parsed);
  const migratedMain = migrateCardIdsInPile(data.main);
  const migratedSide = migrateCardIdsInPile(data.side);
  if (!migratedMain || !migratedSide) throw new Error(invalidCountMessage);
  assertTotalCardLimit(migratedMain, migratedSide);
  if (
    !Object.keys(migratedMain).every((cardId) => knownCardIds.has(cardId)) ||
    !Object.keys(migratedSide).every((cardId) => knownCardIds.has(cardId))
  ) {
    throw new Error('共有リンクに登録されていないカードIDが含まれています。');
  }

  return {
    id: createDeckId(),
    name: data.name,
    main: migratedMain,
    side: migratedSide,
    updatedAt: new Date().toISOString(),
    isSaved: false,
  };
}

function pileTotal(pile: Record<string, number>): number {
  return countPile(pile);
}

function sortedPileEntries(
  pile: Record<string, number>,
  cardsById: ReadonlyMap<string, AppCard>,
): Array<[string, number]> {
  const catalogOrder = new Map(
    Array.from(cardsById.keys(), (cardId, index) => [cardId, index] as const),
  );
  return Object.entries(pile).sort(([left], [right]) => {
    const leftOrder = catalogOrder.get(left);
    const rightOrder = catalogOrder.get(right);
    if (leftOrder !== undefined && rightOrder !== undefined) {
      return leftOrder - rightOrder;
    }
    if (leftOrder !== undefined) return -1;
    if (rightOrder !== undefined) return 1;
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

function formatPile(
  pile: Record<string, number>,
  cardsById: ReadonlyMap<string, AppCard>,
): string[] {
  const entries = sortedPileEntries(pile, cardsById);
  if (entries.length === 0) return ['なし'];
  return entries.map(([cardId, count]) => {
    const card = cardsById.get(cardId);
    const label = card
      ? card.name + '（' + cardId + '）'
      : '不明カード（' + cardId + '）';
    return '- ' + label + ' × ' + String(count);
  });
}

/** Formats a readable deck list without dropping unknown card IDs. */
export function formatDeckText(
  deck: Deck,
  cardsById: ReadonlyMap<string, AppCard>,
): string {
  const data = validateShareData({
    name: deck?.name,
    main: deck?.main,
    side: deck?.side,
  });
  const mainCount = pileTotal(data.main);
  const sideCount = pileTotal(data.side);
  return [
    data.name,
    '',
    'メインデッキ（' + String(mainCount) + '枚）',
    ...formatPile(data.main, cardsById),
    '',
    'サイドデッキ（' + String(sideCount) + '枚）',
    ...formatPile(data.side, cardsById),
  ].join('\n');
}
