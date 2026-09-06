import type { RegulationValidation } from '@/app/types/deck';

type Props = {
  validations: readonly RegulationValidation[];
};

/** Presentation only: validation is calculated by deck-validator. */
export function RegulationStatus({ validations }: Props) {
  return (
    <section
      className="mt-3 rounded-xl border border-[var(--line)] bg-white px-3 py-3"
      aria-label="レギュレーション"
    >
      <h2 className="font-display text-lg">レギュレーション</h2>
      <ul className="mt-2 space-y-2">
        {validations.map((validation) => (
          <li key={validation.regulationId}>
            <p className="text-sm font-medium leading-5 text-[var(--ink)]">
              {validation.valid ? '✅' : '❌'} {validation.regulationName}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">
              {validation.cardLimits
                .map(
                  (cardLimit) =>
                    cardLimit.shortName + String(cardLimit.limit) + '枚',
                )
                .join('・')}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
