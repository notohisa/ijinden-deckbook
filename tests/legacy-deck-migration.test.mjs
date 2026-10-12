import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LEGACY_BACKUP_TYPE,
  isLegacyDeckBackup,
  parseLegacyDeckImport,
} from '../lib/legacy-deck-migration.ts';

const exportedAt = '2026-10-12T03:00:00.000Z';
const legacyTimestamp = '2025-01-01T06:19:40.443Z';
const knownCardIds = new Set([
  '01-001',
  '02-001',
  '03-001',
  '04-001',
  '05-001',
  '06-001',
  'R-001',
  '01-002',
  '01-003',
]);

function legacyDeck(
  id,
  title,
  main = [['1-1', 1]],
  side = [],
  timestamp = legacyTimestamp,
) {
  return { id, title, timestamp, main, side };
}

function backup(decks) {
  return { version: 1, type: LEGACY_BACKUP_TYPE, exportedAt, decks };
}

function existingDeck(id, name, main, side = {}) {
  return {
    id,
    name,
    main,
    side,
    updatedAt: exportedAt,
    isSaved: true,
  };
}

test('旧サイトのバックアップを version と型を含めて厳格に識別する', () => {
  assert.equal(isLegacyDeckBackup(backup([])), true);
  assert.equal(isLegacyDeckBackup({ ...backup([]), version: 2 }), false);
  assert.equal(isLegacyDeckBackup({ ...backup([]), type: 'other' }), false);
  assert.equal(
    isLegacyDeckBackup({ ...backup([]), exportedAt: 'yesterday' }),
    false,
  );
  assert.equal(isLegacyDeckBackup({ ...backup([]), decks: {} }), false);
  assert.equal(isLegacyDeckBackup(null), false);
  assert.throws(() => parseLegacyDeckImport({ decks: [] }, knownCardIds, []));
});

test('旧カードIDのセット番号を新形式に変換し timestamp を保持する', () => {
  const result = parseLegacyDeckImport(
    backup([
      legacyDeck(1, '第1弾', [
        ['1-1', 1],
        ['2-1', 2],
        ['3-1', 3],
        ['4-1', 4],
      ]),
      legacyDeck(2, '第2弾1', [['2nd1-1', 5]]),
      legacyDeck(3, '第2弾2', [['2nd2-1', 6]]),
      legacyDeck(4, 'Rカード', [['R-1', 1]]),
    ]),
    knownCardIds,
    [],
  );

  assert.equal(result.decks.length, 4);
  assert.deepEqual(result.decks[0].main, {
    '01-001': 1,
    '02-001': 2,
    '03-001': 3,
    '04-001': 4,
  });
  assert.deepEqual(result.decks[1].main, { '05-001': 5 });
  assert.deepEqual(result.decks[2].main, { '06-001': 6 });
  assert.deepEqual(result.decks[3].main, { 'R-001': 1 });
  assert.equal(result.decks[0].updatedAt, legacyTimestamp);
  assert.ok(result.decks.every((deck) => deck.isSaved));
  assert.equal(new Set(result.decks.map((deck) => deck.id)).size, 4);
  assert.ok(result.decks.every((deck) => deck.id !== '1' && deck.id !== '2'));
});

test('旧DB DateをJSON化したISO timestampを保持する', () => {
  const source = JSON.parse(
    JSON.stringify({
      version: 1,
      type: LEGACY_BACKUP_TYPE,
      exportedAt: new Date(exportedAt),
      decks: [
        {
          ...legacyDeck(40, 'Date型の保存デッキ'),
          timestamp: new Date(legacyTimestamp),
        },
      ],
    }),
  );
  const result = parseLegacyDeckImport(source, knownCardIds, []);

  assert.equal(result.invalidDecks.length, 0);
  assert.equal(result.decks.length, 1);
  assert.equal(result.decks[0].updatedAt, legacyTimestamp);
});

test('数値timestampも維持し、不正なISO timestampはデッキ全体をinvalidにする', () => {
  const numericTimestamp = 1_781_189_200_000;
  const result = parseLegacyDeckImport(
    backup([
      legacyDeck(41, '数値timestamp', undefined, undefined, numericTimestamp),
      legacyDeck(42, '不正ISO', undefined, undefined, 'not-a-timestamp'),
    ]),
    knownCardIds,
    [],
  );

  assert.equal(result.totalCount, 2);
  assert.equal(result.decks.length, 1);
  assert.equal(
    result.decks[0].updatedAt,
    new Date(numericTimestamp).toISOString(),
  );
  assert.deepEqual(
    result.invalidDecks.map(({ name }) => name),
    ['不正ISO'],
  );
});

