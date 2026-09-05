import assert from 'node:assert/strict';
import test from 'node:test';

import { validateDeck } from '../lib/deck-validator.ts';

function card(id, name, deckLimit) {
  return {
    id,
    name,
    number: id,
    release: 'テスト',
    cardType: 'イジン',
    rarity: 'N',
    color: '赤',
    level: 1,
    power: 1000,
    trait: '',
    description: '',
    imageUrl: '',
    ...(deckLimit === undefined ? {} : { deckLimit }),
  };
}

function deck(main, side = {}) {
  return {
    id: 'deck',
    name: 'テスト',
    main,
    side,
    updatedAt: '2026-09-06T00:00:00.000Z',
  };
}

const cardsById = new Map([
  ['one', card('one', '信長')],
  ['two', card('two', '信長')],
  ['three', card('three', 'ナポレオン', null)],
  ['free', card('free', '無制限', null)],
]);

test('40枚以上のメイン、10枚以下のサイド、60枚以下は使用可能', () => {
  const result = validateDeck(deck({ one: 4, three: 36 }, { free: 8 }), {
    cardsById,
  });
  assert.equal(result.status, 'valid');
  assert.equal(result.mainCount, 40);
  assert.equal(result.sideCount, 8);
  assert.equal(result.totalCount, 48);
  assert.deepEqual(result.errors, []);
});

test('40枚未満は作成途中になる', () => {
  const result = validateDeck(deck({ one: 4, three: 35 }), { cardsById });
  assert.equal(result.status, 'incomplete');
  assert.equal(result.warnings[0].code, 'main-minimum');
  assert.equal(result.warnings[0].detail, 'あと1枚必要です');
});

test('サイド11枚と合計61枚を検出する', () => {
  const sideTooMany = validateDeck(deck({ one: 4, three: 36 }, { free: 11 }), {
    cardsById,
  });
  assert.equal(sideTooMany.status, 'invalid');
  assert.ok(sideTooMany.errors.some((issue) => issue.code === 'side-maximum'));

  const totalTooMany = validateDeck(deck({ one: 4, three: 57 }, { free: 1 }), {
    cardsById,
  });
  assert.equal(totalTooMany.status, 'invalid');
  assert.ok(
    totalTooMany.errors.some((issue) => issue.code === 'total-maximum'),
  );
});

test('別IDの同名カードはメインとサイドをまたいで合算する', () => {
  const result = validateDeck(deck({ one: 3, two: 1, three: 36 }, { two: 1 }), {
    cardsById,
  });
  const issue = result.errors.find(
    (entry) => entry.code === 'card-limit' && entry.cardName === '信長',
  );
  assert.equal(result.status, 'invalid');
  assert.equal(result.namedCardCounts.get('信長'), 5);
  assert.equal(issue?.detail, '5枚 / 最大4枚');
});

test('deckLimit:null は同名枚数制限を無制限にできる', () => {
  const result = validateDeck(deck({ free: 40 }), { cardsById });
  assert.equal(result.status, 'valid');
  assert.ok(!result.errors.some((entry) => entry.cardName === '無制限'));
});

test('禁止・制限カード定義と適用開始日を考慮する', () => {
  const prohibited = validateDeck(deck({ one: 4, three: 36 }), {
    cardsById,
    restrictions: [{ cardName: '信長', limit: 0, note: '大会規定' }],
  });
  assert.equal(prohibited.status, 'invalid');
  assert.equal(
    prohibited.errors.find((entry) => entry.cardName === '信長')?.detail,
    '使用禁止カードです',
  );

  const future = validateDeck(deck({ one: 4, three: 36 }), {
    cardsById,
    restrictions: [{ cardName: '信長', limit: 0, effectiveFrom: '2030-01-01' }],
    now: new Date('2026-09-06T00:00:00.000Z'),
  });
  assert.equal(future.status, 'valid');
});
