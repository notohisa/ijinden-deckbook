'use client';

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
import {
  SimulatorModeToggle,
  type SimulationViewMode,
} from '@/components/simulator-mode-toggle';
import { SimpleCardTile } from '@/components/simulator/simple-card-tile';
import { SimpleZone } from '@/components/simulator/simple-zone';
import type {
  DeckSimulatorProps,
  SimulatorSession,
} from '@/components/simulator-types';
import type { SimulationRecipe } from '@/lib/simulator-recipe';
import { useSimpleSimulator } from '@/hooks/use-simple-simulator';

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
  const {
    message,
    confirmReset,
    setConfirmReset,
    recipeChanged,
    simpleCards,
    start,
    mulligan,
    tapCard,
    makeGuardian,
  } = useSimpleSimulator({
    cardsById,
    session,
    recipe,
    onStart,
    onMulligan,
    onUpdateSession,
  });

  return (
    <section
      hidden={!active}
      role="tabpanel"
      aria-label="シミュレーション・簡易表示"
      className="mx-auto max-w-5xl space-y-4"
    >
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]/85 p-4 sm:p-5">
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
            グレーのカードをめくり、公開済みカードは色で状態を記録する簡易表示です。各カードをガーディアンへ移すこともできます。サイドデッキは使いません。
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={Boolean(recipe.error)}
            onClick={() => (session ? setConfirmReset(true) : start())}
            className="h-11 bg-[var(--green-solid)] px-4 text-sm text-white hover:bg-[var(--green-solid)]/85"
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
          <p className="mt-3 rounded-lg border border-[var(--warning-line-strong)] bg-[var(--warning-bg)] p-3 text-sm leading-6 text-[var(--warning-foreground)]">
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
            初期手札6枚だけを公開して開始します。ガーディアン4枚と残りのカードは、タップすると1枚ずつ公開されます。カード下のボタンで裏向きのガーディアンにできます。
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
                className="h-11 border-[var(--line)] bg-[var(--surface)] px-3 text-sm"
              >
                マリガン（1回）
              </Button>
              <p className="ml-auto py-1 text-sm tabular-nums">
                手札 {session.board.zones.hand.length}枚
                <span className="ml-2 text-[var(--muted)]">
                  手札以外{' '}
                  {Math.max(
                    0,
                    simpleCards.length - session.board.zones.hand.length,
                  )}
                  枚
                </span>
              </p>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              グレーのカードは最初のタップで公開します。公開後は、通常 →
              マリョク → マリョク（裏） → 戦場 → 墓地 → 装備 →
              通常の順に切り替わります。
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
            <ul className="mt-3 flex max-w-md flex-wrap items-start gap-2">
              {session.board.zones.guardians.map((instance, index) => {
                const card = cardsById.get(instance.cardId);
                return card ? (
                  <SimpleCardTile
                    key={instance.instanceId}
                    instance={instance}
                    state={
                      session.simpleStates[instance.instanceId] ?? 'normal'
                    }
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
            <ul className="mt-3 flex flex-wrap items-start gap-2">
              {simpleCards.map((instance, index) => {
                const card = cardsById.get(instance.cardId);
                return card ? (
                  <SimpleCardTile
                    key={instance.instanceId}
                    instance={instance}
                    state={
                      session.simpleStates[instance.instanceId] ?? 'normal'
                    }
                    cardName={card.name}
                    imageUrl={card.imageUrl}
                    hiddenLabel={'未公開カード' + String(index + 1)}
                    onTap={() => tapCard(instance)}
                    onMakeGuardian={() => makeGuardian(instance)}
                  />
                ) : null;
              })}
            </ul>
          </SimpleZone>
        </>
      )}

      <p className="px-1 text-xs leading-6 text-[var(--muted)]">
        簡易表示では、ガーディアンへの移動以外のカード移動や装備処理は行いません。盤面を細かく管理したい場合は「盤面表示」へ切り替えてください。
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
