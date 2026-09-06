export type SimulationZone =
  | 'deck'
  | 'hand'
  | 'battlefield'
  | 'mana'
  | 'graveyard'
  | 'guardians';

export type EquipAbility = {
  normalEquip: boolean;
  graveEquip: boolean;
};

export type SimulationCardSeed = {
  cardId: string;
  cardType?: string;
  description?: string;
};

export type SimulationCard = {
  instanceId: string;
  cardId: string;
  cardType?: string;
  zone: SimulationZone;
  faceDown: boolean;
  isGrayedOut: boolean;
  equipAbility: EquipAbility;
  equippedTo?: string;
  equipOriginZone?: SimulationZone;
};

export type SimulationState = {
  zones: Record<SimulationZone, SimulationCard[]>;
};

const zoneOrder: readonly SimulationZone[] = [
  'deck',
  'hand',
  'battlefield',
  'mana',
  'graveyard',
  'guardians',
];

function isFaceDownZone(zone: SimulationZone): boolean {
  return zone === 'deck' || zone === 'guardians';
}

function cloneCard(card: SimulationCard): SimulationCard {
  return {
    ...card,
    equipAbility: { ...card.equipAbility },
  };
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

    if (index !== -1) return { zone, index };
  }

  return undefined;
}

function isValidSize(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function asSeed(value: string | SimulationCardSeed): SimulationCardSeed {
  return typeof value === 'string' ? { cardId: value } : value;
}

function resetCardForZone(
  card: SimulationCard,
  zone: SimulationZone,
): SimulationCard {
  return {
    ...card,
    zone,
    faceDown: isFaceDownZone(zone),
    isGrayedOut: false,
    equippedTo: undefined,
    equipOriginZone: undefined,
  };
}

function releaseEquipmentCard(
  state: SimulationState,
  equipmentInstanceId: string,
): boolean {
  const location = findCard(state, equipmentInstanceId);
  if (!location) return false;
  const equipment = state.zones[location.zone][location.index];
  if (!equipment.equippedTo) return false;

  const origin = equipment.equipOriginZone ?? 'battlefield';
  const released = resetCardForZone(equipment, origin);
  if (location.zone === origin) {
    state.zones[origin][location.index] = released;
  } else {
    state.zones[location.zone].splice(location.index, 1);
    state.zones[origin].push(released);
  }
  return true;
}

function releaseEquipmentAttachedTo(
  state: SimulationState,
  ijinInstanceId: string,
): void {
  const attachedIds = state.zones.battlefield
    .filter((card) => card.equippedTo === ijinInstanceId)
    .map((card) => card.instanceId);

  for (const attachedId of attachedIds) {
    releaseEquipmentCard(state, attachedId);
  }
}

/**
 * Converts card text to stable metadata once at simulation start. The pattern
 * requires an ability label (`装備:` or `装備(...):`), rather than matching an
 * arbitrary occurrence of the word 装備 in prose.
 */
export function getEquipAbility(description = ''): EquipAbility {
  const normalized = description
    .normalize('NFKC')
    .replace(/[\s\u3000]+/g, '');
  return {
    normalEquip: /装備(?:\([^)]*\))?:/.test(normalized),
    graveEquip: normalized.includes('冥装'),
  };
}

export function isBattlefieldIjin(card: SimulationCard): boolean {
  return (
    card.zone === 'battlefield' &&
    !card.equippedTo &&
    card.cardType === 'イジン'
  );
}

export function findSimulationCard(
  state: SimulationState,
  instanceId: string,
): SimulationCard | undefined {
  const location = findCard(state, instanceId);
  return location ? state.zones[location.zone][location.index] : undefined;
}

