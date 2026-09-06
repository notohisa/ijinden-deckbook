'use client';

/* oxlint-disable next/no-img-element -- GitHub Pages renders official card URLs with standard images, without a Next.js image server. */

import { useEffect, useMemo, useState } from 'react';
import type { IjindenCard } from '@/app/ijinden-cards';
import { SimpleSimulator } from '@/components/simple-simulator';
import {
  SimulatorModeToggle,
  type SimulationViewMode,
} from '@/components/simulator-mode-toggle';
import type {
  DeckSimulatorProps,
  SimulatorSession,
} from '@/components/simulator-types';
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
import {
  canEquipSimulationCard,
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
  type SimulationCard,
  type SimulationZone,
} from '@/lib/simulator';
import {
  buildSimulationRecipe,
  SIMULATION_GUARDIAN_SIZE,
  SIMULATION_HAND_SIZE,
  type SimulationRecipe,
} from '@/lib/simulator-recipe';

const MODE_STORAGE_KEY = 'ijinden-deckbook:simulator-view-mode';
const BOARD_COLLAPSE_STORAGE_KEY =
  'ijinden-deckbook:simulator-board-collapsed-zones';

const zoneNames: Record<SimulationZone, string> = {
  deck: '山札',
  hand: '手札',
  battlefield: '戦場',
  mana: 'マリョク',
  graveyard: '墓地',
  guardians: 'ガーディアン',
};

type BoardZone = Exclude<SimulationZone, 'deck'>;

type BoardCollapseState = Record<BoardZone, boolean>;

type BoardSimulatorProps = DeckSimulatorProps & {
  mode: SimulationViewMode;
  onModeChange: (mode: SimulationViewMode) => void;
  session: SimulatorSession | null;
  recipe: SimulationRecipe;
  onStart: () => void;
  onDraw: () => void;
  onMulligan: () => void;
  onUpdateSession: (
    update: (session: SimulatorSession) => SimulatorSession,
  ) => void;
};

type MoveDestination = {
  zone: SimulationZone;
  label: string;
};

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

