import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createImportPreview,
  mergeImportedDecks,
  parseDeckImport,
} from '../lib/deck-import.ts';

const knownCardIds = new Set([
  '01-001',
  '01-002',
  'FA-SR-01-001',
  'FA-SR-01-002',
  'FA-SR-01-003',
]);

function deck(id, name, main = { '01-001': 40 }) {
  return {
    id,
    name,
    main,
    side: {},
    updatedAt: '2026-09-06T00:00:00.000Z',
    isSaved: true,
  };
}

test('既存エクスポート形式を解析し、不正なカードだけを分ける', () => {
  const result = parseDeckImport(
    { decks: [deck('one', '赤単'), deck('bad', '不正', { unknown: 1 })] },
    knownCardIds,
  );
  assert.equal(result.totalCount, 2);
  assert.equal(result.decks.length, 1);
  assert.equal(result.decks[0].name, '赤単');
  assert.equal(result.invalidDecks.length, 1);
  assert.equal(result.invalidDecks[0].name, '不正');
});

test('JSON imports migrate aliases before checking known IDs and retain summed counts', () => {
  const result = parseDeckImport(
    {
      decks: [
        {
          ...deck('legacy', '旧IDを含むデッキ', {
            'PSR-01-008': 2,
            'FA-SR-01-001': 1,
            'HW-SR-01-007': 3,
            'FA-SR-01-002': 4,
          }),
          side: { 'HW-SR-01-007': 1, 'FA-SR-01-003': 2, '01-002': 1 },
        },
        deck('unknown', '未知ID', { 'unknown-card': 1 }),
      ],
    },
    knownCardIds,
  );

  assert.equal(result.totalCount, 2);
  assert.equal(result.decks.length, 1);
  assert.deepEqual(result.decks[0].main, {
    'FA-SR-01-001': 3,
    'FA-SR-01-003': 3,
    'FA-SR-01-002': 4,
  });
  assert.deepEqual(result.decks[0].side, {
    'FA-SR-01-003': 3,
    '01-002': 1,
  });
  assert.equal(result.invalidDecks.length, 1);
  assert.equal(result.invalidDecks[0].name, '未知ID');
});

test('import rejects unsafe counts created by combining an old and canonical ID', () => {
  const result = parseDeckImport(
    {
      decks: [
        deck('overflow', '枚数超過', {
          'PSR-01-008': Number.MAX_SAFE_INTEGER,
          'FA-SR-01-001': 1,
        }),
      ],
    },
    knownCardIds,
  );

  assert.deepEqual(result.decks, []);
  assert.equal(result.invalidDecks.length, 1);
  assert.equal(result.invalidDecks[0].name, '枚数超過');
});

test('同名でもIDが異なれば番号を付けて新規としてプレビューする', () => {
  const existing = [deck('local', '赤単')];
  const imported = [deck('from-file', '赤単'), deck('new', '青単')];
  const preview = createImportPreview(imported, existing);
  assert.deepEqual(
    preview.map((item) => item.action),
    ['add', 'add'],
  );
  assert.equal(preview[0].existingDeck, undefined);
  assert.equal(preview[0].deck.name, '赤単 (2)');
});

test('選択した同じIDだけを更新し、JSONの色や内容を保つ', () => {
  const existing = [{ ...deck('local', '赤単'), color: 'orange' }];
  const imported = [
    { ...deck('local', '赤単', { '01-002': 40 }), color: 'gray' },
    deck('new', '青単'),
  ];
  const result = mergeImportedDecks(existing, [imported[0]]);
  assert.equal(result.added, 0);
  assert.equal(result.updated, 1);
  assert.equal(result.decks.length, 1);
  assert.equal(result.decks[0].id, 'local');
  assert.equal(result.decks[0].color, 'gray');
  assert.deepEqual(result.decks[0].main, { '01-002': 40 });
});
