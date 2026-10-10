'use client';

/* oxlint-disable next/no-img-element -- GitHub Pages renders official card URLs with standard images, without a Next.js image server. */

import type { AppCard } from '@/app/types/deck';
import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function CardDetailDialog({
  card,
  navigationCardIds,
  onNavigate,
  onOpenChange,
}: {
  card: AppCard | null;
  navigationCardIds: readonly string[] | null;
  onNavigate: (cardId: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const gestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const touchPointersRef = useRef(new Set<number>());
  const suppressClickUntilRef = useRef(0);
  const navigationIndex = card
    ? (navigationCardIds?.indexOf(card.id) ?? -1)
    : -1;
  const canNavigate =
    Boolean(navigationCardIds && navigationCardIds.length > 1) &&
    navigationIndex >= 0;

  const navigate = useCallback(
    (direction: -1 | 1) => {
      if (!canNavigate || !navigationCardIds) return;
      const nextCardId = navigationCardIds[navigationIndex + direction];
      if (nextCardId) onNavigate(nextCardId);
    },
    [canNavigate, navigationCardIds, navigationIndex, onNavigate],
  );

  useEffect(() => {
    if (card) return;
    gestureRef.current = null;
    touchPointersRef.current.clear();
    suppressClickUntilRef.current = 0;
  }, [card]);

  useEffect(() => {
    if (!card || !canNavigate) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest('input, textarea, select, [role="textbox"]'))
      ) {
        return;
      }
      if (event.key === 'ArrowLeft' && navigationIndex > 0) {
        event.preventDefault();
        navigate(-1);
      } else if (
        event.key === 'ArrowRight' &&
        navigationCardIds &&
        navigationIndex < navigationCardIds.length - 1
      ) {
        event.preventDefault();
        navigate(1);
      }
    }

    // Dialog handles bubbling keys; a button disabled at the end can also lose
    // focus. Capture at the window only while this navigable dialog is open.
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [card, canNavigate, navigationCardIds, navigationIndex, navigate]);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'touch') return;
    if (touchPointersRef.current.size > 0) {
      touchPointersRef.current.add(event.pointerId);
      gestureRef.current = null;
      return;
    }
    touchPointersRef.current.add(event.pointerId);
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    const captureTarget =
      event.target instanceof Element
        ? (event.target.closest<HTMLElement>('[data-card-navigation-button]') ??
          event.currentTarget)
        : event.currentTarget;
    captureTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'touch') return;
    touchPointersRef.current.delete(event.pointerId);
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (
      Math.abs(deltaX) < 45 ||
      Math.abs(deltaY) > 80 ||
      Math.abs(deltaX) <= Math.abs(deltaY) * 1.5
    ) {
      return;
    }
    suppressClickUntilRef.current = Date.now() + 500;
    navigate(deltaX < 0 ? 1 : -1);
  }

  function handlePointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'touch') return;
    touchPointersRef.current.delete(event.pointerId);
    if (gestureRef.current?.pointerId === event.pointerId) {
      gestureRef.current = null;
    }
  }

  function handleClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (suppressClickUntilRef.current <= Date.now()) return;
    suppressClickUntilRef.current = 0;
    event.preventDefault();
    event.stopPropagation();
  }

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
              <div
                className="relative mx-auto h-[240px] w-[172px] shrink-0 sm:mx-0 sm:h-[310px] sm:w-[222px]"
                style={{ touchAction: 'pan-y pinch-zoom' }}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onClickCapture={handleClickCapture}
              >
                <img
                  src={card.imageUrl}
                  alt={card.name + 'のカード画像'}
                  draggable={false}
                  className="h-full w-full rounded-lg border border-black/20 bg-white object-cover object-top shadow-lg"
                />
                {canNavigate && navigationCardIds && (
                  <>
                    <button
                      type="button"
                      data-card-navigation-button
                      onClick={() => navigate(-1)}
                      disabled={navigationIndex === 0}
                      aria-label="前のカード画像"
                      className="absolute inset-y-0 left-0 grid w-10 place-items-center rounded-l-lg bg-gradient-to-r from-black/50 to-transparent text-white opacity-75 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white disabled:cursor-default disabled:opacity-30"
                    >
                      <ChevronLeft aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      data-card-navigation-button
                      onClick={() => navigate(1)}
                      disabled={
                        navigationIndex === navigationCardIds.length - 1
                      }
                      aria-label="次のカード画像"
                      className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-lg bg-gradient-to-l from-black/50 to-transparent text-white opacity-75 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white disabled:cursor-default disabled:opacity-30"
                    >
                      <ChevronRight aria-hidden="true" />
                    </button>
                    <span
                      className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white"
                      aria-live="polite"
                      aria-atomic="true"
                    >
                      {navigationIndex + 1} / {navigationCardIds.length}
                    </span>
                  </>
                )}
              </div>
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