function getInitialBoardCollapseState(): BoardCollapseState {
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

function isManaOrMagic(card: IjindenCard): boolean {
  return card.cardType === 'マリョク' || card.cardType === 'マホウ';
}

function getMoveDestinations(
  instance: SimulationCard,
  card: IjindenCard,
): MoveDestination[] {
  if (instance.equippedTo || instance.faceDown) return [];

  switch (instance.zone) {
    case 'hand':
      return isManaOrMagic(card)
        ? [
            { zone: 'mana', label: 'マリョクへ' },
            { zone: 'graveyard', label: '墓地へ' },
          ]
        : [
            { zone: 'battlefield', label: '戦場へ' },
            { zone: 'mana', label: 'マリョクへ' },
            { zone: 'graveyard', label: '墓地へ' },
          ];
    case 'battlefield':
      return [
        { zone: 'hand', label: '手札へ' },
        { zone: 'mana', label: 'マリョクへ' },
        { zone: 'graveyard', label: '墓地へ' },
      ];
    case 'mana':
      return isManaOrMagic(card)
        ? [
            { zone: 'hand', label: '手札へ' },
            { zone: 'graveyard', label: '墓地へ' },
          ]
        : [
            { zone: 'battlefield', label: '戦場へ' },
            { zone: 'hand', label: '手札へ' },
            { zone: 'graveyard', label: '墓地へ' },
          ];
    case 'graveyard':
      return isManaOrMagic(card)
        ? [
            { zone: 'hand', label: '手札へ' },
            { zone: 'mana', label: 'マリョクへ' },
          ]
        : [
            { zone: 'battlefield', label: '戦場へ' },
            { zone: 'hand', label: '手札へ' },
            { zone: 'mana', label: 'マリョクへ' },
          ];
    case 'guardians':
      return [
        { zone: 'hand', label: '手札へ' },
        { zone: 'mana', label: 'マリョクへ' },
        { zone: 'graveyard', label: '墓地へ' },
      ];
    case 'deck':
      return [];
  }
}

export function DeckSimulator(props: DeckSimulatorProps) {
  const [mode, setMode] = useState<SimulationViewMode>(getInitialViewMode);
  const [session, setSession] = useState<SimulatorSession | null>(null);
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
    setSession({
      board: createSimulation(
        recipe.cardInputs,
        SIMULATION_HAND_SIZE,
        SIMULATION_GUARDIAN_SIZE,
      ),
      recipeSignature: recipe.signature,
      recipeName: props.recipeName.trim() || '名前のないデッキ',
      canMulligan: true,
      drawn: 0,
      simpleStates: {},
    });
  }

  function updateSession(
    update: (current: SimulatorSession) => SimulatorSession,
  ) {
    setSession((current) => (current ? update(current) : current));
  }

  function draw() {
    updateSession((current) =>
      current.board.zones.deck.length > 0
        ? {
            ...current,
            board: drawSimulationCards(current.board),
            canMulligan: false,
            drawn: current.drawn + 1,
          }
        : current,
    );
  }

  function mulligan() {
    updateSession((current) =>
      current.canMulligan
        ? {
            ...current,
            board: mulliganSimulation(current.board, SIMULATION_HAND_SIZE),
            canMulligan: false,
            drawn: 0,
            simpleStates: {},
          }
        : current,
    );
  }

  return (
    <>
      <BoardSimulator
        {...props}
        active={props.active && mode === 'board'}
        mode={mode}
        onModeChange={setMode}
        session={session}
        recipe={recipe}
        onStart={start}
        onDraw={draw}
        onMulligan={mulligan}
        onUpdateSession={updateSession}
      />
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
}

function BoardSimulator({
  active,
  recipeName,
  cardsById,
  onEditRecipe,
  mode,
  onModeChange,
  session,
  recipe,
  onStart,
  onDraw,
  onMulligan,
  onUpdateSession,
}: BoardSimulatorProps) {
  const [message, setMessage] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(
    null,
  );
  const [equipSourceId, setEquipSourceId] = useState<string | null>(null);
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  const [collapsedZones, setCollapsedZones] = useState<BoardCollapseState>(
    getInitialBoardCollapseState,
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(
        BOARD_COLLAPSE_STORAGE_KEY,
        JSON.stringify(collapsedZones),
      );
    } catch {
      // Zone visibility is a convenience preference only.
    }
  }, [collapsedZones]);

  function toggleZone(zone: BoardZone) {
    setCollapsedZones((current) => ({
      ...current,
      [zone]: !current[zone],
    }));
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
    setMessage('シャッフルして手札6枚・ガーディアン4枚を配りました。');
  }

  function draw() {
    if (!session || session.board.zones.deck.length === 0) return;
    const remaining = session.board.zones.deck.length - 1;
    onDraw();
    setMessage('1枚引きました。山札は残り' + String(remaining) + '枚です。');
  }

  function mulligan() {
    if (!session?.canMulligan) return;
    onMulligan();
    setSelectedInstanceId(null);
    setEquipSourceId(null);
    setMessage('初期状態へ戻して、手札を引き直しました。');
  }

  function moveCard(instance: SimulationCard, destination: SimulationZone) {
    const card = cardsById.get(instance.cardId);
    onUpdateSession((current) => ({
      ...current,
      board: moveSimulationCard(
        current.board,
        instance.instanceId,
        destination,
      ),
      canMulligan: false,
    }));
    setSelectedInstanceId(null);
    setEquipSourceId(null);
    setMessage(
      (card?.name ?? 'カード') +
        'を' +
        zoneNames[destination] +
        'へ移動しました。',
    );
  }

  function flipCard(instance: SimulationCard) {
    onUpdateSession((current) => ({
      ...current,
      board: flipSimulationCard(current.board, instance.instanceId),
      canMulligan: false,
    }));
    setSelectedInstanceId(null);
    setMessage('ガーディアンを表向きにしました。');
  }

  function toggleGray(instance: SimulationCard) {
    const card = cardsById.get(instance.cardId);
    onUpdateSession((current) => ({
      ...current,
      board: toggleSimulationCardGrayedOut(
        current.board,
        instance.instanceId,
      ),
      canMulligan: false,
    }));
    setSelectedInstanceId(null);
    setMessage(
      (card?.name ?? 'カード') +
        (instance.isGrayedOut
          ? 'を通常表示に戻しました。'
          : 'をグレーアウトしました。'),
    );
  }

  function unequipCard(instance: SimulationCard) {
    const card = cardsById.get(instance.cardId);
    onUpdateSession((current) => ({
      ...current,
      board: unequipSimulationCard(current.board, instance.instanceId),
      canMulligan: false,
    }));
    setSelectedInstanceId(null);
    setMessage((card?.name ?? 'カード') + 'の装備を解除しました。');
  }

  function beginEquip(instance: SimulationCard) {
    setSelectedInstanceId(null);
    setEquipSourceId(instance.instanceId);
  }

  function equipCard(ijinInstance: SimulationCard) {
    if (!equipSource) return;
    const equipmentName = cardsById.get(equipSource.cardId)?.name ?? 'カード';
    const ijinName = cardsById.get(ijinInstance.cardId)?.name ?? 'イジン';
    onUpdateSession((current) => ({
      ...current,
      board: equipSimulationCard(
        current.board,
        equipSource.instanceId,
        ijinInstance.instanceId,
      ),
      canMulligan: false,
    }));
    setEquipSourceId(null);
    setMessage(equipmentName + 'を' + ijinName + 'へ装備しました。');
  }

  function openDetails(instance: SimulationCard) {
    setSelectedInstanceId(null);
    setDetailCardId(instance.cardId);
  }

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
            レシピのメインデッキを、手札・戦場・マリョク・墓地で動かせます。サイドデッキは使いません。
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
                <SimulationCardTile
                  key={instance.instanceId}
                  instance={instance}
                  card={card}
                  onTap={() => setSelectedInstanceId(instance.instanceId)}
                />
              ) : null;
            })}
          </ZonePanel>

          <section
            className="rounded-2xl border border-[var(--line)] bg-white/75 p-3 sm:p-4"
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
                        <SimulationCardTile
                          key={instance.instanceId}
                          instance={instance}
                          card={card}
                          className="w-24 sm:w-28"
                          onTap={() =>
                            setSelectedInstanceId(instance.instanceId)
                          }
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
                          onTap={(cardInstance) =>
                            setSelectedInstanceId(cardInstance.instanceId)
                          }
                        />
                      );
                    })}
                  </BattlefieldLane>
                </div>
                {battlefieldOthers.length > 0 && (
                  <div className="mt-4 border-t border-[var(--line)] pt-3">
                    <p className="text-sm font-medium">その他</p>
                    <ul className="mt-2 grid grid-cols-3 gap-2 min-[420px]:grid-cols-4 sm:grid-cols-5">
                      {battlefieldOthers.map((instance) => {
                        const card = cardsById.get(instance.cardId);
                        return card ? (
                          <SimulationCardTile
                            key={instance.instanceId}
                            instance={instance}
                            card={card}
                            onTap={() =>
                              setSelectedInstanceId(instance.instanceId)
                            }
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
            title="マリョク"
            count={session.board.zones.mana.length}
            emptyMessage="マリョクは空です。"
            collapsed={collapsedZones.mana}
            onToggle={() => toggleZone('mana')}
          >
            {session.board.zones.mana.map((instance) => {
              const card = cardsById.get(instance.cardId);
              return card ? (
                <SimulationCardTile
                  key={instance.instanceId}
                  instance={instance}
                  card={card}
                  onTap={() => setSelectedInstanceId(instance.instanceId)}
                />
              ) : null;
            })}
          </ZonePanel>

          <ZonePanel
            title="墓地"
            count={session.board.zones.graveyard.length}
            emptyMessage="墓地は空です。"
            collapsed={collapsedZones.graveyard}
            onToggle={() => toggleZone('graveyard')}
          >
            {session.board.zones.graveyard.map((instance) => {
              const card = cardsById.get(instance.cardId);
              return card ? (
                <SimulationCardTile
                  key={instance.instanceId}
                  instance={instance}
                  card={card}
                  onTap={() => setSelectedInstanceId(instance.instanceId)}
                />
              ) : null;
            })}
          </ZonePanel>

          <ZonePanel
            title="ガーディアン"
            count={session.board.zones.guardians.length}
            emptyMessage="ガーディアンはいません。"
            className="max-w-md grid-cols-4"
            collapsed={collapsedZones.guardians}
            onToggle={() => toggleZone('guardians')}
          >
            {session.board.zones.guardians.map((instance, index) => {
              const card = cardsById.get(instance.cardId);
              return card ? (
                <SimulationCardTile
                  key={instance.instanceId}
                  instance={instance}
                  card={card}
                  index={index}
                  onTap={() => setSelectedInstanceId(instance.instanceId)}
                />
              ) : null;
            })}
          </ZonePanel>
        </>
      )}

      <p className="px-1 text-xs leading-6 text-[var(--muted)]">
        カードをタップすると操作メニューを開きます。対戦相手・コスト・カード固有の細かな条件は自動処理しません。レシピやマイデッキの内容は変わりません。
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
                        onClick={() =>
                          moveCard(selectedInstance, 'graveyard')
                        }
                      >
                        墓地へ
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
                  {equipSourceCard.name}を装備します。戦場に存在するイジンだけを選べます。
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
    </section>
  );
}

function ZoneHeading({
  title,
  count,
  meta,
  collapsed,
  onToggle,
}: {
  title: string;
  count: number;
  meta?: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-1">
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={onToggle}
        className="-ml-1 flex min-h-10 items-center gap-2 rounded-md px-1 text-left font-display text-lg hover:bg-[var(--soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--red)]"
      >
        <span aria-hidden="true" className="font-sans text-xs text-[var(--muted)]">
          {collapsed ? '▶' : '▼'}
        </span>
        <span>
          {title}{' '}
          <span className="ml-1 font-sans text-sm text-[var(--muted)]">
            {count}枚
          </span>
        </span>
      </button>
      {meta && <span className="text-xs text-[var(--muted)]">{meta}</span>}
    </div>
  );
}

function ZonePanel({
  title,
  count,
  meta,
  emptyMessage,
  className = '',
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  meta?: string;
  emptyMessage: string;
  className?: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const childCount = Array.isArray(children)
    ? children.filter(Boolean).length
    : children
      ? 1
      : 0;
  return (
    <section
      className="rounded-2xl border border-[var(--line)] bg-white/75 p-3 sm:p-4"
      aria-label={title}
    >
      <ZoneHeading
        title={title}
        count={count}
        meta={meta}
        collapsed={collapsed}
        onToggle={onToggle}
      />
      {!collapsed && childCount === 0 ? (
        <p className="mt-3 rounded-lg bg-[var(--soft)] px-3 py-5 text-center text-sm text-[var(--muted)]">
          {emptyMessage}
        </p>
      ) : !collapsed ? (
        <ul
          className={
            'mt-3 grid grid-cols-3 gap-2 min-[420px]:grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 ' +
            className
          }
        >
          {children}
        </ul>
      ) : null}
    </section>
  );
}

function BattlefieldLane({
  title,
  emptyMessage,
  children,
}: {
  title: string;
  emptyMessage: string;
  children: React.ReactNode;
}) {
  const childCount = Array.isArray(children)
    ? children.filter(Boolean).length
    : children
      ? 1
      : 0;
  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--soft)] p-3">
      <h3 className="text-sm font-medium">{title}</h3>
      {childCount === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">{emptyMessage}</p>
      ) : (
        <ul className="mt-3 flex flex-wrap items-start gap-2">{children}</ul>
      )}
    </section>
  );
}

