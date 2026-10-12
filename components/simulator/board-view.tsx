'use client';

/* oxlint-disable next/no-img-element -- GitHub Pages renders official card URLs without a Next.js image server. */

import { DragOverlay, useDroppable } from '@dnd-kit/core';
import {
  BoardCardTile,
  SimulationDragPreview,
} from '@/components/simulator/board-card-tile';
import {
  BattlefieldLane,
  IjinWithEquipment,
  ZoneHeading,
  ZonePanel,
} from '@/components/simulator/board-zones';
import {
  getMoveDestinations,
  zoneNames,
} from '@/components/simulator/board-utils';
import { useBoardSimulator } from '@/hooks/use-board-simulator';
import type {
  DeckSimulatorProps,
  SimulatorSession,
} from '@/components/simulator-types';
import {
  SimulatorModeToggle,
  type SimulationViewMode,
} from '@/components/simulator-mode-toggle';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { canEquipSimulationCard, isBattlefieldIjin } from '@/lib/simulator';
import type { SimulationRecipe } from '@/lib/simulator-recipe';

type BoardViewProps = DeckSimulatorProps & {
  mode: SimulationViewMode;
  onModeChange: (mode: SimulationViewMode) => void;
  session: SimulatorSession | null;
  message: string;
  onMessageChange: (message: string) => void;
  recipe: SimulationRecipe;
  onStart: () => void;
  onDraw: () => void;
  onMulligan: () => void;
  onUpdateSession: (
    update: (session: SimulatorSession) => SimulatorSession,
  ) => void;
};
export function BoardView(props: BoardViewProps) {
  const {
    active,
    recipeName,
    cardsById,
    onEditRecipe,
    mode,
    onModeChange,
    session,
    message,
    recipe,
    onStart,
    onDraw,
    onMulligan,
    onUpdateSession,
  } = props;
  const {
    confirmReset,
    setConfirmReset,
    setSelectedInstanceId,
    setEquipSourceId,
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
    moveTopDeckCardToGuardian,
    selectCard,
    flipCard,
    toggleGray,
    unequipCard,
    beginEquip,
    equipCard,
    openDetails,
  } = useBoardSimulator({
    cardsById,
    session,
    recipe,
    onMessageChange: props.onMessageChange,
    onStart,
    onDraw,
    onMulligan,
    onUpdateSession,
  });
  const { isOver: battlefieldIsOver, setNodeRef: setBattlefieldDropNodeRef } =
    useDroppable({
      id: 'battlefield',
      disabled: !dragDestinations.includes('battlefield'),
    });
  const battlefieldBackgrounds = session
    ? session.board.zones.battlefield.filter(
        (card) => !card.equippedTo && card.cardType === 'ハイケイ',
      )
    : [];
  const battlefieldOthers = session
    ? session.board.zones.battlefield.filter(
        (card) =>
          !card.equippedTo &&
          card.cardType !== 'ハイケイ' &&
          !isBattlefieldIjin(card),
      )
    : [];

  return (
    <section
      hidden={!active}
      role="tabpanel"
      aria-label="シミュレーション"
      className="mx-auto max-w-5xl space-y-4"
    >
      <div className="rounded-2xl border border-[var(--line)] bg-white/85 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="label">BOARD SOLO MODE</p>
            <h1 className="mt-1 font-display text-2xl tracking-wide">
              シミュレーション
            </h1>
          </div>
          <SimulatorModeToggle mode={mode} onChange={onModeChange} />
        </div>
        {!session && (
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            レシピのメインデッキを、手札・戦場・マリョク・墓地・ガーディアンで動かせます。サイドデッキは使いません。
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={Boolean(recipe.error)}
            onClick={() => (session ? setConfirmReset(true) : start())}
            className="h-11 bg-[var(--green)] px-4 text-sm text-white hover:bg-[var(--green)]/85"
          >
            {session ? 'やり直す' : 'このレシピで開始'}
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
            レシピが変更されています。今のシミュレーションは開始時の内容を使っています。「やり直す」で最新のレシピを読み込みます。
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
            手札6枚・ガーディアン4枚で開始します。操作を始める前に、手札を1回だけ引き直せます。
          </p>
        )}
      </div>

      {session && (
        <>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--soft)] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={draw}
                disabled={session.board.zones.deck.length === 0}
                className="h-11 px-4 text-sm"
              >
                1枚引く
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={moveTopDeckCardToGuardian}
                disabled={session.board.zones.deck.length === 0}
                className="h-11 border-[var(--line)] bg-white px-3 text-sm"
              >
                山札の上からガーディアンへ
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={mulligan}
                disabled={!session.canMulligan}
                className="h-11 border-[var(--line)] bg-white px-3 text-sm"
              >
                手札を引き直す（1回）
              </Button>
              <p className="ml-auto py-1 text-sm tabular-nums">
                山札 <strong>{session.board.zones.deck.length}</strong>枚
              </p>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              引き直しは、ドローや盤面操作をする前に1回だけです。盤面・グレーアウト・装備状態も初期化されます。
            </p>
            <output
              aria-live="polite"
              className="mt-2 block min-h-6 text-sm leading-6 text-[var(--green)]"
            >
              {message}
            </output>
            {session.board.zones.deck.length === 0 && (
              <p className="mt-1 text-sm text-[var(--muted)]">
                山札は0枚です。もうカードを引けません。
              </p>
            )}
          </div>

          <ZonePanel
            zone="hand"
            dragDestinations={dragDestinations}
            title="手札"
            count={session.board.zones.hand.length}
            meta={'初手6枚 ＋ ドロー' + String(session.drawn) + '枚'}
            emptyMessage="手札はありません。"
            collapsed={collapsedZones.hand}
            onToggle={() => toggleZone('hand')}
          >
            {session.board.zones.hand.map((instance) => {
              const card = cardsById.get(instance.cardId);
              return card ? (
                <BoardCardTile
                  key={instance.instanceId}
                  instance={instance}
                  card={card}
                  onTap={() => selectCard(instance)}
                />
              ) : null;
            })}
          </ZonePanel>

          <section
            ref={setBattlefieldDropNodeRef}
            className={
              'rounded-2xl border bg-white/75 p-3 sm:p-4 ' +
              (battlefieldIsOver
                ? 'border-[var(--green)] ring-2 ring-[var(--green)]/30'
                : dragDestinations.includes('battlefield')
                  ? 'border-[var(--green)]/60'
                  : 'border-[var(--line)]')
            }
            aria-label="戦場"
          >
            <ZoneHeading
              title="戦場"
              count={session.board.zones.battlefield.length}
              collapsed={collapsedZones.battlefield}
              onToggle={() => toggleZone('battlefield')}
            />
            {!collapsedZones.battlefield && (
              <>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4">
                  <BattlefieldLane
                    title="ハイケイ"
                    emptyMessage="戦場のハイケイはありません。"
                  >
                    {battlefieldBackgrounds.map((instance) => {
                      const card = cardsById.get(instance.cardId);
                      return card ? (
                        <BoardCardTile
                          key={instance.instanceId}
                          instance={instance}
                          card={card}
                          onTap={() => selectCard(instance)}
                        />
                      ) : null;
                    })}
                  </BattlefieldLane>
                  <BattlefieldLane
                    title="イジン"
                    emptyMessage="戦場のイジンはありません。"
                  >
                    {battlefieldIjins.map((instance) => {
                      const card = cardsById.get(instance.cardId);
                      if (!card) return null;
                      const equipment = session.board.zones.battlefield.filter(
                        (candidate) =>
                          candidate.equippedTo === instance.instanceId,
                      );
                      return (
                        <IjinWithEquipment
                          key={instance.instanceId}
                          instance={instance}
                          card={card}
                          equipment={equipment}
                          cardsById={cardsById}
                          onTap={selectCard}
                        />
                      );
                    })}
                  </BattlefieldLane>
                </div>
                {battlefieldOthers.length > 0 && (
                  <div className="mt-4 border-t border-[var(--line)] pt-3">
                    <p className="text-sm font-medium">その他</p>
                    <ul className="mt-2 flex flex-wrap items-start gap-2">
                      {battlefieldOthers.map((instance) => {
                        const card = cardsById.get(instance.cardId);
                        return card ? (
                          <BoardCardTile
                            key={instance.instanceId}
                            instance={instance}
                            card={card}
                            onTap={() => selectCard(instance)}
                          />
                        ) : null;
                      })}
                    </ul>
                  </div>
                )}
              </>
            )}
          </section>

          <ZonePanel
            zone="mana"
            dragDestinations={dragDestinations}
            title="マリョク"
            count={session.board.zones.mana.length}
            emptyMessage="マリョクは空です。"
            collapsed={collapsedZones.mana}
            onToggle={() => toggleZone('mana')}
          >
            {session.board.zones.mana.map((instance) => {
              const card = cardsById.get(instance.cardId);
              return card ? (
                <BoardCardTile
                  key={instance.instanceId}
                  instance={instance}
                  card={card}
                  onTap={() => selectCard(instance)}
                />
              ) : null;
            })}
          </ZonePanel>

          <ZonePanel
            zone="graveyard"
            dragDestinations={dragDestinations}
            title="墓地"
            count={session.board.zones.graveyard.length}
            emptyMessage="墓地は空です。"
            collapsed={collapsedZones.graveyard}
            onToggle={() => toggleZone('graveyard')}
          >
            {session.board.zones.graveyard.map((instance) => {
              const card = cardsById.get(instance.cardId);
              return card ? (
                <BoardCardTile
                  key={instance.instanceId}
                  instance={instance}
                  card={card}
                  onTap={() => selectCard(instance)}
                />
              ) : null;
            })}
          </ZonePanel>

          <ZonePanel
            zone="guardians"
            dragDestinations={dragDestinations}
            title="ガーディアン"
            count={session.board.zones.guardians.length}
            emptyMessage="ガーディアンはいません。"
            className="max-w-md"
            collapsed={collapsedZones.guardians}
            onToggle={() => toggleZone('guardians')}
          >
            {session.board.zones.guardians.map((instance, index) => {
              const card = cardsById.get(instance.cardId);
              return card ? (
                <BoardCardTile
                  key={instance.instanceId}
                  instance={instance}
                  card={card}
                  index={index}
                  onTap={() => selectCard(instance)}
                />
              ) : null;
            })}
          </ZonePanel>
        </>
      )}

      <p className="px-1 text-xs leading-6 text-[var(--muted)]">
        カードをドラッグして移動できます。スマホは長押しして移動、タップでも操作メニューを開けます。対戦相手・コスト・カード固有の細かな条件は自動処理しません。レシピやマイデッキの内容は変わりません。
      </p>

      <AlertDialog open={active && confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent className="max-h-[85dvh] overflow-y-auto bg-[var(--paper)]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              シミュレーションをやり直しますか？
            </AlertDialogTitle>
            <AlertDialogDescription>
              手札・戦場・マリョク・墓地・グレーアウト・装備状態をリセットし、最新のレシピをシャッフルして開始します。保存済みマイデッキには影響しません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={start}
              disabled={Boolean(recipe.error)}
              className="h-11"
            >
              やり直す
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={active && Boolean(selectedInstance && selectedCard)}
        onOpenChange={(open) => {
          if (!open) setSelectedInstanceId(null);
        }}
      >
        <DialogContent className="max-h-[88dvh] overflow-y-auto bg-[var(--paper)] sm:max-w-md">
          {selectedInstance && selectedCard && (
            <>
              <DialogHeader className="pr-8">
                <DialogTitle className="font-display text-xl leading-7">
                  {selectedInstance.faceDown
                    ? '裏向きのガーディアン'
                    : selectedCard.name}
                </DialogTitle>
                <DialogDescription>
                  {zoneNames[selectedInstance.zone]}
                  {!selectedInstance.faceDown &&
                    (selectedInstance.isGrayedOut
                      ? ' · グレーアウト中'
                      : ' · 通常表示')}
                  {selectedInstance.equippedTo
                    ? equippedIjinCard
                      ? ' · 装備先：' + equippedIjinCard.name
                      : ' · 装備中'
                    : ''}
                </DialogDescription>
              </DialogHeader>

              {selectedInstance.faceDown ? (
                <Button
                  type="button"
                  className="h-11 w-full"
                  onClick={() => flipCard(selectedInstance)}
                >
                  表向きにする
                </Button>
              ) : (
                <div className="grid gap-2">
                  {selectedInstance.equippedTo ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 border-[var(--line)] bg-white"
                        onClick={() => unequipCard(selectedInstance)}
                      >
                        装備を解除
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 border-[var(--line)] bg-white"
                        onClick={() => moveCard(selectedInstance, 'graveyard')}
                      >
                        墓地へ
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 border-[var(--line)] bg-white"
                        onClick={() => moveCard(selectedInstance, 'guardians')}
                      >
                        ガーディアンへ
                      </Button>
                    </>
                  ) : (
                    <>
                      {getMoveDestinations(selectedInstance, selectedCard).map(
                        (destination) => (
                          <Button
                            key={destination.zone}
                            type="button"
                            variant="outline"
                            className="h-11 border-[var(--line)] bg-white"
                            onClick={() =>
                              moveCard(selectedInstance, destination.zone)
                            }
                          >
                            {destination.label}
                          </Button>
                        ),
                      )}
                      {canEquipSimulationCard(selectedInstance) && (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={battlefieldIjins.length === 0}
                          className="h-11 border-[var(--line)] bg-white"
                          onClick={() => beginEquip(selectedInstance)}
                        >
                          {battlefieldIjins.length === 0
                            ? '戦場にイジンがいません'
                            : 'イジンに装備'}
                        </Button>
                      )}
                    </>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 border-[var(--line)] bg-white"
                    onClick={() => toggleGray(selectedInstance)}
                  >
                    {selectedInstance.isGrayedOut
                      ? '通常表示に戻す'
                      : 'グレーアウト'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 text-[var(--red)]"
                    onClick={() => openDetails(selectedInstance)}
                  >
                    カード詳細
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={active && Boolean(equipSource && equipSourceCard)}
        onOpenChange={(open) => {
          if (!open) setEquipSourceId(null);
        }}
      >
        <DialogContent className="max-h-[88dvh] overflow-y-auto bg-[var(--paper)] sm:max-w-md">
          {equipSource && equipSourceCard && (
            <>
              <DialogHeader className="pr-8">
                <DialogTitle className="font-display text-xl">
                  装備するイジンを選択してください
                </DialogTitle>
                <DialogDescription>
                  {equipSourceCard.name}
                  を装備します。戦場に存在するイジンだけを選べます。
                </DialogDescription>
              </DialogHeader>
              {battlefieldIjins.length === 0 ? (
                <p className="rounded-lg bg-[var(--soft)] p-3 text-sm text-[var(--muted)]">
                  装備先にできるイジンが戦場にいません。
                </p>
              ) : (
                <div className="grid gap-2">
                  {battlefieldIjins.map((ijinInstance) => {
                    const ijin = cardsById.get(ijinInstance.cardId);
                    return ijin ? (
                      <Button
                        key={ijinInstance.instanceId}
                        type="button"
                        variant="outline"
                        className="h-auto min-h-11 justify-start whitespace-normal border-[var(--line)] bg-white py-2 text-left"
                        onClick={() => equipCard(ijinInstance)}
                      >
                        {ijin.name}
                      </Button>
                    ) : null;
                  })}
                </div>
              )}
              <Button
                type="button"
                variant="ghost"
                className="h-11"
                onClick={() => setEquipSourceId(null)}
              >
                キャンセル
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={active && Boolean(detailCard)}
        onOpenChange={(open) => {
          if (!open) setDetailCardId(null);
        }}
      >
        <DialogContent className="max-h-[88dvh] overflow-y-auto bg-[var(--paper)] sm:max-w-2xl">
          {detailCard && (
            <>
              <DialogHeader className="pr-8">
                <DialogTitle className="font-display text-xl leading-7">
                  {detailCard.name}
                </DialogTitle>
                <DialogDescription>
                  {detailCard.id} · {detailCard.cardType} · {detailCard.rarity}{' '}
                  · {detailCard.color} · Lv.{detailCard.level ?? '−'}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4 sm:flex-row">
                <img
                  src={detailCard.imageUrl}
                  alt={detailCard.name + 'のカード画像'}
                  className="mx-auto w-40 shrink-0 self-start rounded-md object-contain sm:w-48"
                />
                <div className="min-w-0 text-sm leading-6">
                  {detailCard.power !== null && (
                    <p>パワー {detailCard.power.toLocaleString()}</p>
                  )}
                  {detailCard.trait && (
                    <p className="mt-2">{detailCard.trait}</p>
                  )}
                  <p className="mt-2 whitespace-pre-line">
                    {detailCard.description || '効果テキストなし'}
                  </p>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <DragOverlay dropAnimation={null}>
        {activeDragInstance && activeDragCard ? (
          <SimulationDragPreview
            instance={activeDragInstance}
            card={activeDragCard}
          />
        ) : null}
      </DragOverlay>
    </section>
  );
}