test('同名デッキには旧ID suffix を付け、既存とファイル内の同一内容は省略する', () => {
  const existing = [existingDeck('local', '赤単', { '01-001': 1 })];
  const originalExisting = structuredClone(existing);
  const result = parseLegacyDeckImport(
    backup([
      legacyDeck(10, '赤単', [['1-1', 2]]),
      legacyDeck(11, '赤単', [['1-2', 2]]),
      legacyDeck(12, '別名', [['1-1', 2]]),
      legacyDeck(13, '既存と同じ', [['1-1', 1]]),
    ]),
    knownCardIds,
    existing,
  );

  assert.equal(result.totalCount, 4);
  assert.equal(result.skippedCount, 2);
  assert.equal(result.renamedCount, 2);
  assert.deepEqual(
    result.decks.map((deck) => deck.name),
    ['赤単（旧#10）', '赤単（旧#11）'],
  );
  assert.equal(result.invalidDecks.length, 0);
  assert.deepEqual(existing, originalExisting);
});

test('欠落タイトルを補い、末尾番号まで含めて名前衝突を避ける', () => {
  const result = parseLegacyDeckImport(
    backup([
      legacyDeck(20, '', [['1-1', 2]]),
      legacyDeck(21, '名称未設定（旧#20）', [['1-2', 2]]),
      legacyDeck(22, '名称未設定（旧#20）', [['1-3', 2]]),
    ]),
    knownCardIds,
    [existingDeck('old', '名称未設定（旧#21）', {})],
  );

  assert.equal(result.decks[0].name, '名称未設定（旧#20）');
  assert.equal(result.decks[1].name, '名称未設定（旧#20）（旧#21）');
  assert.equal(result.decks[2].name, '名称未設定（旧#20）（旧#22）');
  assert.equal(result.renamedCount, 3);
  assert.equal(new Set(result.decks.map((deck) => deck.name)).size, 3);
});

test('suffix名も既存と衝突する場合は番号を進める', () => {
  const existing = [
    existingDeck('base', '赤単', { '01-001': 1 }),
    existingDeck('first', '赤単（旧#30）', { '01-002': 1 }),
    existingDeck('second', '赤単（旧#30-2）', { '01-003': 1 }),
  ];
  const result = parseLegacyDeckImport(
    backup([legacyDeck(30, '赤単', [['1-1', 2]])]),
    knownCardIds,
    existing,
  );

  assert.equal(result.decks[0].name, '赤単（旧#30-3）');
  assert.equal(result.renamedCount, 1);
});

test('未知ID、不正行、枚数不正、重複行のoverflowはデッキ全体をinvalidにする', () => {
  const source = backup([
    legacyDeck(1, '未知', [['unknown', 1]]),
    legacyDeck(2, '__proto__', [['__proto__', 1]]),
    legacyDeck(3, '不正行', [['1-1', 1, 'extra']]),
    legacyDeck(4, '不正枚数', [['1-1', 0]]),
    legacyDeck(5, 'overflow', [
      ['1-1', Number.MAX_SAFE_INTEGER],
      ['1-1', 1],
    ]),
    legacyDeck(
      6,
      '別pile overflow',
      [['1-1', Number.MAX_SAFE_INTEGER]],
      [['1-2', 1]],
    ),
    { ...legacyDeck(7, '壊れたID'), id: 0 },
  ]);
  const original = structuredClone(source);
  const result = parseLegacyDeckImport(source, knownCardIds, []);

  assert.equal(result.totalCount, 7);
  assert.equal(result.decks.length, 0);
  assert.equal(result.invalidDecks.length, 7);
  assert.deepEqual(
    result.invalidDecks.map((item) => item.name),
    [
      '未知',
      '__proto__',
      '不正行',
      '不正枚数',
      'overflow',
      '別pile overflow',
      '壊れたID',
    ],
  );
  assert.deepEqual(source, original);
});
