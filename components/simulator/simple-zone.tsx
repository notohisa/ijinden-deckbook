import type { ReactNode } from 'react';

export function SimpleZone({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]/75 p-3 sm:p-4"
      aria-label={title}
    >
      <h2 className="font-display text-lg">
        {title}{' '}
        <span className="ml-1 font-sans text-sm text-[var(--muted)]">
          {count}枚
        </span>
      </h2>
      {children}
    </section>
  );
}