function IjinWithEquipment({
  instance,
  card,
  equipment,
  cardsById,
  onTap,
}: {
  instance: SimulationCard;
  card: IjindenCard;
  equipment: readonly SimulationCard[];
  cardsById: ReadonlyMap<string, IjindenCard>;
  onTap: (instance: SimulationCard) => void;
}) {
  return (
    <li className="w-24 min-w-0 sm:w-28">
      <SimulationCardTile
        instance={instance}
        card={card}
        listItem={false}
        onTap={() => onTap(instance)}
      />
      {equipment.length > 0 && (
        <ul className="ml-4 mt-[-0.5rem] flex flex-wrap items-start">
          {equipment.map((equipmentInstance, index) => {
            const equipmentCard = cardsById.get(equipmentInstance.cardId);
            return equipmentCard ? (
              <li
                key={equipmentInstance.instanceId}
                className={index === 0 ? '' : '-ml-6 mt-3'}
              >
                <SimulationCardTile
                  instance={equipmentInstance}
                  card={equipmentCard}
                  compact
                  listItem={false}
                  onTap={() => onTap(equipmentInstance)}
                />
              </li>
            ) : null;
          })}
        </ul>
      )}
    </li>
  );
}

function SimulationCardTile({
  instance,
  card,
  index,
  compact = false,
  className = '',
  listItem = true,
  onTap,
}: {
  instance: SimulationCard;
  card: IjindenCard;
  index?: number;
  compact?: boolean;
  className?: string;
  listItem?: boolean;
  onTap: () => void;
}) {
  const name = instance.faceDown
    ? '裏向きのガーディアン' + (index === undefined ? '' : String(index + 1))
    : card.name;
  const imageClass = instance.isGrayedOut ? 'grayscale opacity-60' : '';
  const cardTile = (
    <div className={(compact ? 'w-16' : 'min-w-0') + ' ' + className}>
      <button
        type="button"
        onClick={onTap}
        aria-label={
          name +
          (instance.faceDown
            ? 'を表向きにする'
            : instance.isGrayedOut
              ? '、グレーアウト中。操作メニューを開く'
              : 'の操作メニューを開く')
        }
        className={
          'relative block aspect-[5/7] w-full touch-manipulation overflow-hidden rounded-md border border-[var(--line)] bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--red)] ' +
          imageClass
        }
      >
        {instance.faceDown ? (
          <span className="absolute inset-0 grid place-content-center gap-1 bg-[var(--ink)] px-1 text-xs leading-5 text-[var(--paper)]">
            <span aria-hidden="true" className="text-xl">
              ◆
            </span>
            <span>裏向き</span>
            {index !== undefined && <span>{index + 1}</span>}
          </span>
        ) : (
          <img
            src={card.imageUrl}
            alt={card.name}
            loading="lazy"
            className="h-full w-full object-cover object-top"
          />
        )}
        {instance.isGrayedOut && !instance.faceDown && (
          <span className="absolute inset-x-1 bottom-1 rounded bg-slate-800/85 px-1 py-0.5 text-[10px] leading-4 text-white">
            グレーアウト
          </span>
        )}
      </button>
      {!compact && (
        <p className="mt-1 line-clamp-2 min-h-10 break-words text-sm leading-5">
          {name}
        </p>
      )}
    </div>
  );

  return listItem ? <li>{cardTile}</li> : cardTile;
}
