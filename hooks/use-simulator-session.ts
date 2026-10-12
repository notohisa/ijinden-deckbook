import { useEffect, useMemo, useState } from 'react';
import type { DeckSimulatorProps } from '@/components/simulator-types';
import type { SimulationViewMode } from '@/components/simulator-mode-toggle';
import {
  createSimulatorSession,
  drawSimulatorSession,
  mulliganSimulatorSession,
  type SimulatorSession,
} from '@/lib/simulator-session';
import { buildSimulationRecipe } from '@/lib/simulator-recipe';

const MODE_STORAGE_KEY = 'ijinden-deckbook:simulator-view-mode';

function isSmallScreen(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(max-width: 767px)').matches
  );
}

function getInitialViewMode(): SimulationViewMode {
  if (typeof window === 'undefined') return 'board';
  try {
    const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
    if (stored === 'simple' || stored === 'board') return stored;
  } catch {
    // A blocked localStorage must not prevent the simulator from opening.
  }
  return isSmallScreen() ? 'simple' : 'board';
}

export function useSimulatorSession(props: DeckSimulatorProps) {
  const [mode, setMode] = useState<SimulationViewMode>(getInitialViewMode);
  const [session, setSession] = useState<SimulatorSession | null>(null);
  const [boardMessage, setBoardMessage] = useState('');
  const [dragEpoch, setDragEpoch] = useState(0);
  const recipe = useMemo(
    () => buildSimulationRecipe(props.main, props.cardsById),
    [props.main, props.cardsById],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {
      // Preference storage is optional.
    }
  }, [mode]);

  function start() {
    if (recipe.error) return;
    setBoardMessage('シャッフルして手札6枚・ガーディアン4枚を配りました。');
    setDragEpoch((current) => current + 1);
    setSession(createSimulatorSession(recipe, props.recipeName));
  }

  function updateSession(
    update: (session: SimulatorSession) => SimulatorSession,
  ) {
    setSession((current) => (current ? update(current) : current));
  }

  function draw() {
    updateSession(drawSimulatorSession);
  }

  function mulligan() {
    updateSession(mulliganSimulatorSession);
  }

  return {
    mode,
    setMode,
    session,
    boardMessage,
    setBoardMessage,
    dragEpoch,
    recipe,
    start,
    draw,
    mulligan,
    updateSession,
  };
}
