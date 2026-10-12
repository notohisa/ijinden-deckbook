import { useState } from 'react';
import type { DeckSimulatorProps } from '@/components/simulator-types';
import type { SimulatorSession } from '@/lib/simulator-session';
import { findSimulationCard, type SimulationCard } from '@/lib/simulator';
import {
  moveSimulatorSessionCardToGuardian,
  tapSimpleSimulatorCard,
} from '@/lib/simulator-session';
import type { SimulationRecipe } from '@/lib/simulator-recipe';
import type { SimpleCardState } from '@/lib/simple-simulator';

const nextStateMessages: Record<SimpleCardState, string> = {
  normal: 'をマリョクにしました。',
  mana: 'をマリョク（裏）にしました。',
  manaBack: 'を戦場にしました。',
  battlefield: 'を墓地にしました。',
  graveyard: 'を装備にしました。',
  equipped: 'を通常表示に戻しました。',
};

type Props = Pick<DeckSimulatorProps, 'cardsById'> & {
  session: SimulatorSession | null;
  recipe: SimulationRecipe;
  onStart: () => void;
  onMulligan: () => void;
  onUpdateSession: (
    update: (session: SimulatorSession) => SimulatorSession,
  ) => void;
};

export function useSimpleSimulator({
  cardsById,
  session,
  recipe,
  onStart,
  onMulligan,
  onUpdateSession,
}: Props) {
  const [message, setMessage] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const recipeChanged = Boolean(
    session && session.recipeSignature !== recipe.signature,
  );
  const simpleCards = session
    ? [
        ...session.board.zones.hand,
        ...session.board.zones.deck,
        ...session.board.zones.battlefield,
        ...session.board.zones.mana,
        ...session.board.zones.graveyard,
      ]
    : [];

  function start() {
    if (recipe.error) return;
    onStart();
    setConfirmReset(false);
    setMessage('シャッフルして、手札6枚とガーディアン4枚を用意しました。');
  }

  function mulligan() {
    if (!session?.canMulligan) return;
    onMulligan();
    setMessage('手札を引き直しました。ガーディアンは裏向きに戻しています。');
  }

  function tapCard(instance: SimulationCard) {
    if (!session) return;
    const card = findSimulationCard(session.board, instance.instanceId);
    if (!card) return;
    const currentState = session.simpleStates[instance.instanceId] ?? 'normal';
    onUpdateSession((current) =>
      tapSimpleSimulatorCard(current, instance.instanceId),
    );
    if (card.faceDown) {
      setMessage('カードを公開しました。');
      return;
    }
    setMessage(
      (cardsById.get(card.cardId)?.name ?? 'カード') +
        (nextStateMessages[currentState] ?? 'を切り替えました。'),
    );
  }

  function makeGuardian(instance: SimulationCard) {
    onUpdateSession((current) =>
      moveSimulatorSessionCardToGuardian(current, instance.instanceId),
    );
    setMessage('カードを裏向きのガーディアンにしました。');
  }

  return {
    message,
    confirmReset,
    setConfirmReset,
    recipeChanged,
    simpleCards,
    start,
    mulligan,
    tapCard,
    makeGuardian,
  };
}
