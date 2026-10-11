const legacyCardIdAliases: ReadonlyMap<string, string> = new Map([
  ['PSR-01-008', 'FA-SR-01-001'],
  ['HW-SR-01-007', 'FA-SR-01-003'],
]);

/**
 * Rewrites retired card IDs without changing counts. Returns null if any count
 * is invalid or if combining aliased and canonical IDs would overflow.
 */
export function migrateCardIdsInPile(
  pile: Record<string, number>,
): Record<string, number> | null {
  const migrated = new Map<string, number>();
  for (const [cardId, count] of Object.entries(pile)) {
    if (!Number.isSafeInteger(count) || count <= 0) return null;

    const canonicalId = legacyCardIdAliases.get(cardId) ?? cardId;
    const combinedCount = (migrated.get(canonicalId) ?? 0) + count;
    if (!Number.isSafeInteger(combinedCount) || combinedCount <= 0) return null;
    migrated.set(canonicalId, combinedCount);
  }
  return Object.fromEntries(migrated);
}
