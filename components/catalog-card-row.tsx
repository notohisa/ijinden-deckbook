'use client';

import { memo } from 'react';
import type { AppCard, Pile } from '@/app/types/deck';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';

type Props = {
  card: AppCard;
  mainCount: number;
  sideCount: number;
  onAdjustCard: (cardId: string, pile: Pile, difference: number) => void;
  onSelectCard: (cardId: string) => void;
};

const catalogColorTints: Record<string, string> = {
  赤: '#f9d2ca',
  青: '#d7e8f7',
  緑: '#d9eddf',
  黄: '#fff0bb',
  紫: '#e9dcf3',
  無: '#e8edf0',
};

export const CatalogCardRow = memo(function CatalogCardRow({
  card,
  mainCount,
  sideCount,
  onAdjustCard,
  onSelectCard,
}: Props) {
  const tints = Array.from(card.color).map(
    (color) => catalogColorTints[color] ?? catalogColorTints['無'],
  );
  const idBackground =
    tints.length > 1
      ? 'linear-gradient(135deg, ' +
        tints[0] +
        ' 0%, ' +
        tints[0] +
        ' 50%, ' +
        tints[1] +
        ' 50%, ' +
        tints[1] +
        ' 100%)'
      : tints[0];

  return (
    <TableRow
      className={
        'border-[var(--line)] ' +
        (mainCount + sideCount > 0 ? 'bg-[var(--mist)]/70' : 'bg-white/70')
      }
    >
      <TableCell
        className="whitespace-normal break-all px-1 py-2 text-center text-xs text-[var(--ink)] sm:text-sm"
        style={{ background: idBackground }}
      >
        <span aria-label={card.color + '色・' + card.id}>{card.id}</span>
      </TableCell>
      <TableCell className="whitespace-normal px-1 py-1 sm:px-2">
        <button
          type="button"
          onClick={() => onSelectCard(card.id)}
          aria-label={card.name + '（' + card.id + '）の詳細を開く'}
          className="block min-h-11 w-full touch-manipulation rounded px-1 py-1 text-left text-base leading-6 break-words hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--red)]"
        >
          <span aria-hidden="true">🔍</span>
          {card.name}
        </button>
      </TableCell>
      <TableCell className="px-1 py-2">
        <CatalogCardCounter
          label={card.name + '（' + card.id + '）のメイン'}
          count={mainCount}
          onDecrease={() => onAdjustCard(card.id, 'main', -1)}
          onIncrease={() => onAdjustCard(card.id, 'main', 1)}
        />
      </TableCell>
      <TableCell className="px-1 py-2">
        <CatalogCardCounter
          label={card.name + '（' + card.id + '）のサイド'}
          count={sideCount}
          onDecrease={() => onAdjustCard(card.id, 'side', -1)}
          onIncrease={() => onAdjustCard(card.id, 'side', 1)}
        />
      </TableCell>
    </TableRow>
  );
});

function CatalogCardCounter({
  label,
  count,
  onDecrease,
  onIncrease,
}: {
  label: string;
  count: number;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <fieldset
      aria-label={label + 'の枚数'}
      className="grid min-w-0 grid-cols-3 overflow-hidden rounded-md border border-[var(--line)] bg-white p-0"
    >
      <Button
        type="button"
        variant="ghost"
        disabled={count === 0}
        onClick={onDecrease}
        aria-label={label + 'から1枚減らす'}
        className="h-11 min-w-0 touch-manipulation rounded-none border-r border-[var(--line)] px-0 text-base text-[var(--muted)]"
      >
        −
      </Button>
      <output
        aria-label={label + 'に入っている枚数'}
        className="grid h-11 min-w-0 place-items-center text-base tabular-nums"
      >
        {count}
      </output>
      <Button
        type="button"
        variant="ghost"
        onClick={onIncrease}
        aria-label={label + 'に1枚追加する'}
        className="h-11 min-w-0 touch-manipulation rounded-none border-l border-[var(--line)] px-0 text-base text-[var(--ink)]"
      >
        ＋
      </Button>
    </fieldset>
  );
}
