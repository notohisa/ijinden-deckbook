export type RememberedGoogleAccount = { sub: string; email: string };

export const rememberedGoogleAccountKey =
  'ijinden-deckbook:remembered-google-account:v1';
const legacySessionAccountKey = 'ijinden-deckbook:account';

function parseAccount(raw: string | null): RememberedGoogleAccount | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<RememberedGoogleAccount>;
    return typeof value.sub === 'string' &&
      /^\d{1,255}$/.test(value.sub) &&
      typeof value.email === 'string' &&
      value.email.length > 0
      ? { sub: value.sub, email: value.email }
      : null;
  } catch {
    return null;
  }
}

function storage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window[kind];
  } catch {
    return null;
  }
}

/** Read the persistent account choice, migrating the previous tab-only value once. */
export function loadRememberedGoogleAccount(): RememberedGoogleAccount | null {
  const local = storage('localStorage');
  const session = storage('sessionStorage');
  let stored: string | null = null;
  try {
    stored = local?.getItem(rememberedGoogleAccountKey) ?? null;
  } catch {
    // The rest of the app still works with this tab's local decks.
  }
  if (stored !== null) {
    try {
      session?.removeItem(legacySessionAccountKey);
    } catch {
      // The persistent value wins; a failed cleanup must not block local use.
    }
    return parseAccount(stored);
  }

  let legacy: string | null = null;
  try {
    legacy = session?.getItem(legacySessionAccountKey) ?? null;
  } catch {
    return null;
  }
  const account = parseAccount(legacy);
  if (account && local) {
    try {
      local.setItem(rememberedGoogleAccountKey, JSON.stringify(account));
    } catch {
      // Keep the account available for this tab even if persistence is blocked.
    }
  }
  try {
    session?.removeItem(legacySessionAccountKey);
  } catch {
    // The legacy value is only a convenience and must not block local use.
  }
  return account;
}

export function rememberGoogleAccount(account: RememberedGoogleAccount): void {
  try {
    storage('localStorage')?.setItem(
      rememberedGoogleAccountKey,
      JSON.stringify(account),
    );
  } catch {
    // The current tab can still use the account without remembering it.
  }
  try {
    storage('sessionStorage')?.removeItem(legacySessionAccountKey);
  } catch {
    // Best-effort cleanup of the previous tab-only value.
  }
}

export function forgetRememberedGoogleAccount(): void {
  try {
    // Keep a tombstone: another already-open tab may still carry the legacy
    // sessionStorage value, which must not be migrated back after logout.
    storage('localStorage')?.setItem(
      rememberedGoogleAccountKey,
      JSON.stringify({ cleared: true }),
    );
  } catch {
    // Logout still clears the in-memory account and token.
  }
  try {
    storage('sessionStorage')?.removeItem(legacySessionAccountKey);
  } catch {
    // Also remove the old value so it cannot be migrated again after logout.
  }
}
