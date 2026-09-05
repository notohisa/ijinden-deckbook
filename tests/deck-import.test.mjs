import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createImportPreview,
  mergeImportedDecks,
  parseDeckImport,
} from '../lib/deck-import.ts';

const knownCardIds = new Set(['01-001', '01-002']);

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

test('同名の既存デッキは更新、それ以外は新規としてプレビューする', () => {
  const existing = [deck('local', '赤単')];
  const imported = [deck('from-file', '赤単'), deck('new', '青単')];
  const preview = createImportPreview(imported, existing);
  assert.deepEqual(
    preview.map((item) => item.action),
    ['update', 'add'],
  );
  assert.equal(preview[0].existingDeck?.id, 'local');
});

test('選択したインポートだけを同名で上書きし、既存JSONの色や内容を保つ', () => {
  const existing = [{ ...deck('local', '赤単'), color: 'orange' }];
  const imported = [
    { ...deck('from-file', '赤単', { '01-002': 40 }), color: 'gray' },
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
