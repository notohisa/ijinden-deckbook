import { useEffect, useRef, useState } from 'react';
import { useDndMonitor } from '@dnd-kit/core';
import type { IjindenCard } from '@/app/ijinden-cards';
import type { SimulatorSession } from '@/lib/simulator-session';
import {
  findSimulationCard,
  isBattlefieldIjin,
  type SimulationCard,
  type SimulationZone,
} from '@/lib/simulator';
import { getSimulationMoveDestinations } from '@/lib/simulator-movement';
import {
  equipSimulatorSessionCard,
  flipSimulatorSessionCard,
  moveSimulatorSessionCard,
  moveTopDeckCardToGuardian,
  toggleSimulatorSessionCardGrayedOut,
  unequipSimulatorSessionCard,
} from '@/lib/simulator-session';
import type { SimulationRecipe } from '@/lib/simulator-recipe';
import {
  getBoardDropZone,
  getInitialBoardCollapseState,
  saveBoardCollapseState,
  type BoardCollapseState,
  type BoardZone,
  zoneNames,
} from '@/components/simulator/board-utils';

type Props = {
  cardsById: ReadonlyMap<string, IjindenCard>;
  session: SimulatorSession | null;
  recipe: SimulationRecipe;
  onMessageChange: (message: string) => void;
  onStart: () => void;
  onDraw: () => void;
  onMulligan: () => void;
  onUpdateSession: (
    update: (session: SimulatorSession) => SimulatorSession,
  ) => void;
};

