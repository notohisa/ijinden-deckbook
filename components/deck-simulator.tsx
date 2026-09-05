'use client';

/* oxlint-disable next/no-img-element -- GitHub Pages renders official card URLs with standard images, without a Next.js image server. */

import { useMemo, useState } from 'react';
import type { IjindenCard } from '@/app/ijinden-cards';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  createSimulation,
  drawSimulationCards,
  flipSimulationCard,
  mulliganSimulation,
  type SimulationCard,
  type SimulationState,
} from '@/lib/simulator';

const HAND_SIZE = 6;
const GUARDIAN_SIZE = 4;
// Bound expansion of imported counts; a regular 40-card recipe is well below this limit.
const MAX_SIMULATION_CARDS = 1000;
const marks = [
  { name: 'なし', color: 'transparent' },
  { name: '赤', color: '#c94b42' },
  { name: '青', color: '#347dc3' },
  { name: '黄', color: '#d1a51b' },
  { name: '白', color: '#ffffff' },
  { name: '黒', color: '#202b35' },
];

type Session = {
  board: SimulationState;
  recipeSignature: string;
  recipeName: string;
  canMulligan: boolean;
  drawn: number;
  marks: Record<string, number>;
};

type Props = {
  active: boolean;
  recipeName: string;
  main: Record<string, number>;
  cardsById: ReadonlyMap<string, IjindenCard>;
  onEditRecipe: () => void;
};

