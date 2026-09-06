'use client';

/* oxlint-disable next/no-img-element -- GitHub Pages renders official card URLs with standard images, without a Next.js image server. */

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { SimulatorModeToggle, type SimulationViewMode } from '@/components/simulator-mode-toggle';
import type {
  DeckSimulatorProps,
  SimulatorSession,
} from '@/components/simulator-types';
import {
  getNextSimpleCardState,
  type SimpleCardState,
} from '@/lib/simple-simulator';
import {
  SIMULATION_HAND_SIZE,
  type SimulationRecipe,
} from '@/lib/simulator-recipe';
import {
  flipSimulationCard,
  type SimulationCard,
} from '@/lib/simulator';

type Props = DeckSimulatorProps & {
  mode: SimulationViewMode;
  onModeChange: (mode: SimulationViewMode) => void;
  session: SimulatorSession | null;
  recipe: SimulationRecipe;
  onStart: () => void;
  onMulligan: () => void;
  onUpdateSession: (
    update: (session: SimulatorSession) => SimulatorSession,
  ) => void;
};

const stateLabels: Record<SimpleCardState, string | undefined> = {
  normal: undefined,
  mana: 'マリョク',
  manaBack: 'マリョク（裏）',
  battlefield: '戦場',
  graveyard: '墓地',
  equipped: '装備',
};

const nextStateMessages: Record<SimpleCardState, string> = {
  normal: 'をマリョクにしました。',
  mana: 'をマリョク（裏）にしました。',
  manaBack: 'を戦場にしました。',
  battlefield: 'を墓地にしました。',
  graveyard: 'を装備にしました。',
  equipped: 'を通常表示に戻しました。',
};

