'use client';

import type { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { IjindenCard } from '@/app/ijinden-cards';
import type { SimulationCard, SimulationZone } from '@/lib/simulator';
import { BoardCardTile } from '@/components/simulator/board-card-tile';
import type { BoardZone } from '@/components/simulator/board-utils';

export function ZoneHeading({
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
        <span
          aria-hidden="true"
          className="font-sans text-xs text-[var(--muted)]"
        >
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

export function ZonePanel({
  zone,
  dragDestinations,
  title,
  count,
  meta,
  emptyMessage,
  className = '',
  collapsed,
  onToggle,
  children,
}: {
  zone: BoardZone;
  dragDestinations: SimulationZone[];
  title: string;
  count: number;
  meta?: string;
  emptyMessage: string;
  className?: string;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const canDrop = dragDestinations.includes(zone);
  const { isOver, setNodeRef } = useDroppable({
    id: zone,
    disabled: !canDrop,
  });
  const childCount = Array.isArray(children)
    ? children.filter(Boolean).length
    : children
      ? 1
      : 0;
  return (
    <section
      ref={setNodeRef}
      className={
        'rounded-2xl border bg-[var(--surface)]/75 p-3 sm:p-4 ' +
        (isOver
          ? 'border-[var(--green)] ring-2 ring-[var(--green)]/30'
          : canDrop
            ? 'border-[var(--green)]/60'
            : 'border-[var(--line)]')
      }
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
        <ul className={'mt-3 flex flex-wrap items-start gap-2 ' + className}>
          {children}
        </ul>
      ) : null}
    </section>
  );
}

export function BattlefieldLane({
  title,
  emptyMessage,
  children,
}: {
  title: string;
  emptyMessage: string;
  children: ReactNode;
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

export function IjinWithEquipment({
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
    <li className="w-[80px] min-w-0 shrink-0">
      <BoardCardTile
        instance={instance}
        card={card}
        listItem={false}
        onTap={() => onTap(instance)}
      />
      {equipment.length > 0 && (
        <ul className="mt-2 flex flex-wrap items-start gap-2">
          {equipment.map((equipmentInstance) => {
            const equipmentCard = cardsById.get(equipmentInstance.cardId);
            return equipmentCard ? (
              <li
                key={equipmentInstance.instanceId}
                className="w-[80px] shrink-0"
              >
                <BoardCardTile
                  instance={equipmentInstance}
                  card={equipmentCard}
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
