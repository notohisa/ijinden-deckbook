import type { DeckValidation } from '@/app/types/deck';
import {
  getDeckValidationIcon,
  getDeckValidationLabel,
} from '@/lib/deck-validator';

export function DeckStatusBadge({
  validation,
  className = '',
}: {
  validation: DeckValidation;
  className?: string;
}) {
  const tone =
    validation.status === 'valid'
      ? 'bg-emerald-100 text-emerald-900'
      : validation.status === 'incomplete'
        ? 'bg-amber-100 text-amber-950'
        : 'bg-red-100 text-red-900';
  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ' +
        tone +
        ' ' +
        className
      }
    >
      {getDeckValidationIcon(validation.status)}{' '}
      {getDeckValidationLabel(validation.status)}
    </span>
  );
}
