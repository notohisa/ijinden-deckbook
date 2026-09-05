'use client';

/* oxlint-disable next/no-img-element -- GitHub Pages renders official card URLs with standard images, without a Next.js image server. */

import type { AppCard } from '@/app/types/deck';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function CardDetailDialog({
  card,
  onOpenChange,
}: {
  card: AppCard | null;
  onOpenChange: (open: boolean) => void;
}) {
  const illustrator =
    card && 'illustrator' in card && typeof card.illustrator === 'string'
      ? card.illustrator
      : null;
  return (
    <Dialog open={Boolean(card)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto bg-[#f8f5ee] sm:max-w-2xl">
        {card && (
          <>
            <DialogHeader className="pr-8">
              <p className="label">CARD DETAIL</p>
              <DialogTitle className="font-display text-2xl tracking-wide sm:text-3xl">
                {card.name}
              </DialogTitle>
              <DialogDescription>
                {card.id} · {card.release}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
              <img
                src={card.imageUrl}
                alt={card.name + 'のカード画像'}
                className="mx-auto h-[240px] w-[172px] shrink-0 rounded-lg border border-black/20 bg-white object-cover object-top shadow-lg sm:mx-0 sm:h-[310px] sm:w-[222px]"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded-full bg-[var(--ink)] px-2 py-1 text-white">
                    {card.cardType}
                  </span>
                  <span className="rounded-full bg-[var(--mist)] px-2 py-1">
                    {card.rarity}
                  </span>
                  <span className="rounded-full bg-[var(--mist)] px-2 py-1">
                    {card.color}
                  </span>
                  <span className="rounded-full bg-[var(--mist)] px-2 py-1">
                    Lv.{card.level ?? '-'}
                  </span>
                  {card.power !== null && (
                    <span className="rounded-full bg-[var(--mist)] px-2 py-1">
                      パワー {card.power}
                    </span>
                  )}
                </div>
                {card.trait && (
                  <p className="mt-3 text-xs text-[var(--muted)]">
                    {card.trait}
                  </p>
                )}
                <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[var(--ink)]">
                  {card.description || '公式カード情報'}
                </p>
                {illustrator && (
                  <p className="mt-3 text-xs text-[var(--muted)]">
                    イラストレーター：{illustrator}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
