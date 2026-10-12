'use client';

import { memo } from 'react';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SimpleSimulator } from '@/components/simple-simulator';
import { BoardView } from '@/components/simulator/board-view';
import {
  getBoardDropZone,
  zoneNames,
} from '@/components/simulator/board-utils';
import type { DeckSimulatorProps } from '@/components/simulator-types';
import { useSimulatorSession } from '@/hooks/use-simulator-session';

export const DeckSimulator = memo(function DeckSimulator(
  props: DeckSimulatorProps,
) {
  const {
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
  } = useSimulatorSession(props);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 6 },
    }),
  );

  return (
    <>
      <DndContext
        key={`${props.active ? 'active' : 'inactive'}-${mode}-${dragEpoch}`}
        sensors={sensors}
        collisionDetection={pointerWithin}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              'カードを移動するにはドラッグしてください。Enterまたはスペースでカードの操作メニューを開けます。',
          },
          announcements: {
            onDragStart: () => 'カードをドラッグしています。',
            onDragOver: ({ over }) => {
              const destination = getBoardDropZone(over?.id);
              return destination
                ? zoneNames[destination] + 'へ移動できます。'
                : '移動できるゾーンの上へカードを運んでください。';
            },
            onDragEnd: ({ over }) => {
              const destination = getBoardDropZone(over?.id);
              return destination
                ? 'カードを' + zoneNames[destination] + 'へ移動しました。'
                : 'カードの移動をキャンセルしました。';
            },
            onDragCancel: () => 'カードの移動をキャンセルしました。',
          },
        }}
      >
        <BoardView
          key={`${props.active ? 'active' : 'inactive'}-${mode}-${dragEpoch}`}
          {...props}
          active={props.active && mode === 'board'}
          mode={mode}
          onModeChange={setMode}
          session={session}
          message={boardMessage}
          onMessageChange={setBoardMessage}
          recipe={recipe}
          onStart={start}
          onDraw={draw}
          onMulligan={mulligan}
          onUpdateSession={updateSession}
        />
      </DndContext>
      <SimpleSimulator
        {...props}
        active={props.active && mode === 'simple'}
        mode={mode}
        onModeChange={setMode}
        session={session}
        recipe={recipe}
        onStart={start}
        onMulligan={mulligan}
        onUpdateSession={updateSession}
      />
    </>
  );
}, areDeckSimulatorPropsEqual);

function areDeckSimulatorPropsEqual(
  previous: DeckSimulatorProps,
  next: DeckSimulatorProps,
): boolean {
  if (previous.active !== next.active) return false;

  // Keep the mounted session quiet while hidden; activating it renders with the latest inputs.
  if (!previous.active) return true;

  return (
    previous.recipeName === next.recipeName &&
    previous.main === next.main &&
    previous.cardsById === next.cardsById &&
    previous.onEditRecipe === next.onEditRecipe
  );
}