export function useBoardSimulator({
  cardsById,
  session,
  recipe,
  onMessageChange,
  onStart,
  onDraw,
  onMulligan,
  onUpdateSession,
}: Props) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(
    null,
  );
  const [equipSourceId, setEquipSourceId] = useState<string | null>(null);
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  const [activeDragInstanceId, setActiveDragInstanceId] = useState<
    string | null
  >(null);
  const suppressCardTapRef = useRef(false);
  const suppressCardTapTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const [collapsedZones, setCollapsedZones] = useState<BoardCollapseState>(
    getInitialBoardCollapseState,
  );

  useEffect(() => {
    saveBoardCollapseState(collapsedZones);
  }, [collapsedZones]);

  useEffect(
    () => () => {
      if (suppressCardTapTimeoutRef.current) {
        clearTimeout(suppressCardTapTimeoutRef.current);
      }
    },
    [],
  );

  function toggleZone(zone: BoardZone) {
    setCollapsedZones((current) => ({ ...current, [zone]: !current[zone] }));
  }

  const detailCard = detailCardId ? cardsById.get(detailCardId) : undefined;
  const selectedInstance =
    session && selectedInstanceId
      ? findSimulationCard(session.board, selectedInstanceId)
      : undefined;
  const selectedCard = selectedInstance
    ? cardsById.get(selectedInstance.cardId)
    : undefined;
  const equippedIjinInstance =
    session && selectedInstance?.equippedTo
      ? findSimulationCard(session.board, selectedInstance.equippedTo)
      : undefined;
  const equippedIjinCard = equippedIjinInstance
    ? cardsById.get(equippedIjinInstance.cardId)
    : undefined;
  const equipSource =
    session && equipSourceId
      ? findSimulationCard(session.board, equipSourceId)
      : undefined;
  const equipSourceCard = equipSource
    ? cardsById.get(equipSource.cardId)
    : undefined;
  const battlefieldIjins = session
    ? session.board.zones.battlefield.filter(isBattlefieldIjin)
    : [];
  const activeDragInstance =
    session && activeDragInstanceId
      ? findSimulationCard(session.board, activeDragInstanceId)
      : undefined;
  const activeDragCard = activeDragInstance
    ? cardsById.get(activeDragInstance.cardId)
    : undefined;
  const dragDestinations = activeDragInstance
    ? getSimulationMoveDestinations(activeDragInstance, {
        allowFaceDownGuardians: true,
      })
    : [];
  const recipeChanged = Boolean(
    session && session.recipeSignature !== recipe.signature,
  );

  function start() {
    if (recipe.error) return;
    onStart();
    setConfirmReset(false);
    setSelectedInstanceId(null);
    setEquipSourceId(null);
    setDetailCardId(null);
  }

  function draw() {
    if (!session || session.board.zones.deck.length === 0) return;
    const remaining = session.board.zones.deck.length - 1;
    onDraw();
    onMessageChange(
      '1枚引きました。山札は残り' + String(remaining) + '枚です。',
    );
  }

  function mulligan() {
    if (!session?.canMulligan) return;
    onMulligan();
    setSelectedInstanceId(null);
    setEquipSourceId(null);
    onMessageChange('初期状態へ戻して、手札を引き直しました。');
  }

  function moveCard(instance: SimulationCard, destination: SimulationZone) {
    const card = cardsById.get(instance.cardId);
    onUpdateSession((current) =>
      moveSimulatorSessionCard(current, instance.instanceId, destination),
    );
    setSelectedInstanceId(null);
    setEquipSourceId(null);
    onMessageChange(
      destination === 'guardians'
        ? 'カードを裏向きのガーディアンへ移動しました。'
        : (card?.name ?? 'カード') +
            'を' +
            zoneNames[destination] +
            'へ移動しました。',
    );
  }

  function finishDrag() {
    setActiveDragInstanceId(null);
    suppressCardTapRef.current = true;
    if (suppressCardTapTimeoutRef.current) {
      clearTimeout(suppressCardTapTimeoutRef.current);
    }
    suppressCardTapTimeoutRef.current = setTimeout(() => {
      suppressCardTapRef.current = false;
      suppressCardTapTimeoutRef.current = null;
    }, 100);
  }

  function selectCard(instance: SimulationCard) {
    if (suppressCardTapRef.current) {
      suppressCardTapRef.current = false;
      if (suppressCardTapTimeoutRef.current) {
        clearTimeout(suppressCardTapTimeoutRef.current);
        suppressCardTapTimeoutRef.current = null;
      }
      return;
    }
    setSelectedInstanceId(instance.instanceId);
  }

  useDndMonitor({
    onDragStart({ active: dragged }) {
      const instance = session
        ? findSimulationCard(session.board, String(dragged.id))
        : undefined;
      if (!instance) return;
      setActiveDragInstanceId(instance.instanceId);
      setSelectedInstanceId(null);
      setEquipSourceId(null);
    },
    onDragEnd({ active: dragged, over }) {
      const instance = session
        ? findSimulationCard(session.board, String(dragged.id))
        : undefined;
      const destination = getBoardDropZone(over?.id);
      if (
        instance &&
        destination &&
        getSimulationMoveDestinations(instance, {
          allowFaceDownGuardians: true,
        }).includes(destination)
      ) {
        moveCard(instance, destination);
      }
      finishDrag();
    },
    onDragCancel() {
      finishDrag();
    },
  });

  function moveTopDeckCardToGuardianFromButton() {
    if (!session || session.board.zones.deck.length === 0) return;
    onUpdateSession(moveTopDeckCardToGuardian);
    onMessageChange('山札の上から1枚を裏向きのガーディアンへ移動しました。');
  }

  function flipCard(instance: SimulationCard) {
    onUpdateSession((current) =>
      flipSimulatorSessionCard(current, instance.instanceId),
    );
    setSelectedInstanceId(null);
    onMessageChange('ガーディアンを表向きにしました。');
  }

  function toggleGray(instance: SimulationCard) {
    const card = cardsById.get(instance.cardId);
    onUpdateSession((current) =>
      toggleSimulatorSessionCardGrayedOut(current, instance.instanceId),
    );
    setSelectedInstanceId(null);
    onMessageChange(
      (card?.name ?? 'カード') +
        (instance.isGrayedOut
          ? 'を通常表示に戻しました。'
          : 'をグレーアウトしました。'),
    );
  }

  function unequipCard(instance: SimulationCard) {
    const card = cardsById.get(instance.cardId);
    onUpdateSession((current) =>
      unequipSimulatorSessionCard(current, instance.instanceId),
    );
    setSelectedInstanceId(null);
    onMessageChange((card?.name ?? 'カード') + 'の装備を解除しました。');
  }

  function beginEquip(instance: SimulationCard) {
    setSelectedInstanceId(null);
    setEquipSourceId(instance.instanceId);
  }

  function equipCard(ijinInstance: SimulationCard) {
    if (!equipSource) return;
    const equipmentName = cardsById.get(equipSource.cardId)?.name ?? 'カード';
    const ijinName = cardsById.get(ijinInstance.cardId)?.name ?? 'イジン';
    onUpdateSession((current) =>
      equipSimulatorSessionCard(
        current,
        equipSource.instanceId,
        ijinInstance.instanceId,
      ),
    );
    setEquipSourceId(null);
    onMessageChange(equipmentName + 'を' + ijinName + 'へ装備しました。');
  }

  function openDetails(instance: SimulationCard) {
    setSelectedInstanceId(null);
    setDetailCardId(instance.cardId);
  }

  return {
    confirmReset,
    setConfirmReset,
    selectedInstanceId,
    setSelectedInstanceId,
    equipSourceId,
    setEquipSourceId,
    detailCardId,
    setDetailCardId,
    activeDragInstance,
    activeDragCard,
    dragDestinations,
    collapsedZones,
    toggleZone,
    detailCard,
    selectedInstance,
    selectedCard,
    equippedIjinCard,
    equipSource,
    equipSourceCard,
    battlefieldIjins,
    recipeChanged,
    start,
    draw,
    mulligan,
    moveCard,
    moveTopDeckCardToGuardian: moveTopDeckCardToGuardianFromButton,
    selectCard,
    flipCard,
    toggleGray,
    unequipCard,
    beginEquip,
    equipCard,
    openDetails,
  };
}
