import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDeckShareUrl,
  formatDeckText,
  parseDeckShareHash,
} from '../lib/deck-share.ts';

const knownCardIds = new Set([
  '01-001',
  '01-002',
  'FA-SR-01-001',
  'FA-SR-01-003',
]);

function deck(name = '赤単', main = { '01-001': 40 }, side = {}) {
  return {
    id: 'private-id',
    name,
    main,
    side,
    updatedAt: '2026-09-06T00:00:00.000Z',
    isSaved: true,
    color: 'orange',
  };
}

function shareHash(value, version = 'v1') {
  const payload = Buffer.from(JSON.stringify(value), 'utf8').toString(
    'base64url',
  );
  return '#deck=' + version + '.' + payload;
}

function assertJapaneseError(callback, message) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /[ぁ-んァ-ン一-龯]/);
    if (message) assert.match(error.message, message);
    return true;
  });
}

test('share links round-trip Japanese and emoji counts without private deck metadata', () => {
  const source = deck('信長🐉のデッキ', { '01-001': 3 }, { '01-002': 2 });
  const url = buildDeckShareUrl(
    source,
    'https://example.test/recipe?tab=old#section',
  );
  const result = parseDeckShareHash(new URL(url).hash, knownCardIds);

  assert.ok(result);
  assert.equal(result.name, source.name);
  assert.deepEqual(result.main, { '01-001': 3 });
  assert.deepEqual(result.side, { '01-002': 2 });
  assert.notEqual(result.id, source.id);
  assert.match(result.id, /^[0-9a-f-]{36}$/i);
  assert.equal(result.isSaved, false);
  assert.ok(Number.isFinite(Date.parse(result.updatedAt)));
  assert.equal(result.color, undefined);

  const decoded = JSON.parse(
    Buffer.from(
      new URL(url).hash.slice('#deck=v1.'.length),
      'base64url',
    ).toString('utf8'),
  );
  assert.deepEqual(Object.keys(decoded).sort(), ['main', 'name', 'side']);
  assert.equal(url.startsWith('https://example.test/recipe#deck=v1.'), true);
});

