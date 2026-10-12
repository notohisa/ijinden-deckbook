/* oxlint-disable next/no-img-element -- GitHub Pages renders official card URLs without a Next.js image server. */

import type { SimulationCard } from '@/lib/simulator';
import type { SimpleCardState } from '@/lib/simple-simulator';
import { Button } from '@/components/ui/button';

const stateLabels: Record<SimpleCardState, string | undefined> = {
  normal: undefined,
  mana: 'マリョク',
  manaBack: 'マリョク（裏）',
  battlefield: '戦場',
  graveyard: '墓地',
  equipped: '装備',
};

const overlayClasses: Record<SimpleCardState, string> = {
  normal: '',
  mana: 'bg-[rgb(255_0_0_/_0.45)] text-white',
  manaBack: 'bg-[rgb(255_255_255_/_0.70)] text-[var(--ink)]',
  battlefield: 'bg-[rgb(255_220_0_/_0.45)] text-[var(--ink)]',
  graveyard: 'bg-[rgb(0_0_0_/_0.60)] text-white',
  equipped: 'bg-[rgb(0_100_255_/_0.45)] text-white',
};

export function SimpleCardTile({
  instance,
  state,
  cardName,
  imageUrl,
  hiddenLabel,
  onTap,
  onMakeGuardian,
}: {
  instance: SimulationCard;
  state: SimpleCardState;
  cardName: string;
  imageUrl: string;
  hiddenLabel: string;
  onTap: () => void;
  onMakeGuardian?: () => void;
}) {
  const stateLabel = stateLabels[state];
  const name = instance.faceDown ? hiddenLabel : cardName;

  return (
    <li className="w-[80px] min-w-0 shrink-0">
      <button
        type="button"
        onClick={onTap}
        aria-label={
          !instance.faceDown
            ? cardName +
              (stateLabel ? '、' + stateLabel : '、通常') +
              'を切り替える'
            : hiddenLabel + 'を公開する'
        }
        className="relative block h-[112px] w-[80px] touch-manipulation overflow-hidden rounded-md border border-[var(--line)] bg-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--red)]"
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
            <span aria-hidden="true" className="text-xl">
              ◆
            </span>
            <span>グレー</span>
          </span>
        )}
        {!instance.faceDown && stateLabel && (
          <span
            className={
              'absolute inset-0 grid place-content-center px-1 text-center text-sm font-bold drop-shadow ' +
              overlayClasses[state]
            }
          >
            {stateLabel}
          </span>
        )}
      </button>
      <p className="mt-1 line-clamp-2 min-h-10 break-words text-sm leading-5">
        {name}
      </p>
      {onMakeGuardian && (
        <Button
          type="button"
          variant="outline"
          onClick={onMakeGuardian}
          aria-label={
            instance.faceDown
              ? hiddenLabel + 'を裏向きのガーディアンにする'
              : cardName + 'を裏向きのガーディアンにする'
          }
          className="mt-1 h-8 w-full border-[var(--line)] bg-[var(--surface)] px-1 text-xs!"
        >
          ガーディアンへ
        </Button>
      )}
    </li>
  );
}
