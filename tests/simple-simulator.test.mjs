import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSimpleSimulation,
  mulliganSimpleSimulation,
  tapSimpleSimulationCard,
} from '../lib/simple-simulator.ts';

const preserveOrderRandom = () => 0.999999;

function cardIdsIn(state) {
  return [...state.guardians, ...state.cards].map((card) => card.cardId);
}

test('simple mode deals four hidden guardians and reveals only the first six cards', () => {
  const source = Array.from({ length: 14 }, (_, index) => `card-${index}`);
  const state = createSimpleSimulation(source, 6, 4, preserveOrderRandom);

  assert.deepEqual(state.guardians.map((card) => card.cardId), source.slice(0, 4));
  assert.ok(state.guardians.every((card) => !card.isRevealed));
  assert.ok(state.guardians.every((card) => card.state === 'normal'));
  assert.deepEqual(
    state.cards.map((card) => card.cardId),
    source.slice(4),
  );
  assert.ok(state.cards.slice(0, 6).every((card) => card.isRevealed));
  assert.ok(state.cards.slice(6).every((card) => !card.isRevealed));
  assert.equal(new Set([...state.guardians, ...state.cards].map((card) => card.instanceId)).size, source.length);
});

test('a hidden simple card reveals first, then cycles through the five visible states', () => {
  const initial = createSimpleSimulation(
    Array.from({ length: 12 }, (_, index) => `card-${index}`),
    6,
    4,
    preserveOrderRandom,
  );
  const hidden = initial.cards[6];

  const revealed = tapSimpleSimulationCard(initial, hidden.instanceId);
  assert.equal(initial.cards[6].isRevealed, false);
  assert.equal(revealed.cards[6].isRevealed, true);
  assert.equal(revealed.cards[6].state, 'normal');

  const mana = tapSimpleSimulationCard(revealed, hidden.instanceId);
  const manaBack = tapSimpleSimulationCard(mana, hidden.instanceId);
  const battlefield = tapSimpleSimulationCard(manaBack, hidden.instanceId);
  const graveyard = tapSimpleSimulationCard(battlefield, hidden.instanceId);
  const normal = tapSimpleSimulationCard(graveyard, hidden.instanceId);

  assert.equal(mana.cards[6].state, 'mana');
  assert.equal(manaBack.cards[6].state, 'manaBack');
  assert.equal(battlefield.cards[6].state, 'battlefield');
  assert.equal(graveyard.cards[6].state, 'graveyard');
  assert.equal(normal.cards[6].state, 'normal');
});

test('simple mulligan keeps guardian identities and resets reveal and color states', () => {
  const initial = createSimpleSimulation(
    Array.from({ length: 14 }, (_, index) => `card-${index}`),
    6,
    4,
    preserveOrderRandom,
  );
  const revealedGuardian = tapSimpleSimulationCard(
    initial,
    initial.guardians[0].instanceId,
  );
  const markedCard = tapSimpleSimulationCard(
    revealedGuardian,
    revealedGuardian.cards[0].instanceId,
  );

  const result = mulliganSimpleSimulation(markedCard, 6, preserveOrderRandom);

  assert.deepEqual(
    result.guardians.map((card) => card.instanceId),
    initial.guardians.map((card) => card.instanceId),
  );
  assert.ok(result.guardians.every((card) => !card.isRevealed));
  assert.ok(result.guardians.every((card) => card.state === 'normal'));
  assert.ok(result.cards.slice(0, 6).every((card) => card.isRevealed));
  assert.ok(result.cards.slice(6).every((card) => !card.isRevealed));
  assert.ok(result.cards.every((card) => card.state === 'normal'));
  assert.deepEqual(
    cardIdsIn(result).sort((left, right) => left.localeCompare(right)),
    cardIdsIn(initial).sort((left, right) => left.localeCompare(right)),
  );
});
