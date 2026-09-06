import {
  shuffleSimulationCards,
  type SimulationCardSeed,
} from './simulator.ts';

export type SimpleCardState =
  | 'normal'
  | 'mana'
  | 'manaBack'
  | 'battlefield'
  | 'graveyard'
  | 'equipped';

export type SimpleSimulationCard = {
  instanceId: string;
  cardId: string;
  isRevealed: boolean;
  state: SimpleCardState;
};

export type SimpleSimulationState = {
  guardians: SimpleSimulationCard[];
  cards: SimpleSimulationCard[];
};

const stateOrder: readonly SimpleCardState[] = [
  'normal',
  'mana',
  'manaBack',
  'battlefield',
  'graveyard',
  'equipped',
];

export function getNextSimpleCardState(
  state: SimpleCardState,
): SimpleCardState {
  const stateIndex = stateOrder.indexOf(state);
  return stateOrder[(stateIndex + 1) % stateOrder.length];
}

function cloneCard(card: SimpleSimulationCard): SimpleSimulationCard {
  return { ...card };
}

function cloneState(state: SimpleSimulationState): SimpleSimulationState {
  return {
    guardians: state.guardians.map(cloneCard),
    cards: state.cards.map(cloneCard),
  };
}

function resetCard(
  card: SimpleSimulationCard,
  isRevealed: boolean,
): SimpleSimulationCard {
  return {
    ...card,
    isRevealed,
    state: 'normal',
  };
}

function isValidSize(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * Simple mode keeps every non-guardian card in one visible list. Its reveal
 * state and color-marked state are intentionally independent from board mode.
 */
export function createSimpleSimulation(
  cardInputs: readonly (string | SimulationCardSeed)[],
  handSize: number,
  guardianSize: number,
  random: () => number = Math.random,
): SimpleSimulationState {
  if (!Array.isArray(cardInputs)) {
    throw new Error('cardInputs must be an array');
  }
  if (!isValidSize(handSize) || !isValidSize(guardianSize)) {
    throw new Error('handSize and guardianSize must be non-negative integers');
  }
  if (handSize + guardianSize > cardInputs.length) {
    throw new Error('not enough cards for the initial hand and guardians');
  }

  const shuffled = cardInputs.map((input, index): SimpleSimulationCard => ({
    instanceId: `simple-${index}`,
    cardId: typeof input === 'string' ? input : input.cardId,
    isRevealed: false,
    state: 'normal',
  }));
  shuffleSimulationCards(shuffled, random);

  const guardians = shuffled
    .slice(0, guardianSize)
    .map((card) => resetCard(card, false));
  const cards = shuffled
    .slice(guardianSize)
    .map((card, index) => resetCard(card, index < handSize));

  return { guardians, cards };
}

/** A hidden card reveals first; only later taps advance the color state. */
export function tapSimpleSimulationCard(
  state: SimpleSimulationState,
  instanceId: string,
): SimpleSimulationState {
  const next = cloneState(state);
  const card = [...next.guardians, ...next.cards].find(
    (candidate) => candidate.instanceId === instanceId,
  );
  if (!card) return state;

  if (!card.isRevealed) {
    card.isRevealed = true;
    return next;
  }

  card.state = getNextSimpleCardState(card.state);
  return next;
}

/** Keeps the same guardians, then reshuffles and re-hides the remaining cards. */
export function mulliganSimpleSimulation(
  state: SimpleSimulationState,
  handSize: number,
  random: () => number = Math.random,
): SimpleSimulationState {
  if (!isValidSize(handSize)) {
    throw new Error('handSize must be a non-negative integer');
  }
  if (handSize > state.cards.length) {
    throw new Error('not enough cards for the mulligan hand');
  }

  const cards = state.cards.map(cloneCard);
  shuffleSimulationCards(cards, random);
  return {
    guardians: state.guardians.map((card) => resetCard(card, false)),
    cards: cards.map((card, index) => resetCard(card, index < handSize)),
  };
}
