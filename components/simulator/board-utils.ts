import type { IjindenCard } from '@/app/ijinden-cards';
import type { SimulationCard, SimulationZone } from '@/lib/simulator';
import { getSimulationMoveDestinations } from '@/lib/simulator-movement';

export const zoneNames: Record<SimulationZone, string> = {
  deck: '山札',
  hand: '手札',
  battlefield: '戦場',
  mana: 'マリョク',
  graveyard: '墓地',
  guardians: 'ガーディアン',
};

export type BoardZone = Exclude<SimulationZone, 'deck'>;
export type BoardCollapseState = Record<BoardZone, boolean>;

const BOARD_COLLAPSE_STORAGE_KEY =
  'ijinden-deckbook:simulator-board-collapsed-zones';

function isSmallScreen(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(max-width: 767px)').matches
  );
}

function getDefaultBoardCollapseState(): BoardCollapseState {
  const compact = isSmallScreen();
  return {
    hand: false,
    battlefield: false,
    mana: compact,
    graveyard: compact,
    guardians: compact,
  };
}

export function getInitialBoardCollapseState(): BoardCollapseState {
  const defaults = getDefaultBoardCollapseState();
  if (typeof window === 'undefined') return defaults;
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(BOARD_COLLAPSE_STORAGE_KEY) ?? 'null',
    ) as Partial<Record<BoardZone, unknown>> | null;
    if (!stored || typeof stored !== 'object') return defaults;
    return {
      hand: typeof stored.hand === 'boolean' ? stored.hand : defaults.hand,
      battlefield:
        typeof stored.battlefield === 'boolean'
          ? stored.battlefield
          : defaults.battlefield,
      mana: typeof stored.mana === 'boolean' ? stored.mana : defaults.mana,
      graveyard:
        typeof stored.graveyard === 'boolean'
          ? stored.graveyard
          : defaults.graveyard,
      guardians:
        typeof stored.guardians === 'boolean'
          ? stored.guardians
          : defaults.guardians,
    };
  } catch {
    return defaults;
  }
}

export function saveBoardCollapseState(state: BoardCollapseState): void {
  try {
    window.localStorage.setItem(
      BOARD_COLLAPSE_STORAGE_KEY,
      JSON.stringify(state),
    );
  } catch {
    // Zone visibility is a convenience preference only.
  }
}

export function getBoardDropZone(
  id: string | number | undefined,
): BoardZone | undefined {
  if (typeof id !== 'string') return undefined;
  return ['hand', 'battlefield', 'mana', 'graveyard', 'guardians'].find(
    (zone) => zone === id,
  ) as BoardZone | undefined;
}

export type MoveDestination = {
  zone: SimulationZone;
  label: string;
};

export function getMoveDestinations(
  instance: SimulationCard,
  card: IjindenCard,
): MoveDestination[] {
  return getSimulationMoveDestinations({
    ...instance,
    cardType: card.cardType,
  }).map((zone) => ({ zone, label: zoneNames[zone] + 'へ' }));
}
