export type SimulationZone = 'deck' | 'hand' | 'guardians';

export type SimulationCard = {
  instanceId: string;
  cardId: string;
  faceDown: boolean;
};

export type SimulationState = {
  zones: Record<SimulationZone, SimulationCard[]>;
};

const zoneOrder: readonly SimulationZone[] = ['deck', 'hand', 'guardians'];

function cloneCard(card: SimulationCard): SimulationCard {
  return { ...card };
}

function cloneState(state: SimulationState): SimulationState {
  const zones = {} as Record<SimulationZone, SimulationCard[]>;

  for (const zone of zoneOrder) {
    zones[zone] = state.zones[zone].map(cloneCard);
  }

  return { zones };
}

function shuffleCards(
  cards: SimulationCard[],
  random: () => number = Math.random,
): void {
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const value = random();
    const normalized = Number.isFinite(value)
      ? Math.min(1 - Number.EPSILON, Math.max(0, value))
      : 0;
    const swapIndex = Math.floor(normalized * (index + 1));
    [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
  }
}

function findCard(
  state: SimulationState,
  instanceId: string,
): { zone: SimulationZone; index: number } | undefined {
  for (const zone of zoneOrder) {
    const index = state.zones[zone].findIndex(
      (card) => card.instanceId === instanceId,
    );

    if (index !== -1) {
      return { zone, index };
    }
  }

  return undefined;
}

function isValidSize(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function createSimulation(
  cardIds: readonly string[],
  handSize: number,
  guardianSize: number,
  random: () => number = Math.random,
): SimulationState {
  if (!Array.isArray(cardIds)) {
    throw new Error('cardIds must be an array');
  }

  if (!isValidSize(handSize) || !isValidSize(guardianSize)) {
    throw new Error('handSize and guardianSize must be non-negative integers');
  }

  if (handSize + guardianSize > cardIds.length) {
    throw new Error('not enough cards for the initial hand and guardians');
  }

  const cards = cardIds.map((cardId, index) => ({
    instanceId: `sim-${index}`,
    cardId,
    faceDown: false,
  }));

  shuffleCards(cards, random);

  const guardiansEnd = guardianSize;
  const handEnd = guardiansEnd + handSize;

  return {
    zones: {
      deck: cards.slice(handEnd).map((card) => ({ ...card, faceDown: true })),
      hand: cards.slice(guardiansEnd, handEnd),
      guardians: cards
        .slice(0, guardiansEnd)
        .map((card) => ({ ...card, faceDown: true })),
    },
  };
}

export function drawSimulationCards(
  state: SimulationState,
  count = 1,
): SimulationState {
  if (
    !Number.isSafeInteger(count) ||
    count <= 0 ||
    state.zones.deck.length === 0
  ) {
    return state;
  }

  const next = cloneState(state);
  const drawn = next.zones.deck.splice(
    0,
    Math.min(count, next.zones.deck.length),
  );

  for (const card of drawn) {
    card.faceDown = false;
  }

  next.zones.hand.push(...drawn);
  return next;
}

export function mulliganSimulation(
  state: SimulationState,
  handSize = 6,
  random: () => number = Math.random,
): SimulationState {
  if (!isValidSize(handSize)) {
    throw new Error('handSize must be a non-negative integer');
  }

  const availableCards = state.zones.hand.length + state.zones.deck.length;
  if (handSize > availableCards) {
    throw new Error('not enough cards for the mulligan hand');
  }

  const cards = [...state.zones.hand, ...state.zones.deck].map(cloneCard);
  shuffleCards(cards, random);

  const next = cloneState(state);
  next.zones.hand = cards.slice(0, handSize).map((card) => ({
    ...card,
    faceDown: false,
  }));
  next.zones.deck = cards.slice(handSize).map((card) => ({
    ...card,
    faceDown: true,
  }));
  return next;
}

export function flipSimulationCard(
  state: SimulationState,
  instanceId: string,
): SimulationState {
  const location = findCard(state, instanceId);
  if (!location) {
    return state;
  }

  const next = cloneState(state);
  const card = next.zones[location.zone][location.index];
  card.faceDown = !card.faceDown;
  return next;
}
