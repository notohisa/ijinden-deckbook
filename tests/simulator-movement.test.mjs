import assert from 'node:assert/strict';
import test from 'node:test';

import { getSimulationMoveDestinations } from '../lib/simulator-movement.ts';

function card(zone, cardType = 'イジン', overrides = {}) {
  return {
    zone,
    cardType,
    faceDown: false,
    ...overrides,
  };
}

test('keeps normal-card destinations consistent across movable zones', () => {
  assert.deepEqual(getSimulationMoveDestinations(card('hand')), [
    'battlefield',
    'mana',
    'graveyard',
    'guardians',
  ]);
  assert.deepEqual(getSimulationMoveDestinations(card('battlefield')), [
    'hand',
    'mana',
    'graveyard',
    'guardians',
  ]);
  assert.deepEqual(getSimulationMoveDestinations(card('mana')), [
    'battlefield',
    'hand',
    'graveyard',
    'guardians',
  ]);
  assert.deepEqual(getSimulationMoveDestinations(card('graveyard')), [
    'battlefield',
    'hand',
    'mana',
    'guardians',
  ]);
  assert.deepEqual(getSimulationMoveDestinations(card('guardians')), [
    'hand',
    'mana',
    'graveyard',
  ]);
});

test('preserves mana and magic type restrictions', () => {
  assert.deepEqual(getSimulationMoveDestinations(card('hand', 'マホウ')), [
    'mana',
    'graveyard',
    'guardians',
  ]);
  assert.deepEqual(getSimulationMoveDestinations(card('mana', 'マリョク')), [
    'hand',
    'graveyard',
    'guardians',
  ]);
  assert.deepEqual(
    getSimulationMoveDestinations(card('graveyard', 'マホウ')),
    ['hand', 'mana', 'guardians'],
  );
});

test('limits equipped cards and hidden guardians to their permitted drag targets', () => {
  assert.deepEqual(
    getSimulationMoveDestinations(
      card('battlefield', 'ハイケイ', { equippedTo: 'ijin-1' }),
    ),
    ['graveyard', 'guardians'],
  );
  const hiddenGuardian = card('guardians', 'イジン', { faceDown: true });
  assert.deepEqual(getSimulationMoveDestinations(hiddenGuardian), []);
  assert.deepEqual(
    getSimulationMoveDestinations(hiddenGuardian, {
      allowFaceDownGuardians: true,
    }),
    ['hand', 'mana', 'graveyard'],
  );
  assert.deepEqual(
    getSimulationMoveDestinations(card('deck', 'イジン', { faceDown: true }), {
      allowFaceDownGuardians: true,
    }),
    [],
  );
});