export function SimpleSimulator({
  active,
  recipeName,
  cardsById,
  onEditRecipe,
  mode,
  onModeChange,
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
    const card = cardsById.get(instance.cardId);
    if (instance.faceDown) {
      onUpdateSession((current) => ({
        ...current,
        board: flipSimulationCard(current.board, instance.instanceId),
        canMulligan: false,
        simpleStates: {
          ...current.simpleStates,
          [instance.instanceId]: 'normal',
        },
      }));
      setMessage((card?.name ?? 'カード') + 'を公開しました。');
      return;
    }
    const currentState = session?.simpleStates[instance.instanceId] ?? 'normal';
    onUpdateSession((current) => ({
      ...current,
      canMulligan: false,
      simpleStates: {
        ...current.simpleStates,
        [instance.instanceId]: getNextSimpleCardState(currentState),
      },
    }));
    setMessage(
      (card?.name ?? 'カード') +
        nextStateMessages[currentState],
    );
  }

  return (
    <section
      hidden={!active}
      role="tabpanel"
      aria-label="シミュレーション・簡易表示"
      className="mx-auto max-w-5xl space-y-4"
    >
      <div className="rounded-2xl border border-[var(--line)] bg-white/85 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="label">SIMPLE SOLO MODE</p>
            <h1 className="mt-1 font-display text-2xl tracking-wide">
              シミュレーション
            </h1>
          </div>
          <SimulatorModeToggle mode={mode} onChange={onModeChange} />
        </div>
        {!session && (
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            グレーのカードをめくり、公開済みカードは色で状態を記録する簡易表示です。サイドデッキは使いません。
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={Boolean(recipe.error)}
            onClick={() => (session ? setConfirmReset(true) : start())}
            className="h-11 bg-[var(--green)] px-4 text-sm text-white hover:bg-[var(--green)]/85"
          >
            {session ? 'リセット' : 'このレシピで開始'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onEditRecipe}
            className="h-11 border-[var(--line)] px-3 text-sm"
          >
            レシピを編集
          </Button>
        </div>
        <p className="mt-3 break-words text-sm">
          <span className="text-[var(--muted)]">
            {session ? '使用中：' : 'レシピ：'}
          </span>
          {session?.recipeName ?? (recipeName.trim() || '名前のないデッキ')}
        </p>
        {recipeChanged && (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
            レシピが変更されています。今のシミュレーションは開始時の内容を使っています。「リセット」で最新のレシピを読み込みます。
          </p>
        )}
        {recipe.error && (
          <p className="mt-3 text-sm text-[var(--red)]">
            {session ? '最新のレシピ：' : ''}
            {recipe.error}
          </p>
        )}
        {!session && (
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            初期手札6枚だけを公開して開始します。ガーディアン4枚と残りのカードは、タップすると1枚ずつ公開されます。
          </p>
        )}
      </div>

      {session && (
        <>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--soft)] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={mulligan}
                disabled={!session.canMulligan}
                className="h-11 border-[var(--line)] bg-white px-3 text-sm"
              >
                マリガン（1回）
              </Button>
              <p className="ml-auto py-1 text-sm tabular-nums">
                手札 {session.board.zones.hand.length}枚
                <span className="ml-2 text-[var(--muted)]">
                  残り {Math.max(0, simpleCards.length - SIMULATION_HAND_SIZE)}枚
                </span>
              </p>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              グレーのカードは最初のタップで公開します。公開後は、通常 → マリョク → マリョク（裏） → 戦場 → 墓地 → 装備 → 通常の順に切り替わります。
            </p>
            <output
              aria-live="polite"
              className="mt-2 block min-h-6 text-sm leading-6 text-[var(--green)]"
            >
              {message}
            </output>
          </div>

          <SimpleZone
            title="ガーディアン"
            count={session.board.zones.guardians.length}
          >
            <ul className="mt-3 grid max-w-md grid-cols-4 gap-2">
              {session.board.zones.guardians.map((instance, index) => {
                const card = cardsById.get(instance.cardId);
                return card ? (
                  <SimpleCardTile
                    key={instance.instanceId}
                    instance={instance}
                    state={session.simpleStates[instance.instanceId] ?? 'normal'}
                    cardName={card.name}
                    imageUrl={card.imageUrl}
                    hiddenLabel={'ガーディアン' + String(index + 1)}
                    onTap={() => tapCard(instance)}
                  />
                ) : null;
              })}
            </ul>
          </SimpleZone>

          <SimpleZone title="手札・残りのカード" count={simpleCards.length}>
            <ul className="mt-3 grid grid-cols-3 gap-2 min-[420px]:grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
              {simpleCards.map((instance, index) => {
                const card = cardsById.get(instance.cardId);
                return card ? (
                  <SimpleCardTile
                    key={instance.instanceId}
                    instance={instance}
                    state={session.simpleStates[instance.instanceId] ?? 'normal'}
                    cardName={card.name}
                    imageUrl={card.imageUrl}
                    hiddenLabel={'未公開カード' + String(index + 1)}
                    onTap={() => tapCard(instance)}
                  />
                ) : null;
              })}
            </ul>
          </SimpleZone>
        </>
      )}

      <p className="px-1 text-xs leading-6 text-[var(--muted)]">
        簡易表示では、カードの実際の移動や装備処理は行いません。盤面を細かく管理したい場合は「盤面表示」へ切り替えてください。
      </p>

      <AlertDialog open={active && confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent className="max-h-[85dvh] overflow-y-auto bg-[var(--paper)]">
          <AlertDialogHeader>
            <AlertDialogTitle>簡易表示をリセットしますか？</AlertDialogTitle>
            <AlertDialogDescription>
              公開済みカードと色による状態をリセットし、最新のレシピをシャッフルして開始します。保存済みマイデッキには影響しません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={start}
              disabled={Boolean(recipe.error)}
              className="h-11"
            >
              リセット
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function SimpleZone({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-2xl border border-[var(--line)] bg-white/75 p-3 sm:p-4"
      aria-label={title}
    >
      <h2 className="font-display text-lg">
        {title}{' '}
        <span className="ml-1 font-sans text-sm text-[var(--muted)]">
          {count}枚
        </span>
      </h2>
      {children}
    </section>
  );
}

function SimpleCardTile({
  instance,
  state,
  cardName,
  imageUrl,
  hiddenLabel,
  onTap,
}: {
  instance: SimulationCard;
  state: SimpleCardState;
  cardName: string;
  imageUrl: string;
  hiddenLabel: string;
  onTap: () => void;
}) {
  const stateLabel = stateLabels[state];
  const overlayClass: Record<SimpleCardState, string> = {
    normal: '',
    mana: 'bg-[rgb(255_0_0_/_0.45)] text-white',
    manaBack: 'bg-[rgb(255_255_255_/_0.70)] text-[var(--ink)]',
    battlefield: 'bg-[rgb(255_220_0_/_0.45)] text-[var(--ink)]',
    graveyard: 'bg-[rgb(0_0_0_/_0.60)] text-white',
    equipped: 'bg-[rgb(0_100_255_/_0.45)] text-white',
  };
  const name = instance.faceDown ? hiddenLabel : cardName;

  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onTap}
        aria-label={
          !instance.faceDown
            ? cardName + (stateLabel ? '、' + stateLabel : '、通常') + 'を切り替える'
            : hiddenLabel + 'を公開する'
        }
        className="relative block aspect-[5/7] w-full touch-manipulation overflow-hidden rounded-md border border-[var(--line)] bg-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--red)]"
      >
        {!instance.faceDown ? (
          <img
            src={imageUrl}
            alt={cardName}
            loading="lazy"
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <span className="absolute inset-0 grid place-content-center gap-1 bg-slate-500 px-1 text-center text-xs leading-5 text-white">
            <span aria-hidden="true" className="text-xl">◆</span>
            <span>グレー</span>
          </span>
        )}
        {!instance.faceDown && stateLabel && (
          <span
            className={'absolute inset-0 grid place-content-center px-1 text-center text-sm font-bold drop-shadow ' + overlayClass[state]}
          >
            {stateLabel}
          </span>
        )}
      </button>
      <p className="mt-1 line-clamp-2 min-h-10 break-words text-sm leading-5">
        {name}
      </p>
    </li>
  );
}
