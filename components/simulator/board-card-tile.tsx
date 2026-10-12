'use client';

/* oxlint-disable next/no-img-element -- GitHub Pages renders official card URLs without a Next.js image server. */

import { useDraggable } from '@dnd-kit/core';
import type { IjindenCard } from '@/app/ijinden-cards';
import type { SimulationCard } from '@/lib/simulator';
import { getSimulationMoveDestinations } from '@/lib/simulator-movement';

type BoardCardTileProps = {
  instance: SimulationCard;
  card: IjindenCard;
  index?: number;
  listItem?: boolean;
  onTap: () => void;
};

export function BoardCardTile({
  instance,
  card,
  index,
  listItem = true,
  onTap,
}: BoardCardTileProps) {
  const destinations = getSimulationMoveDestinations(instance, {
    allowFaceDownGuardians: true,
  });
  const { attributes, isDragging, listeners, setNodeRef } = useDraggable({
    id: instance.instanceId,
    disabled: destinations.length === 0,
  });
  const name = instance.faceDown
    ? '裏向きのガーディアン' + (index === undefined ? '' : String(index + 1))
    : card.name;
  const cardTile = (
    <div className="w-[80px] min-w-0 shrink-0 select-none">
      <button
        ref={setNodeRef}
        type="button"
        draggable={false}
        {...attributes}
        {...listeners}
        onClick={onTap}
        onContextMenu={(event) => event.preventDefault()}
        aria-label={
          name +
          (instance.faceDown
            ? 'を表向きにする'
            : instance.isGrayedOut
              ? '、グレーアウト中。操作メニューを開く'
              : 'の操作メニューを開く')
        }
        className={
          'relative block h-[112px] w-[80px] touch-manipulation overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--red)] ' +
          (isDragging ? 'opacity-30 ' : '') +
          (instance.isGrayedOut ? 'grayscale opacity-60' : '')
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
            draggable={false}
            className="h-full w-full object-cover object-top"
          />
        )}
        {instance.isGrayedOut && !instance.faceDown && (
          <span className="absolute inset-x-1 bottom-1 rounded bg-slate-800/85 px-1 py-0.5 text-[10px] leading-4 text-white">
            グレーアウト
          </span>
        )}
      </button>
      <p className="mt-1 line-clamp-2 min-h-10 break-words text-sm leading-5">
        {name}
      </p>
    </div>
  );

  return listItem ? <li>{cardTile}</li> : cardTile;
}

export function SimulationDragPreview({
  instance,
  card,
}: {
  instance: SimulationCard;
  card: IjindenCard;
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none h-[112px] w-[80px] overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)] shadow-xl"
    >
      {instance.faceDown ? (
        <span className="grid h-full place-content-center gap-1 bg-[var(--ink)] px-1 text-xs leading-5 text-[var(--paper)]">
          <span className="text-center text-xl">◆</span>
          <span>裏向き</span>
        </span>
      ) : (
        <img
          src={card.imageUrl}
          alt=""
          draggable={false}
          className="h-full w-full object-cover object-top"
        />
      )}
    </div>
  );
}
