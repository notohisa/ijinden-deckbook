import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSimulation,
  drawSimulationCards,
  flipSimulationCard,
  mulliganSimulation,
} from '../lib/simulator.ts';

const allZones = ['deck', 'hand', 'guardians'];

function cardIdsIn(state) {
  return allZones.flatMap((zone) =>
    state.zones[zone].map((card) => card.cardId),
  );
}

function cardsIn(state) {
  return allZones.flatMap((zone) => state.zones[zone]);
}

function sequenceRandom(values) {
  let index = 0;
  return () => values[index++] ?? 0;
}

const preserveOrderRandom = () => 0.999999;
const compareStrings = (left, right) => left.localeCompare(right);

test('creates guardians first, then hand, then face-down deck', () => {
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
  assert.ok(state.zones.guardians.every((card) => card.faceDown));
  assert.ok(state.zones.deck.every((card) => card.faceDown));
  assert.ok(state.zones.hand.every((card) => !card.faceDown));
  assert.ok(cardsIn(state).every((card) => !('rested' in card)));
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

test('keeps duplicate card ids independently addressable and immutable', () => {
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

test('draws top cards, resets them face-up, and handles safe no-ops', () => {
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
  assert.deepEqual(state, before);

  const allDrawn = drawSimulationCards(drawn, 99);
  assert.deepEqual(
    allDrawn.zones.hand.map((card) => card.cardId),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(allDrawn.zones.deck, []);
  assert.strictEqual(drawSimulationCards(allDrawn, 1), allDrawn);
});

test('mulligans hand and deck while preserving guardians and card count', () => {
  const state = createSimulation(
    ['guardian-a', 'guardian-b', 'hand-a', 'hand-b', 'deck-a', 'deck-b'],
    2,
    2,
    preserveOrderRandom,
  );
  const guardian = state.zones.guardians[0];
  const faceUpGuardian = flipSimulationCard(state, guardian.instanceId);
  const before = structuredClone(faceUpGuardian);
  const result = mulliganSimulation(
    faceUpGuardian,
    2,
    sequenceRandom([0, 0, 0]),
  );

  assert.deepEqual(result.zones.guardians, before.zones.guardians);
  assert.deepEqual(
    result.zones.hand.map((card) => card.cardId),
    ['hand-b', 'deck-a'],
  );
  assert.deepEqual(
    result.zones.deck.map((card) => card.cardId),
    ['deck-b', 'hand-a'],
  );
  assert.ok(result.zones.hand.every((card) => !card.faceDown));
  assert.ok(result.zones.deck.every((card) => card.faceDown));
  assert.deepEqual(
    cardIdsIn(result).sort(compareStrings),
    cardIdsIn(faceUpGuardian).sort(compareStrings),
  );
  assert.deepEqual(faceUpGuardian, before);
});

test('rejects invalid or oversized mulligan hands', () => {
  const state = createSimulation(['a', 'b'], 1, 0, preserveOrderRandom);

  assert.throws(() => mulliganSimulation(state, -1), Error);
  assert.throws(() => mulliganSimulation(state, 1.5), Error);
  assert.throws(() => mulliganSimulation(state, 3), Error);
});

test('40-card recipe deals 6 + 4, survives a mulligan, and draws exactly 30 cards', () => {
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
  assert.deepEqual(result.zones.guardians, state.zones.guardians);
  assert.equal(
    new Set(cardsIn(result).map((card) => card.instanceId)).size,
    10,
  );
});