export function DeckSimulator({
  active,
  recipeName,
  main,
  cardsById,
  onEditRecipe,
}: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [message, setMessage] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  const recipe = useMemo(() => {
    const entries = Object.entries(main).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    const signature = JSON.stringify(entries);
    if (
      entries.some(
        ([id, count]) =>
          !cardsById.has(id) || !Number.isSafeInteger(count) || count < 1,
      )
    ) {
      return {
        signature,
        cardIds: [],
        error: 'レシピのカード情報を確認してください。',
      };
    }
    const total = entries.reduce((sum, [, count]) => sum + count, 0);
    if (total < HAND_SIZE + GUARDIAN_SIZE) {
      return {
        signature,
        cardIds: [],
        error: '開始するには、メインデッキに10枚以上入れてください。',
      };
    }
    if (total > MAX_SIMULATION_CARDS) {
      return {
        signature,
        cardIds: [],
        error: 'シミュレーションで扱えるメインデッキは1000枚までです。',
      };
    }
    return {
      signature,
      cardIds: entries.flatMap(([id, count]) => Array<string>(count).fill(id)),
      error: '',
    };
  }, [main, cardsById]);
  const detailCard = detailCardId ? cardsById.get(detailCardId) : undefined;
  const recipeChanged = Boolean(
    session && session.recipeSignature !== recipe.signature,
  );

  function start() {
    if (recipe.error) return;
    setSession({
      board: createSimulation(recipe.cardIds, HAND_SIZE, GUARDIAN_SIZE),
      recipeSignature: recipe.signature,
      recipeName: recipeName.trim() || '名前のないデッキ',
      canMulligan: true,
      drawn: 0,
      marks: {},
    });
    setConfirmReset(false);
    setDetailCardId(null);
    setMessage('シャッフルして手札6枚・ガーディアン4枚を配りました。');
  }

  function draw() {
    if (!session || session.board.zones.deck.length === 0) return;
    setSession((current) =>
      current && current.board.zones.deck.length > 0
        ? {
            ...current,
            board: drawSimulationCards(current.board),
            canMulligan: false,
            drawn: current.drawn + 1,
          }
        : current,
    );
    setMessage(
      '1枚引きました。山札は残り' +
        String(session.board.zones.deck.length - 1) +
        '枚です。',
    );
  }

  function mulligan() {
    if (!session?.canMulligan) return;
    setSession((current) =>
      current?.canMulligan
        ? {
            ...current,
            board: mulliganSimulation(current.board, HAND_SIZE),
            canMulligan: false,
          }
        : current,
    );
    setMessage('手札を引き直しました。ガーディアン4枚はそのままです。');
  }

  function tapCard(instance: SimulationCard) {
    setSession((current) => {
      if (!current) return current;
      if (instance.faceDown)
        return {
          ...current,
          board: flipSimulationCard(current.board, instance.instanceId),
          canMulligan: false,
        };
      return {
        ...current,
        canMulligan: false,
        marks: {
          ...current.marks,
          [instance.instanceId]:
            ((current.marks[instance.instanceId] ?? 0) + 1) % marks.length,
        },
      };
    });
    const nextMark =
      marks[((session?.marks[instance.instanceId] ?? 0) + 1) % marks.length];
    setMessage(
      instance.faceDown
        ? 'ガーディアンを表向きにしました。'
        : cardsById.get(instance.cardId)?.name + 'の色マーク：' + nextMark.name,
    );
  }

  return (
    <section
      hidden={!active}
      role="tabpanel"
      aria-label="シミュレーション"
      className="mx-auto max-w-5xl space-y-4"
    >
      <div className="rounded-2xl border border-[var(--line)] bg-white/85 p-4 sm:p-5">
        <p className="label">ONE-PLAYER SIMULATOR</p>
        <h1 className="mt-1 font-display text-2xl tracking-wide">
          シミュレーション
        </h1>
        {!session && (
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            レシピのメインデッキで、初手とドローを試せます。サイドデッキは使いません。
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
              引き直しは、ドローやカードのタップをする前に1回だけ。ガーディアンは変わりません。
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

          <section
            className="rounded-2xl border border-[var(--line)] bg-white/75 p-3 sm:p-4"
            aria-label="シミュレーションの手札"
          >
            <div className="flex flex-wrap items-center justify-between gap-1">
              <h2 className="font-display text-lg">
                手札{' '}
                <span className="ml-1 font-sans text-sm text-[var(--muted)]">
                  {session.board.zones.hand.length}枚
                </span>
              </h2>
              <span className="text-xs text-[var(--muted)]">
                初手6枚 ＋ ドロー{session.drawn}枚
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              カードをタップすると色マークが切り替わります。使用済みなどの目印に使えます。
            </p>
            <ul className="mt-3 grid grid-cols-3 gap-2 min-[420px]:grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
              {session.board.zones.hand.map((instance, index) => (
                <SimulationCardTile
                  key={instance.instanceId}
                  instance={instance}
                  card={cardsById.get(instance.cardId)!}
                  index={index}
                  markIndex={session.marks[instance.instanceId] ?? 0}
                  onTap={() => tapCard(instance)}
                  onDetails={() => setDetailCardId(instance.cardId)}
                />
              ))}
            </ul>
          </section>

          <section
            className="rounded-2xl border border-[var(--line)] bg-white/75 p-3 sm:p-4"
            aria-label="ガーディアン"
          >
            <h2 className="font-display text-lg">
              ガーディアン{' '}
              <span className="ml-1 font-sans text-sm text-[var(--muted)]">
                {session.board.zones.guardians.length}枚
              </span>
            </h2>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              裏向きのカードをタップすると表を確認できます。
            </p>
            <ul className="mt-3 grid max-w-md grid-cols-4 gap-2">
              {session.board.zones.guardians.map((instance, index) => (
                <SimulationCardTile
                  key={instance.instanceId}
                  instance={instance}
                  card={cardsById.get(instance.cardId)!}
                  index={index}
                  markIndex={session.marks[instance.instanceId] ?? 0}
                  onTap={() => tapCard(instance)}
                  onDetails={() => setDetailCardId(instance.cardId)}
                />
              ))}
            </ul>
          </section>
        </>
      )}

      <p className="px-1 text-xs leading-6 text-[var(--muted)]">
        一人回しの確認用です。対戦相手・カード効果・勝敗の自動処理はありません。レシピやマイデッキの内容は変わりません。タブを切り替えても続けられますが、ページを再読み込みするとシミュレーションは終了します。
      </p>

      <AlertDialog open={active && confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent className="max-h-[85dvh] overflow-y-auto bg-[var(--paper)]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              シミュレーションをやり直しますか？
            </AlertDialogTitle>
            <AlertDialogDescription>
              今の手札と色マークをリセットし、最新のレシピをシャッフルして開始します。保存済みマイデッキには影響しません。
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

function SimulationCardTile({
  instance,
  card,
  index,
  markIndex,
  onTap,
  onDetails,
}: {
  instance: SimulationCard;
  card: IjindenCard;
  index: number;
  markIndex: number;
  onTap: () => void;
  onDetails: () => void;
}) {
  const mark = marks[markIndex];
  const name = instance.faceDown
    ? 'ガーディアン' + String(index + 1)
    : card.name;
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onTap}
        aria-label={
          name +
          (instance.faceDown
            ? 'を表向きにする'
            : '、マーク：' + mark.name + '。タップして色を変更')
        }
        className="relative block aspect-[5/7] w-full touch-manipulation overflow-hidden rounded-md border border-[var(--line)] bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--red)]"
      >
        {instance.faceDown ? (
          <span className="absolute inset-0 grid place-content-center gap-1 bg-[var(--ink)] px-1 text-xs leading-5 text-[var(--paper)]">
            <span aria-hidden="true" className="text-xl">
              ◆
            </span>
            <span>裏向き</span>
            <span>{index + 1}</span>
          </span>
        ) : (
          <img
            src={card.imageUrl}
            alt={card.name}
            loading="lazy"
            className="h-full w-full object-cover object-top"
          />
        )}
        {markIndex > 0 && (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-md border-4"
              style={{ borderColor: mark.color }}
            />
            <span
              className="absolute right-1 bottom-1 rounded border border-black/20 px-1 text-xs leading-5"
              style={{
                backgroundColor: mark.color,
                color:
                  markIndex === 3 || markIndex === 4 ? '#202b35' : '#ffffff',
              }}
            >
              {mark.name}
            </span>
          </>
        )}
      </button>
      <p className="mt-1 line-clamp-2 min-h-10 break-words text-sm leading-5">
        {name}
      </p>
      <Button
        type="button"
        variant="ghost"
        disabled={instance.faceDown}
        onClick={onDetails}
        aria-label={
          instance.faceDown ? name + 'は裏向きです' : card.name + 'の詳細を見る'
        }
        className="mt-1 h-11 w-full min-w-0 px-1 text-sm text-[var(--red)]"
      >
        詳細
      </Button>
    </li>
  );
}
