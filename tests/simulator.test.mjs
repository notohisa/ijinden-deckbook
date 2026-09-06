import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canEquipSimulationCard,
  createSimulation,
  drawSimulationCards,
  equipSimulationCard,
  findSimulationCard,
  flipSimulationCard,
  getEquipAbility,
  moveSimulationCard,
  mulliganSimulation,
  toggleSimulationCardGrayedOut,
  unequipSimulationCard,
} from '../lib/simulator.ts';

const allZones = [
  'deck',
  'hand',
  'battlefield',
  'mana',
  'graveyard',
  'guardians',
];

function cardIdsIn(state) {
  return allZones.flatMap((zone) =>
    state.zones[zone].map((card) => card.cardId),
  );
}

function cardsIn(state) {
  return allZones.flatMap((zone) => state.zones[zone]);
}

function seed(cardId, cardType = 'イジン', description = '') {
  return { cardId, cardType, description };
}

function sequenceRandom(values) {
  let index = 0;
  return () => values[index++] ?? 0;
}

const preserveOrderRandom = () => 0.999999;
const compareStrings = (left, right) => left.localeCompare(right);

test('creates all six zones, then deals guardians, hand, and face-down deck', () => {
  const source = ['a', 'b', 'c', 'd', 'e'];
  const state = createSimulation(source, 2, 1, preserveOrderRandom);

  assert.deepEqual(source, ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(
    state.zones.guardians.map((card) => card.cardId),
    ['a'],
  );
  assert.deepEqual(
    state.zones.hand.map((card) => card.cardId),
    ['b', 'c'],
  );
  assert.deepEqual(
    state.zones.deck.map((card) => card.cardId),
    ['d', 'e'],
  );
  assert.deepEqual(state.zones.battlefield, []);
  assert.deepEqual(state.zones.mana, []);
  assert.deepEqual(state.zones.graveyard, []);
  assert.ok(state.zones.guardians.every((card) => card.faceDown));
  assert.ok(state.zones.deck.every((card) => card.faceDown));
  assert.ok(state.zones.hand.every((card) => !card.faceDown));
  assert.ok(cardsIn(state).every((card) => !card.isGrayedOut));
  assert.deepEqual(
    cardIdsIn(state).sort(compareStrings),
    source.slice().sort(compareStrings),
  );

  const instanceIds = cardsIn(state).map((card) => card.instanceId);
  assert.equal(new Set(instanceIds).size, source.length);
  assert.deepEqual(instanceIds.sort(compareStrings), [
    'sim-0',
    'sim-1',
    'sim-2',
    'sim-3',
    'sim-4',
  ]);
});

test('rejects invalid initial sizes and insufficient cards', () => {
  assert.throws(() => createSimulation(['a'], -1, 0), Error);
  assert.throws(() => createSimulation(['a'], 0, 1.5), Error);
  assert.throws(() => createSimulation(['a'], 1, 1), Error);
});

test('uses Fisher-Yates randomness without mutating the source array', () => {
  const source = ['a', 'b', 'c', 'd'];
  const state = createSimulation(source, 1, 1, sequenceRandom([0, 0, 0]));

  assert.deepEqual(source, ['a', 'b', 'c', 'd']);
  assert.deepEqual(
    state.zones.guardians.map((card) => card.cardId),
    ['b'],
  );
  assert.deepEqual(
    state.zones.hand.map((card) => card.cardId),
    ['c'],
  );
  assert.deepEqual(
    state.zones.deck.map((card) => card.cardId),
    ['d', 'a'],
  );
});

test('detects only an equipment ability label and normalizes punctuation and whitespace', () => {
  assert.deepEqual(getEquipAbility('装備： 効果'), {
    normalEquip: true,
    graveEquip: false,
  });
  assert.deepEqual(
    getEquipAbility('装備\n（ 装備しているカードにルールテキストを加える ）\n：効果'),
    { normalEquip: true, graveEquip: false },
  );
  assert.deepEqual(getEquipAbility('このカードを装備する。'), {
    normalEquip: false,
    graveEquip: false,
  });
  assert.deepEqual(getEquipAbility('冥装 - 効果'), {
    normalEquip: false,
    graveEquip: true,
  });
});

test('keeps duplicate cards independently addressable and flips physical cards immutably', () => {
  const state = createSimulation(['same', 'same'], 0, 0, preserveOrderRandom);
  const [first, second] = state.zones.deck;
  const flipped = flipSimulationCard(state, first.instanceId);

  assert.notEqual(first.instanceId, second.instanceId);
  assert.equal(flipped.zones.deck[0].instanceId, first.instanceId);
  assert.equal(flipped.zones.deck[0].faceDown, false);
  assert.equal(flipped.zones.deck[1].instanceId, second.instanceId);
  assert.equal(flipped.zones.deck[1].faceDown, true);
  assert.equal(state.zones.deck[0].faceDown, true);
  assert.strictEqual(flipSimulationCard(state, 'unknown'), state);
});

test('draws top cards into hand, clears gray state, and handles safe no-ops', () => {
  const state = createSimulation(['a', 'b', 'c'], 0, 0, preserveOrderRandom);
  const before = structuredClone(state);

  assert.strictEqual(drawSimulationCards(state, 0), state);
  assert.strictEqual(drawSimulationCards(state, -1), state);
  assert.strictEqual(drawSimulationCards(state, 1.5), state);
  assert.deepEqual(state, before);

  const drawn = drawSimulationCards(state, 2);
  assert.deepEqual(
    drawn.zones.hand.map((card) => card.cardId),
    ['a', 'b'],
  );
  assert.deepEqual(
    drawn.zones.deck.map((card) => card.cardId),
    ['c'],
  );
  assert.ok(drawn.zones.hand.every((card) => !card.faceDown));
  assert.ok(drawn.zones.hand.every((card) => !card.isGrayedOut));
  assert.deepEqual(state, before);

  const allDrawn = drawSimulationCards(drawn, 99);
  assert.deepEqual(
    allDrawn.zones.hand.map((card) => card.cardId),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(allDrawn.zones.deck, []);
  assert.strictEqual(drawSimulationCards(allDrawn, 1), allDrawn);
});

test('moves a card between zones and resets its gray state', () => {
  const state = createSimulation([seed('ijin')], 1, 0, preserveOrderRandom);
  const card = state.zones.hand[0];
  const grayed = toggleSimulationCardGrayedOut(state, card.instanceId);
  assert.equal(grayed.zones.hand[0].isGrayedOut, true);
  assert.deepEqual(state, createSimulation([seed('ijin')], 1, 0, preserveOrderRandom));

  const onBattlefield = moveSimulationCard(grayed, card.instanceId, 'battlefield');
  const moved = onBattlefield.zones.battlefield[0];
  assert.equal(moved.zone, 'battlefield');
  assert.equal(moved.faceDown, false);
  assert.equal(moved.isGrayedOut, false);
  assert.equal(onBattlefield.zones.hand.length, 0);

  const inMana = moveSimulationCard(onBattlefield, card.instanceId, 'mana');
  assert.equal(inMana.zones.mana[0].zone, 'mana');
  const inGraveyard = moveSimulationCard(inMana, card.instanceId, 'graveyard');
  assert.equal(inGraveyard.zones.graveyard[0].zone, 'graveyard');
});

test('limits normal equipment to battlefield and mana, and grave equipment to graveyard', () => {
  const normal = seed('normal-equip', 'ハイケイ', '装備：効果');
  const grave = seed('grave-equip', 'マホウ', '冥装：効果');
  let state = createSimulation([normal, grave], 2, 0, preserveOrderRandom);
  const normalId = state.zones.hand[0].instanceId;
  const graveId = state.zones.hand[1].instanceId;

  state = moveSimulationCard(state, normalId, 'mana');
  assert.equal(canEquipSimulationCard(findSimulationCard(state, normalId)), true);
  state = moveSimulationCard(state, normalId, 'graveyard');
  assert.equal(canEquipSimulationCard(findSimulationCard(state, normalId)), false);

  state = moveSimulationCard(state, graveId, 'graveyard');
  assert.equal(canEquipSimulationCard(findSimulationCard(state, graveId)), true);
  state = moveSimulationCard(state, graveId, 'mana');
  assert.equal(canEquipSimulationCard(findSimulationCard(state, graveId)), false);
});

test('equips a card only onto a battlefield Ijin and records its origin zone', () => {
  const inputs = [
    seed('ijin', 'イジン'),
    seed('background', 'ハイケイ', '装備：効果'),
    seed('not-ijin', 'ハイケイ'),
  ];
  let state = createSimulation(inputs, 3, 0, preserveOrderRandom);
  const [ijin, background, notIjin] = state.zones.hand;
  state = moveSimulationCard(state, ijin.instanceId, 'battlefield');
  state = moveSimulationCard(state, background.instanceId, 'mana');
  state = moveSimulationCard(state, notIjin.instanceId, 'battlefield');

  assert.strictEqual(
    equipSimulationCard(state, background.instanceId, notIjin.instanceId),
    state,
  );
  const equipped = equipSimulationCard(state, background.instanceId, ijin.instanceId);
  const equipment = findSimulationCard(equipped, background.instanceId);
  assert.equal(equipment.zone, 'battlefield');
  assert.equal(equipment.equippedTo, ijin.instanceId);
  assert.equal(equipment.equipOriginZone, 'mana');
  assert.equal(equipment.isGrayedOut, false);
  assert.equal(equipped.zones.mana.length, 0);
});

test('supports multiple attachments and returns every card to its recorded origin when an Ijin leaves', () => {
  const inputs = [
    seed('ijin', 'イジン'),
    seed('mana-equip', 'マリョク', '装備：効果'),
    seed('background-equip', 'ハイケイ', '装備：効果'),
    seed('grave-equip', 'マホウ', '冥装：効果'),
  ];
  let state = createSimulation(inputs, 4, 0, preserveOrderRandom);
  const [ijin, manaEquip, backgroundEquip, graveEquip] = state.zones.hand;
  state = moveSimulationCard(state, ijin.instanceId, 'battlefield');
  state = moveSimulationCard(state, manaEquip.instanceId, 'mana');
  state = moveSimulationCard(state, backgroundEquip.instanceId, 'battlefield');
  state = moveSimulationCard(state, graveEquip.instanceId, 'graveyard');

  state = equipSimulationCard(state, manaEquip.instanceId, ijin.instanceId);
  state = equipSimulationCard(state, backgroundEquip.instanceId, ijin.instanceId);
  state = equipSimulationCard(state, graveEquip.instanceId, ijin.instanceId);
  assert.equal(
    state.zones.battlefield.filter((card) => card.equippedTo === ijin.instanceId)
      .length,
    3,
  );

  const afterIjinLeaves = moveSimulationCard(state, ijin.instanceId, 'graveyard');
  assert.equal(afterIjinLeaves.zones.graveyard.some((card) => card.instanceId === ijin.instanceId), true);
  assert.equal(findSimulationCard(afterIjinLeaves, manaEquip.instanceId).zone, 'mana');
  assert.equal(
    findSimulationCard(afterIjinLeaves, backgroundEquip.instanceId).zone,
    'battlefield',
  );
  assert.equal(
    findSimulationCard(afterIjinLeaves, graveEquip.instanceId).zone,
    'graveyard',
  );
  for (const instanceId of [
    manaEquip.instanceId,
    backgroundEquip.instanceId,
    graveEquip.instanceId,
  ]) {
    const card = findSimulationCard(afterIjinLeaves, instanceId);
    assert.equal(card.equippedTo, undefined);
    assert.equal(card.equipOriginZone, undefined);
  }
});

test('manually unequips a battlefield background and returns it to the left-side battlefield group', () => {
  let state = createSimulation(
    [seed('ijin', 'イジン'), seed('background', 'ハイケイ', '装備：効果')],
    2,
    0,
    preserveOrderRandom,
  );
  const [ijin, background] = state.zones.hand;
  state = moveSimulationCard(state, ijin.instanceId, 'battlefield');
  state = moveSimulationCard(state, background.instanceId, 'battlefield');
  state = equipSimulationCard(state, background.instanceId, ijin.instanceId);
  const result = unequipSimulationCard(state, background.instanceId);
  const released = findSimulationCard(result, background.instanceId);
  assert.equal(released.zone, 'battlefield');
  assert.equal(released.equippedTo, undefined);
  assert.equal(released.equipOriginZone, undefined);
  assert.equal(released.cardType, 'ハイケイ');
});

test('mulligan resets every non-guardian zone, gray state, and equipment relation', () => {
  let state = createSimulation(
    [seed('ijin', 'イジン'), seed('equip', 'ハイケイ', '装備：効果'), seed('other')],
    2,
    1,
    preserveOrderRandom,
  );
  const guardian = state.zones.guardians[0];
  const [ijin, equip] = state.zones.hand;
  state = moveSimulationCard(state, ijin.instanceId, 'battlefield');
  state = moveSimulationCard(state, equip.instanceId, 'mana');
  state = equipSimulationCard(state, equip.instanceId, ijin.instanceId);
  state = toggleSimulationCardGrayedOut(state, ijin.instanceId);
  state = flipSimulationCard(state, guardian.instanceId);

  const result = mulliganSimulation(state, 2, preserveOrderRandom);
  assert.equal(result.zones.hand.length, 2);
  assert.equal(result.zones.deck.length, 0);
  assert.deepEqual(result.zones.battlefield, []);
  assert.deepEqual(result.zones.mana, []);
  assert.deepEqual(result.zones.graveyard, []);
  assert.equal(result.zones.guardians[0].faceDown, true);
  assert.ok(
    cardsIn(result).every(
      (card) =>
        !card.isGrayedOut &&
        card.equippedTo === undefined &&
        card.equipOriginZone === undefined,
    ),
  );
});

test('40-card recipe deals 6 + 4, resets, and draws exactly 30 cards', () => {
  const recipe = Object.freeze(
    Array.from({ length: 40 }, (_, index) => 'card-' + Math.floor(index / 4)),
  );
  const start = createSimulation(recipe, 6, 4, preserveOrderRandom);
  const initial = structuredClone(start);
  assert.equal(start.zones.hand.length, 6);
  assert.equal(start.zones.guardians.length, 4);
  assert.equal(start.zones.deck.length, 30);
  let state = mulliganSimulation(start, 6, sequenceRandom([0.2, 0.6, 0.4]));
  for (let draw = 0; draw < 35; draw += 1) {
    state = drawSimulationCards(state);
    assert.equal(cardsIn(state).length, 40);
    assert.equal(
      new Set(cardsIn(state).map((card) => card.instanceId)).size,
      40,
    );
  }
  assert.equal(state.zones.hand.length, 36);
  assert.equal(state.zones.deck.length, 0);
  assert.deepEqual(state.zones.guardians, initial.zones.guardians);
  assert.deepEqual(start, initial);
  assert.deepEqual(
    cardIdsIn(state).sort(compareStrings),
    [...recipe].sort(compareStrings),
  );
});

test('minimum 10-card recipe has no drawable cards and can still mulligan', () => {
  const state = createSimulation(Array(10).fill('same'), 6, 4);
  assert.equal(state.zones.deck.length, 0);
  assert.strictEqual(drawSimulationCards(state), state);
  const result = mulliganSimulation(state);
  assert.equal(result.zones.hand.length, 6);
  assert.equal(result.zones.guardians.length, 4);
  assert.equal(
    new Set(cardsIn(result).map((card) => card.instanceId)).size,
    10,
  );
});
