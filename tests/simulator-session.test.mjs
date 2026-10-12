import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSimulatorSession,
  drawSimulatorSession,
  equipSimulatorSessionCard,
  flipSimulatorSessionCard,
  moveSimulatorSessionCard,
  moveSimulatorSessionCardToGuardian,
  moveTopDeckCardToGuardian,
  mulliganSimulatorSession,
  tapSimpleSimulatorCard,
  toggleSimulatorSessionCardGrayedOut,
  unequipSimulatorSessionCard,
} from '../lib/simulator-session.ts';

const preserveOrderRandom = () => 0.999999;

function createRecipe() {
  return {
    signature: 'deck-signature',
    cardInputs: Array.from({ length: 12 }, (_, index) => {
      if (index === 4) return { cardId: 'ijin', cardType: 'イジン' };
      if (index === 5)
        return {
          cardId: 'equipment',
          cardType: 'マホウ',
          description: '装備:',
        };
      return `card-${index}`;
    }),
  };
}

function createSession() {
  return createSimulatorSession(
    createRecipe(),
    '  テストデッキ  ',
    preserveOrderRandom,
  );
}

test('starting deals six cards and four hidden guardians into one session', () => {
  const session = createSession();

  assert.equal(session.recipeSignature, 'deck-signature');
  assert.equal(session.recipeName, 'テストデッキ');
  assert.equal(session.board.zones.hand.length, 6);
  assert.equal(session.board.zones.guardians.length, 4);
  assert.equal(session.board.zones.deck.length, 2);
  assert.ok(session.board.zones.guardians.every((card) => card.faceDown));
  assert.deepEqual(session.simpleStates, {});
  assert.equal(session.canMulligan, true);
});

test('drawing locks the mulligan and a mulligan resets the initial hand', () => {
  const initial = createSession();
  const mulliganed = mulliganSimulatorSession(initial, preserveOrderRandom);

  assert.equal(initial.canMulligan, true);
  assert.equal(mulliganed.canMulligan, false);
  assert.equal(mulliganed.board.zones.hand.length, 6);
  assert.equal(mulliganed.board.zones.deck.length, 2);
  assert.deepEqual(
    mulliganed.board.zones.guardians.map((card) => card.instanceId),
    initial.board.zones.guardians.map((card) => card.instanceId),
  );

  const marked = {
    ...initial,
    simpleStates: { 'sim-4': 'mana' },
  };
  assert.deepEqual(
    mulliganSimulatorSession(marked, preserveOrderRandom).simpleStates,
    {},
  );

  const drawn = drawSimulatorSession(initial);
  assert.equal(drawn.drawn, 1);
  assert.equal(drawn.board.zones.hand.length, 7);
  assert.equal(drawn.board.zones.deck.length, 1);
  assert.equal(drawn.canMulligan, false);
  assert.equal(mulliganSimulatorSession(drawn), drawn);
});

test('simple taps reveal hidden cards first, then cycle their color state', () => {
  const initial = createSession();
  const hidden = initial.board.zones.deck[0];

  const revealed = tapSimpleSimulatorCard(initial, hidden.instanceId);
  assert.equal(initial.board.zones.deck[0].faceDown, true);
  assert.equal(revealed.board.zones.deck[0].faceDown, false);
  assert.equal(revealed.simpleStates[hidden.instanceId], 'normal');
  assert.equal(revealed.canMulligan, false);

  const states = [
    'mana',
    'manaBack',
    'battlefield',
    'graveyard',
    'equipped',
    'normal',
  ];
  let current = revealed;
  for (const expected of states) {
    current = tapSimpleSimulatorCard(current, hidden.instanceId);
    assert.equal(current.simpleStates[hidden.instanceId], expected);
  }
  assert.equal(current.board.zones.deck[0].instanceId, hidden.instanceId);
});

test('the top deck card can be moved to guardians while staying face-down', () => {
  const initial = createSession();
  const topCardId = initial.board.zones.deck[0].instanceId;
  const next = moveTopDeckCardToGuardian(initial);

  assert.equal(next.board.zones.deck.length, 1);
  assert.equal(next.board.zones.guardians.length, 5);
  assert.equal(next.board.zones.guardians.at(-1).instanceId, topCardId);
  assert.equal(next.board.zones.guardians.at(-1).faceDown, true);
  assert.equal(next.canMulligan, false);
});

test('board face-up and gray controls update physical card state immutably', () => {
  const initial = createSession();
  const guardian = flipSimulatorSessionCard(initial, 'sim-0');
  assert.equal(initial.board.zones.guardians[0].faceDown, true);
  assert.equal(guardian.board.zones.guardians[0].faceDown, false);
  assert.equal(guardian.canMulligan, false);

  const grayed = toggleSimulatorSessionCardGrayedOut(initial, 'sim-4');
  assert.equal(initial.board.zones.hand[0].isGrayedOut, false);
  assert.equal(grayed.board.zones.hand[0].isGrayedOut, true);
  assert.equal(
    toggleSimulatorSessionCardGrayedOut(grayed, 'sim-4').board.zones.hand[0]
      .isGrayedOut,
    false,
  );
});

test('moving an Ijin to guardians releases its equipment and clears simple states', () => {
  let session = createSession();
  session = moveSimulatorSessionCard(session, 'sim-4', 'battlefield');
  session = moveSimulatorSessionCard(session, 'sim-5', 'battlefield');
  session = tapSimpleSimulatorCard(session, 'sim-4');
  session = tapSimpleSimulatorCard(session, 'sim-5');
  session = equipSimulatorSessionCard(session, 'sim-5', 'sim-4');

  assert.equal(session.board.zones.battlefield.length, 2);
  assert.equal(session.board.zones.battlefield[1].equippedTo, 'sim-4');
  assert.equal(session.simpleStates['sim-4'], 'mana');
  assert.equal(session.simpleStates['sim-5'], undefined);

  const moved = moveSimulatorSessionCardToGuardian(session, 'sim-4');
  const ijin = moved.board.zones.guardians.find(
    (card) => card.instanceId === 'sim-4',
  );
  const equipment = moved.board.zones.battlefield.find(
    (card) => card.instanceId === 'sim-5',
  );

  assert.equal(ijin.faceDown, true);
  assert.equal(equipment.equippedTo, undefined);
  assert.equal(equipment.zone, 'battlefield');
  assert.equal(moved.simpleStates['sim-4'], undefined);
  assert.equal(moved.simpleStates['sim-5'], undefined);
  assert.equal(moved.canMulligan, false);
});

test('unequipping returns a card to its recorded origin zone', () => {
  let session = createSession();
  session = moveSimulatorSessionCard(session, 'sim-4', 'battlefield');
  session = moveSimulatorSessionCard(session, 'sim-5', 'mana');
  session = equipSimulatorSessionCard(session, 'sim-5', 'sim-4');

  const unequipped = unequipSimulatorSessionCard(session, 'sim-5');
  const equipment = unequipped.board.zones.mana.find(
    (card) => card.instanceId === 'sim-5',
  );

  assert.equal(equipment.equippedTo, undefined);
  assert.equal(equipment.faceDown, false);
  assert.equal(unequipped.board.zones.battlefield.length, 1);
  assert.equal(unequipped.board.zones.mana.length, 1);
});
