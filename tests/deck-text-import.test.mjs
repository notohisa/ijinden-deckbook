import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { legacyDeckTextNames } from '../data/legacy-deck-text-names.ts';
import { ijindenCards } from '../app/ijinden-cards.ts';
import { customCards } from '../app/custom-cards.ts';
import {
  DeckTextImportAmbiguityError,
  parseDeckTextImport,
} from '../lib/deck-text-import.ts';
import { formatDeckText } from '../lib/deck-share.ts';

const cards = [...ijindenCards, ...customCards];
const cardsById = new Map(cards.map((card) => [card.id, card]));

// Public recipe fixture from the original builder's exporter tests:
// https://github.com/sweetpotato/ijinden-deck-builder/blob/bfc236c9943cc4238184317c5ce7d40dab7b0097/src/TabPaneDeck/ContainerDeckExport/index.test.jsx
test('imports the original exporter fixture without manual selection or losing side counts', () => {
  const source = readFileSync(
    new URL('./fixtures/original-builder.tsv', import.meta.url),
    'utf8',
  );
  const imported = parseDeckTextImport(source, cards, 'RSコロッセオ優勝デッキ')
    .decks[0];
  assert.deepEqual(imported.main, {
    '02-001': 2,
    '01-017': 2,
    '02-009': 4,
    '03-009': 1,
    'P-011': 4,
    'R-011': 4,
    '02-059': 2,
    '03-069': 2,
    '02-068': 2,
    '03-071': 4,
    '04-068': 1,
    '04-072': 2,
    '03-075': 4,
    'P-015': 1,
    '02-078': 1,
    '04-080': 4,
  });
  assert.deepEqual(imported.side, {
    '03-047': 4,
    '01-017': 1,
    '04-068': 1,
    '03-074': 1,
    '04-074': 2,
    '02-078': 1,
  });
});

test('maps every original display name to exactly one current official card', () => {
  assert.equal(legacyDeckTextNames.size, ijindenCards.length);
  assert.deepEqual(
    [...legacyDeckTextNames.values()].sort(),
    ijindenCards.map((card) => card.id).sort(),
  );
  const source =
    'メインデッキ\t' +
    legacyDeckTextNames.size +
    '\n' +
    [...legacyDeckTextNames.keys()].map((name) => name + '\t1').join('\n') +
    '\n\nサイドデッキ\t0';
  const imported = parseDeckTextImport(source, cards).decks[0];
  assert.deepEqual(
    imported.main,
    Object.fromEntries(ijindenCards.map((card) => [card.id, 1])),
  );
  assert.deepEqual(imported.side, {});
});

test('preserves starter, booster, PSR and normal printing distinctions', () => {
  const source =
    'メインデッキ\t4\nロイヤリティ (スターター)\t1\nロイヤリティ (第5弾)\t1\n土方歳三\t1\n土方歳三 (PSR)\t1\nサイドデッキ\t0';
  assert.deepEqual(parseDeckTextImport(source, cards).decks[0].main, {
    'R-011': 1,
    '05-078': 1,
    '03-009': 1,
    '03-081': 1,
  });
});
const sample =
  'メインデッキ\t6\n北条政子\t2\n喜びの種\t4\n\nサイドデッキ\t1\n悲しみの種\t1';

test('imports original two-column TSV with counts, both piles and a supplied name', () => {
  const result = parseDeckTextImport(sample, cards, ' 移行テスト 🦉 ');
  assert.equal(result.totalCount, 1);
  assert.equal(result.invalidDecks.length, 0);
  assert.equal(result.decks[0].name, '移行テスト 🦉');
  assert.deepEqual(result.decks[0].main, { '01-013': 2, '03-071': 4 });
  assert.deepEqual(result.decks[0].side, { '03-075': 1 });
  assert.equal(result.decks[0].isSaved, false);
});

test('accepts BOM, Windows newlines, empty side and full-width integer cells', () => {
  const source =
    '\uFEFFメインデッキ\t４\r\n 喜びの種 \t４\r\n\r\nサイドデッキ\t０\r\n';
  const result = parseDeckTextImport(source, cards).decks[0];
  assert.deepEqual(result.main, { '03-071': 4 });
  assert.deepEqual(result.side, {});
  assert.match(result.name, /^テキストから作成 /);
});