export function createSimulation(
  cardInputs: readonly (string | SimulationCardSeed)[],
  handSize: number,
  guardianSize: number,
  random: () => number = Math.random,
): SimulationState {
  if (!Array.isArray(cardInputs)) {
    throw new Error('cardInputs must be an array');
  }

  if (!isValidSize(handSize) || !isValidSize(guardianSize)) {
    throw new Error('handSize and guardianSize must be non-negative integers');
  }

  if (handSize + guardianSize > cardInputs.length) {
    throw new Error('not enough cards for the initial hand and guardians');
  }

  const cards = cardInputs.map((input, index): SimulationCard => {
    const seed = asSeed(input);
    return {
      instanceId: `sim-${index}`,
      cardId: seed.cardId,
      ...(seed.cardType ? { cardType: seed.cardType } : {}),
      zone: 'deck',
      faceDown: false,
      isGrayedOut: false,
      equipAbility: getEquipAbility(seed.description),
    };
  });

  shuffleCards(cards, random);

  const guardiansEnd = guardianSize;
  const handEnd = guardiansEnd + handSize;
  const guardians = cards.slice(0, guardiansEnd).map((card) =>
    resetCardForZone(card, 'guardians'),
  );
  const hand = cards.slice(guardiansEnd, handEnd).map((card) =>
    resetCardForZone(card, 'hand'),
  );
  const deck = cards.slice(handEnd).map((card) =>
    resetCardForZone(card, 'deck'),
  );

  return {
    zones: {
      deck,
      hand,
      battlefield: [],
      mana: [],
      graveyard: [],
      guardians,
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
  next.zones.hand.push(
    ...drawn.map((card) => resetCardForZone(card, 'hand')),
  );
  return next;
}

/**
 * A mulligan rebuilds the movable zones from scratch. Guardians stay with the
 * same cards but return face-down; equipment, gray state, and all other zones
 * are cleared.
 */
export function mulliganSimulation(
  state: SimulationState,
  handSize = 6,
  random: () => number = Math.random,
): SimulationState {
  if (!isValidSize(handSize)) {
    throw new Error('handSize must be a non-negative integer');
  }

  const movableCards = [
    ...state.zones.hand,
    ...state.zones.deck,
    ...state.zones.battlefield,
    ...state.zones.mana,
    ...state.zones.graveyard,
  ].map(cloneCard);
  if (handSize > movableCards.length) {
    throw new Error('not enough cards for the mulligan hand');
  }

  shuffleCards(movableCards, random);
  const guardians = state.zones.guardians.map((card) =>
    resetCardForZone(card, 'guardians'),
  );
  const hand = movableCards.slice(0, handSize).map((card) =>
    resetCardForZone(card, 'hand'),
  );
  const deck = movableCards.slice(handSize).map((card) =>
    resetCardForZone(card, 'deck'),
  );

  return {
    zones: {
      deck,
      hand,
      battlefield: [],
      mana: [],
      graveyard: [],
      guardians,
    },
  };
}

export function flipSimulationCard(
  state: SimulationState,
  instanceId: string,
): SimulationState {
  const location = findCard(state, instanceId);
  if (!location) return state;

  const next = cloneState(state);
  const card = next.zones[location.zone][location.index];
  card.faceDown = !card.faceDown;
  return next;
}

export function toggleSimulationCardGrayedOut(
  state: SimulationState,
  instanceId: string,
): SimulationState {
  const location = findCard(state, instanceId);
  if (!location) return state;
  const existing = state.zones[location.zone][location.index];
  if (existing.faceDown || existing.zone === 'deck') return state;

  const next = cloneState(state);
  const card = next.zones[location.zone][location.index];
  card.isGrayedOut = !card.isGrayedOut;
  return next;
}

/** Moves a physical card and clears its gray/equipment state. */
export function moveSimulationCard(
  state: SimulationState,
  instanceId: string,
  destination: SimulationZone,
): SimulationState {
  const location = findCard(state, instanceId);
  if (!location) return state;
  const original = state.zones[location.zone][location.index];
  if (location.zone === destination && !original.equippedTo) return state;

  const next = cloneState(state);
  const currentLocation = findCard(next, instanceId);
  if (!currentLocation) return state;
  const movingCard = next.zones[currentLocation.zone][currentLocation.index];

  if (isBattlefieldIjin(movingCard) && destination !== 'battlefield') {
    releaseEquipmentAttachedTo(next, instanceId);
  }

  const finalLocation = findCard(next, instanceId);
  if (!finalLocation) return state;
  const [card] = next.zones[finalLocation.zone].splice(finalLocation.index, 1);
  next.zones[destination].push(resetCardForZone(card, destination));
  return next;
}

export function canEquipSimulationCard(card: SimulationCard): boolean {
  if (card.equippedTo) return false;
  if (
    card.equipAbility.normalEquip &&
    (card.zone === 'battlefield' || card.zone === 'mana')
  ) {
    return true;
  }
  return card.equipAbility.graveEquip && card.zone === 'graveyard';
}

/** Moves an eligible card onto a battlefield Ijin and records its origin. */
export function equipSimulationCard(
  state: SimulationState,
  equipmentInstanceId: string,
  ijinInstanceId: string,
): SimulationState {
  const equipmentLocation = findCard(state, equipmentInstanceId);
  const ijinLocation = findCard(state, ijinInstanceId);
  if (!equipmentLocation || !ijinLocation) return state;
  const equipment = state.zones[equipmentLocation.zone][equipmentLocation.index];
  const ijin = state.zones[ijinLocation.zone][ijinLocation.index];
  if (!canEquipSimulationCard(equipment) || !isBattlefieldIjin(ijin)) {
    return state;
  }

  const next = cloneState(state);
  const sourceLocation = findCard(next, equipmentInstanceId);
  if (!sourceLocation) return state;
  const sourceZone = sourceLocation.zone;
  const equipmentCard = next.zones[sourceZone][sourceLocation.index];
  const equipped: SimulationCard = {
    ...equipmentCard,
    zone: 'battlefield',
    faceDown: false,
    isGrayedOut: false,
    equippedTo: ijinInstanceId,
    equipOriginZone: sourceZone,
  };

  if (sourceZone === 'battlefield') {
    next.zones.battlefield[sourceLocation.index] = equipped;
  } else {
    next.zones[sourceZone].splice(sourceLocation.index, 1);
    next.zones.battlefield.push(equipped);
  }
  return next;
}

export function unequipSimulationCard(
  state: SimulationState,
  equipmentInstanceId: string,
): SimulationState {
  const equipment = findSimulationCard(state, equipmentInstanceId);
  if (!equipment?.equippedTo) return state;

  const next = cloneState(state);
  return releaseEquipmentCard(next, equipmentInstanceId) ? next : state;
}
