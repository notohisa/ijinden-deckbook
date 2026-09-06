import assert from 'node:assert/strict';
import test from 'node:test';

import { ijindenCards } from '../app/ijinden-cards.ts';
import { regulations } from '../data/regulations.ts';
import { applyCardRuleMetadata } from '../lib/deck-utils.ts';
import {
  validateDeck,
  validateDeckForRegulation,
} from '../lib/deck-validator.ts';

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

const regulationCardsById = new Map([
  ['medici', card('medici', 'ジョバンニ＝ディ＝メディチ')],
  ['reunion', card('reunion', 'リユニオン')],
  ['rikyu', card('rikyu', '千利休')],
  ['normal-one', card('normal-one', '通常カード')],
  ['normal-two', card('normal-two', '通常カード')],
  ['filler', card('filler', '枚数無制限の穴埋め', null)],
]);

function regulation(id) {
  const result = regulations.find((entry) => entry.id === id);
  assert.ok(result, id + ' が定義されていること');
  return result;
}

function regulationValidation(main, id) {
  return validateDeckForRegulation(deck(main), regulation(id), {
    cardsById: regulationCardsById,
  });
}

test('4つのレギュレーションを指定された名称と投入上限で定義する', () => {
  assert.deepEqual(
    regulations.map((entry) => ({
      id: entry.id,
      name: entry.name,
      limits: entry.cardLimits.map(({ shortName, limit }) => [shortName, limit]),
    })),
    [
      {
        id: 'sdk-2026',
        name: '最強ダイバー決定戦2026',
        limits: [
          ['メディチ', 0],
          ['リユニオン', 0],
          ['千利休', 0],
        ],
      },
      {
        id: '002',
        name: 'いわゆる002',
        limits: [
          ['メディチ', 0],
          ['リユニオン', 0],
        ],
      },
      {
        id: 'recommended',
        name: '推奨レギュレーション',
        limits: [
          ['メディチ', 2],
          ['リユニオン', 2],
        ],
      },
      {
        id: 'unrestricted',
        name: '封印なし',
        limits: [
          ['メディチ', 4],
          ['リユニオン', 4],
        ],
      },
    ],
  );
});

test('メイン39枚では一般ルールにより全レギュレーションが不適合になる', () => {
  for (const entry of regulations) {
    const result = regulationValidation({ filler: 39 }, entry.id);
    assert.equal(result.validation.status, 'incomplete');
    assert.equal(result.valid, false);
  }
});

test('制限対象が0枚の有効な40枚デッキは全レギュレーションに適合する', () => {
  for (const entry of regulations) {
    assert.equal(regulationValidation({ filler: 40 }, entry.id).valid, true);
  }
});

test('メディチとリユニオンの枚数をレギュレーションごとに判定する', () => {
  const cases = [
    {
      name: 'メディチ1枚',
      main: { medici: 1, filler: 39 },
      expected: [false, false, true, true],
    },
    {
      name: 'メディチ2枚・リユニオン2枚',
      main: { medici: 2, reunion: 2, filler: 36 },
      expected: [false, false, true, true],
    },
    {
      name: 'メディチ3枚',
      main: { medici: 3, filler: 37 },
      expected: [false, false, false, true],
    },
  ];
  for (const scenario of cases) {
    assert.deepEqual(
      regulations.map((entry) =>
        regulationValidation(scenario.main, entry.id).valid,
      ),
      scenario.expected,
      scenario.name,
    );
  }
  const medici = regulationValidation(
    { medici: 1, filler: 39 },
    'recommended',
  ).cardLimits.find((entry) => entry.shortName === 'メディチ');
  assert.equal(medici?.count, 1);
  assert.equal(medici?.valid, true);
});

test('千利休は最強ダイバー決定戦2026だけを不適合にする', () => {
  assert.deepEqual(
    regulations.map((entry) =>
      regulationValidation({ rikyu: 1, filler: 39 }, entry.id).valid,
    ),
    [false, true, true, true],
  );
});

test('通常同名カード5枚の一般ルール違反は全レギュレーションに反映される', () => {
  for (const entry of regulations) {
    const result = regulationValidation(
      { 'normal-one': 3, 'normal-two': 2, filler: 35 },
      entry.id,
    );
    assert.equal(result.validation.status, 'invalid');
    assert.equal(result.valid, false);
  }
});

test('カード説明文の枚数無制限表記は構造化deckLimitへ自動反映する', () => {
  const marked = applyCardRuleMetadata({
    ...card('auto-free', '自動無制限'),
    description: 'このカードはデッキに何枚でも入れてよい。',
  });
  assert.equal(marked.deckLimit, null);
  const explicit = applyCardRuleMetadata({
    ...card('explicit-limit', '明示上限', 2),
    description: 'デッキに何枚でも入れてよい。',
  });
  assert.equal(explicit.deckLimit, 2);
});

test('実カードの無制限表記とレギュレーション対象名をカタログで照合する', () => {
  const redStone = ijindenCards.find((entry) => entry.id === 'R-013');
  assert.ok(redStone);
  assert.equal(applyCardRuleMetadata(redStone).deckLimit, null);
  const catalog = new Map(
    ijindenCards.map((entry) => {
      const cardWithRules = applyCardRuleMetadata(entry);
      return [cardWithRules.id, cardWithRules];
    }),
  );
  const unlimitedResult = validateDeck(deck({ 'R-013': 10 }), {
    cardsById: catalog,
  });
  assert.ok(
    !unlimitedResult.errors.some(
      (issue) => issue.code === 'card-limit' && issue.cardName === 'レッドストーン',
    ),
  );
  for (const cardName of [
    'ジョバンニ＝ディ＝メディチ',
    'リユニオン',
    '千利休',
  ]) {
    assert.ok(ijindenCards.some((entry) => entry.name === cardName));
  }
});
