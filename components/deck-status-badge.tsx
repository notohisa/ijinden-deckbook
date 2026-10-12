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
      ? 'bg-[var(--success-bg-strong)] text-[var(--success-foreground)]'
      : validation.status === 'incomplete'
        ? 'bg-[var(--warning-bg-strong)] text-[var(--warning-foreground)]'
        : 'bg-[var(--danger-bg-strong)] text-[var(--danger-foreground)]';
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