test('requires explicit selection for same-name printings and applies it to both piles', () => {
  const source =
    'メインデッキ\t3\nカンテラ\t1\nカンテラ\t2\n\nサイドデッキ\t1\nカンテラ\t1';
  assert.throws(
    () => parseDeckTextImport(source, cards),
    (error) => {
      assert.ok(error instanceof DeckTextImportAmbiguityError);
      assert.equal(error.choices.length, 1);
      assert.equal(error.choices[0].key, 'カンテラ');
      assert.deepEqual(
        error.choices[0].candidates.map((card) => card.id),
        ['01-058', '06-065'],
      );
      return true;
    },
  );
  const imported = parseDeckTextImport(source, cards, '', {
    カンテラ: '06-065',
  }).decks[0];
  assert.deepEqual(imported.main, { '06-065': 3 });
  assert.deepEqual(imported.side, { '06-065': 1 });
  assert.throws(
    () => parseDeckTextImport(source, cards, '', { カンテラ: '01-013' }),
    DeckTextImportAmbiguityError,
  );
});

test('round-trips this app text with Unicode title and exact official/custom IDs', () => {
  const source = {
    id: 'old-id',
    name: '紫と赤 🦉',
    main: { '01-058': 2, '06-065': 1, 'FA-SR-01-001': 1 },
    side: {},
    updatedAt: '',
    isSaved: true,
  };
  const result = parseDeckTextImport(formatDeckText(source, cardsById), cards)
    .decks[0];
  assert.equal(result.name, source.name);
  assert.notEqual(result.id, source.id);
  assert.deepEqual(result.main, source.main);
  assert.deepEqual(result.side, {});
  assert.equal(
    parseDeckTextImport(formatDeckText(source, cardsById), cards, '別名')
      .decks[0].name,
    '別名',
  );
});

test('migrates retired custom IDs without changing their counts', () => {
  const source =
    '旧レシピ\n\nメインデッキ（2枚）\n- マーサ・ジェーン・カナリー（PSR-01-008） × 2\n\nサイドデッキ（0枚）\nなし';
  assert.deepEqual(parseDeckTextImport(source, cards).decks[0].main, {
    'FA-SR-01-001': 2,
  });
});

test('rejects unknown names, IDs and inconsistent ID/name rows instead of omitting them', () => {
  assert.throws(
    () =>
      parseDeckTextImport(sample.replace('北条政子', '未知のカード'), cards),
    /2行目.*見つかりません/,
  );
  assert.throws(
    () =>
      parseDeckTextImport(
        'メインデッキ（1枚）\n- 北条政子（unknown） × 1\nサイドデッキ（0枚）\nなし',
        cards,
      ),
    /登録されていません/,
  );
  assert.throws(
    () =>
      parseDeckTextImport(
        'メインデッキ（1枚）\n- 北条政子（01-001） × 1\nサイドデッキ（0枚）\nなし',
        cards,
      ),
    /一致していません/,
  );
});

test('rejects truncated, mixed or duplicate sections and declared-total mismatches', () => {
  assert.throws(
    () => parseDeckTextImport('メインデッキ\t2\n北条政子\t2', cards),
    /サイドデッキの見出し/,
  );
  assert.throws(
    () =>
      parseDeckTextImport(
        sample.replace('メインデッキ\t6', 'メインデッキ\t7'),
        cards,
      ),
    /合計が一致しません/,
  );
  assert.throws(
    () => parseDeckTextImport(sample + '\nメインデッキ\t0', cards),
    /重複/,
  );
  assert.throws(
    () =>
      parseDeckTextImport(
        sample.replace('サイドデッキ\t1', 'サイドデッキ（1枚）'),
        cards,
      ),
    /異なるテキスト形式/,
  );
});

test('validates counts, total limits, input length, title length and nonempty deck', () => {
  for (const count of [
    '0',
    '-1',
    '1.5',
    'Infinity',
    'NaN',
    '1001',
    '9007199254740992',
    '2e1',
  ]) {
    assert.throws(() =>
      parseDeckTextImport(
        'メインデッキ\t1\n北条政子\t' + count + '\nサイドデッキ\t0',
        cards,
      ),
    );
  }
  assert.throws(
    () =>
      parseDeckTextImport(
        'メインデッキ\t600\n北条政子\t600\nサイドデッキ\t401\n北条政子\t401',
        cards,
      ),
    /1000枚/,
  );
  assert.throws(
    () => parseDeckTextImport('a'.repeat(400001), cards),
    /40万文字/,
  );
  assert.throws(
    () => parseDeckTextImport(sample, cards, '名'.repeat(201)),
    /200文字/,
  );
  assert.throws(
    () => parseDeckTextImport('メインデッキ\t0\nサイドデッキ\t0', cards),
    /カードがありません/,
  );
});
