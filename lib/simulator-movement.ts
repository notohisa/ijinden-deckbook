import type { SimulationCard, SimulationZone } from '@/lib/simulator';

type SimulationMoveCard = Pick<
  SimulationCard,
  'zone' | 'cardType' | 'faceDown' | 'equippedTo'
>;

type SimulationMoveOptions = {
  allowFaceDownGuardians?: boolean;
};

/** Returns valid destinations for a physical simulation-card move. */
export function getSimulationMoveDestinations(
  card: SimulationMoveCard,
  options: SimulationMoveOptions = {},
): SimulationZone[] {
  if (card.equippedTo) return ['graveyard', 'guardians'];

  if (card.faceDown) {
    return options.allowFaceDownGuardians && card.zone === 'guardians'
      ? ['hand', 'mana', 'graveyard']
      : [];
  }

  const isManaOrMagic =
    card.cardType === 'マリョク' || card.cardType === 'マホウ';

  switch (card.zone) {
    case 'hand':
      return isManaOrMagic
        ? ['mana', 'graveyard', 'guardians']
        : ['battlefield', 'mana', 'graveyard', 'guardians'];
    case 'battlefield':
      return ['hand', 'mana', 'graveyard', 'guardians'];
    case 'mana':
      return isManaOrMagic
        ? ['hand', 'graveyard', 'guardians']
        : ['battlefield', 'hand', 'graveyard', 'guardians'];
    case 'graveyard':
      return isManaOrMagic
        ? ['hand', 'mana', 'guardians']
        : ['battlefield', 'hand', 'mana', 'guardians'];
    case 'guardians':
      return ['hand', 'mana', 'graveyard'];
    case 'deck':
      return [];
  }
}
