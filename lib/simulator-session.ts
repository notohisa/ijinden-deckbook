import type { SimulationRecipe } from './simulator-recipe.ts';
import {
  createSimulation,
  drawSimulationCards,
  equipSimulationCard,
  findSimulationCard,
  flipSimulationCard,
  isBattlefieldIjin,
  moveSimulationCard,
  mulliganSimulation,
  toggleSimulationCardGrayedOut,
  unequipSimulationCard,
  type SimulationState,
  type SimulationZone,
} from './simulator.ts';
import {
  getNextSimpleCardState,
  type SimpleCardState,
} from './simple-simulator.ts';
import {
  SIMULATION_GUARDIAN_SIZE,
  SIMULATION_HAND_SIZE,
} from './simulator-recipe.ts';

export type SimulatorSession = {
  board: SimulationState;
  recipeSignature: string;
  recipeName: string;
  canMulligan: boolean;
  drawn: number;
  simpleStates: Record<string, SimpleCardState>;
};

export function createSimulatorSession(
  recipe: Pick<SimulationRecipe, 'signature' | 'cardInputs'>,
  recipeName: string,
  random: () => number = Math.random,
): SimulatorSession {
  return {
    board: createSimulation(
      recipe.cardInputs,
      SIMULATION_HAND_SIZE,
      SIMULATION_GUARDIAN_SIZE,
      random,
    ),
    recipeSignature: recipe.signature,
    recipeName: recipeName.trim() || '名前のないデッキ',
    canMulligan: true,
    drawn: 0,
    simpleStates: {},
  };
}

export function drawSimulatorSession(
  session: SimulatorSession,
): SimulatorSession {
  if (session.board.zones.deck.length === 0) return session;
  return {
    ...session,
    board: drawSimulationCards(session.board),
    canMulligan: false,
    drawn: session.drawn + 1,
  };
}

export function mulliganSimulatorSession(
  session: SimulatorSession,
  random: () => number = Math.random,
): SimulatorSession {
  if (!session.canMulligan) return session;
  return {
    ...session,
    board: mulliganSimulation(session.board, SIMULATION_HAND_SIZE, random),
    canMulligan: false,
    drawn: 0,
    simpleStates: {},
  };
}

export function tapSimpleSimulatorCard(
  session: SimulatorSession,
  instanceId: string,
): SimulatorSession {
  const card = findSimulationCard(session.board, instanceId);
  if (!card) return session;

  if (card.faceDown) {
    return {
      ...session,
      board: flipSimulationCard(session.board, instanceId),
      canMulligan: false,
      simpleStates: { ...session.simpleStates, [instanceId]: 'normal' },
    };
  }

  const currentState = session.simpleStates[instanceId] ?? 'normal';
  return {
    ...session,
    canMulligan: false,
    simpleStates: {
      ...session.simpleStates,
      [instanceId]: getNextSimpleCardState(currentState),
    },
  };
}

function clearMovedCardStates(
  session: SimulatorSession,
  instanceId: string,
  destination: SimulationZone,
): Record<string, SimpleCardState> {
  const moving = findSimulationCard(session.board, instanceId);
  const simpleStates = { ...session.simpleStates };
  delete simpleStates[instanceId];
  if (moving && isBattlefieldIjin(moving) && destination !== 'battlefield') {
    for (const attached of session.board.zones.battlefield) {
      if (attached.equippedTo === instanceId) {
        delete simpleStates[attached.instanceId];
      }
    }
  }
  return simpleStates;
}

export function moveSimulatorSessionCard(
  session: SimulatorSession,
  instanceId: string,
  destination: SimulationZone,
): SimulatorSession {
  const board = moveSimulationCard(session.board, instanceId, destination);
  if (board === session.board) return session;
  return {
    ...session,
    board,
    canMulligan: false,
    simpleStates: clearMovedCardStates(session, instanceId, destination),
  };
}

export function moveSimulatorSessionCardToGuardian(
  session: SimulatorSession,
  instanceId: string,
): SimulatorSession {
  return moveSimulatorSessionCard(session, instanceId, 'guardians');
}

export function moveTopDeckCardToGuardian(
  session: SimulatorSession,
): SimulatorSession {
  const topCard = session.board.zones.deck[0];
  return topCard
    ? moveSimulatorSessionCardToGuardian(session, topCard.instanceId)
    : session;
}

export function flipSimulatorSessionCard(
  session: SimulatorSession,
  instanceId: string,
): SimulatorSession {
  return {
    ...session,
    board: flipSimulationCard(session.board, instanceId),
    canMulligan: false,
  };
}

export function toggleSimulatorSessionCardGrayedOut(
  session: SimulatorSession,
  instanceId: string,
): SimulatorSession {
  return {
    ...session,
    board: toggleSimulationCardGrayedOut(session.board, instanceId),
    canMulligan: false,
  };
}

export function unequipSimulatorSessionCard(
  session: SimulatorSession,
  instanceId: string,
): SimulatorSession {
  const simpleStates = { ...session.simpleStates };
  delete simpleStates[instanceId];
  return {
    ...session,
    board: unequipSimulationCard(session.board, instanceId),
    canMulligan: false,
    simpleStates,
  };
}

export function equipSimulatorSessionCard(
  session: SimulatorSession,
  equipmentInstanceId: string,
  ijinInstanceId: string,
): SimulatorSession {
  const simpleStates = { ...session.simpleStates };
  delete simpleStates[equipmentInstanceId];
  return {
    ...session,
    board: equipSimulationCard(
      session.board,
      equipmentInstanceId,
      ijinInstanceId,
    ),
    canMulligan: false,
    simpleStates,
  };
}