test('strips base URL credentials, query and hash while preserving origin and path', () => {
  const url = buildDeckShareUrl(
    deck('共有', { '01-001': 1 }),
    'https://test-user:test-password@example.test/decks/123?keep=no#old-section',
  );

  assert.equal(new URL(url).origin, 'https://example.test');
  assert.equal(new URL(url).pathname, '/decks/123');
  assert.equal(new URL(url).search, '');
  assert.equal(new URL(url).username, '');
  assert.equal(new URL(url).password, '');
  assert.match(new URL(url).hash, /^#deck=v1\./);
});

test('returns null for unrelated hashes and rejects duplicate deck parameters', () => {
  assert.equal(parseDeckShareHash('', knownCardIds), null);
  assert.equal(
    parseDeckShareHash('#tab=recipe&section=cards', knownCardIds),
    null,
  );
  assertJapaneseError(
    () => parseDeckShareHash('#deck=v1.a&deck=v1.b', knownCardIds),
    /複数/,
  );
});

test('rejects unsupported versions, malformed base64, invalid UTF-8, and invalid JSON', () => {
  const validPayload = { name: '共有', main: {}, side: {} };
  const encoded = Buffer.from(JSON.stringify(validPayload), 'utf8').toString(
    'base64url',
  );
  assertJapaneseError(
    () => parseDeckShareHash('#deck=v2.' + encoded, knownCardIds),
    /バージョン/,
  );
  assertJapaneseError(() =>
    parseDeckShareHash('#deck=v1.' + encoded + '.extra', knownCardIds),
  );
  assertJapaneseError(() => parseDeckShareHash('#deck=v1.%%%', knownCardIds));
  assertJapaneseError(() => parseDeckShareHash('#deck=v1._w', knownCardIds));
  const malformedJson = Buffer.from('{broken', 'utf8').toString('base64url');
  assertJapaneseError(() =>
    parseDeckShareHash('#deck=v1.' + malformedJson, knownCardIds),
  );
});

test('rejects malformed schemas, unknown IDs, and non-deck payload fields', () => {
  assertJapaneseError(() =>
    parseDeckShareHash(shareHash({ name: '欠落', main: {} }), knownCardIds),
  );
  assertJapaneseError(() =>
    parseDeckShareHash(
      shareHash({ name: '未知', main: { unknown: 1 }, side: {} }),
      knownCardIds,
    ),
  );
  assertJapaneseError(() =>
    parseDeckShareHash(
      shareHash({ name: '余分', main: {}, side: {}, id: 'private' }),
      knownCardIds,
    ),
  );
});

test('migrates legacy IDs and combines canonical counts in each pile', () => {
  const hash = shareHash({
    name: '旧ID',
    main: { 'PSR-01-008': 400, 'FA-SR-01-001': 500 },
    side: { 'HW-SR-01-007': 2, 'FA-SR-01-003': 3 },
  });
  const result = parseDeckShareHash(hash, knownCardIds);

  assert.deepEqual(result?.main, { 'FA-SR-01-001': 900 });
  assert.deepEqual(result?.side, { 'FA-SR-01-003': 5 });
});

test('rejects zero, negative, fractional, unsafe, and over-limit counts', () => {
  for (const count of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assertJapaneseError(() =>
      parseDeckShareHash(
        shareHash({ name: '不正', main: { '01-001': count }, side: {} }),
        knownCardIds,
      ),
    );
    assertJapaneseError(() =>
      buildDeckShareUrl(
        deck('不正', { '01-001': count }),
        'https://example.test/',
      ),
    );
  }

  assertJapaneseError(
    () =>
      parseDeckShareHash(
        shareHash({
          name: '上限超過',
          main: { '01-001': 700 },
          side: { '01-002': 301 },
        }),
        knownCardIds,
      ),
    /1000/,
  );
  assertJapaneseError(
    () =>
      buildDeckShareUrl(
        deck('上限超過', { '01-001': 700 }, { '01-002': 301 }),
        'https://example.test/',
      ),
    /1000/,
  );
});

test('enforces name, card ID, and total-card limits at the boundary', () => {
  const longId = 'x'.repeat(80);
  const idsAtBoundary = new Set([...knownCardIds, longId]);
  const accepted = deck('名'.repeat(200), { [longId]: 1000 });
  const result = parseDeckShareHash(
    new URL(buildDeckShareUrl(accepted, 'https://example.test/')).hash,
    idsAtBoundary,
  );
  assert.equal(result?.name, '名'.repeat(200));
  assert.equal(result?.main[longId], 1000);

  assertJapaneseError(() =>
    buildDeckShareUrl(deck('名'.repeat(201)), 'https://example.test/'),
  );
  assertJapaneseError(() =>
    buildDeckShareUrl(
      deck('長いID', { ['x'.repeat(81)]: 1 }),
      'https://example.test/',
    ),
  );
  assertJapaneseError(() =>
    parseDeckShareHash(
      shareHash({ name: '長いID', main: { ['x'.repeat(81)]: 1 }, side: {} }),
      new Set(['x'.repeat(81)]),
    ),
  );
  assertJapaneseError(
    () =>
      buildDeckShareUrl(
        deck('枚数', { '01-001': 1001 }),
        'https://example.test/',
      ),
    /1000/,
  );
});

test('enforces the 16000-character link limit and accepts the exact boundary', () => {
  const source = deck('x', {}, {});
  const sampleBase = 'https://x.test/';
  const sampleLink = buildDeckShareUrl(source, sampleBase);
  const shareSuffix = sampleLink.slice(sampleBase.length);
  const exactBaseLength = 16_000 - shareSuffix.length;
  const exactBase =
    sampleBase + 'a'.repeat(exactBaseLength - sampleBase.length);
  const exactLink = buildDeckShareUrl(source, exactBase);

  assert.equal(exactLink.length, 16_000);
  assertJapaneseError(
    () => buildDeckShareUrl(source, exactBase + 'a'),
    /16000/,
  );
  assertJapaneseError(
    () => parseDeckShareHash('#deck=v1.' + 'A'.repeat(16_000), knownCardIds),
    /16000/,
  );

  const manyIds = Object.fromEntries(
    Array.from({ length: 200 }, (_, index) => [
      String(index).padStart(3, '0') + 'x'.repeat(77),
      1,
    ]),
  );
  assertJapaneseError(
    () => buildDeckShareUrl(deck('長い共有', manyIds), 'https://x.test/'),
    /16000/,
  );
});

test('formats counts, catalog order, empty piles, and unknown IDs deterministically', () => {
  const cardsById = new Map([
    ['02-001', { id: '02-001', name: '二番目', number: '2' }],
    ['01-001', { id: '01-001', name: '一番目', number: '1' }],
  ]);
  const text = formatDeckText(
    deck('共有デッキ', {
      '01-001': 1,
      '02-001': 2,
      'unknown-id': 3,
    }),
    cardsById,
  );

  assert.match(text, /^共有デッキ\n/);
  assert.match(text, /メインデッキ（6枚）/);
  assert.ok(
    text.indexOf('二番目（02-001）') < text.indexOf('一番目（01-001）'),
  );
  assert.ok(text.indexOf('一番目（01-001）') < text.indexOf('unknown-id'));
  assert.match(text, /不明カード（unknown-id） × 3/);
  assert.match(text, /サイドデッキ（0枚）\nなし/);
  assert.equal(
    formatDeckText(deck('空', {}, {}), cardsById),
    '空\n\nメインデッキ（0枚）\nなし\n\nサイドデッキ（0枚）\nなし',
  );
});

test('text output also rejects invalid counts and card ID limits', () => {
  const cardsById = new Map();
  assertJapaneseError(() =>
    formatDeckText(deck('負数', { '01-001': -1 }), cardsById),
  );
  assertJapaneseError(() =>
    formatDeckText(deck('長いID', { ['x'.repeat(81)]: 1 }), cardsById),
  );
});
