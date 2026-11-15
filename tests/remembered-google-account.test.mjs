import assert from 'node:assert/strict';
import test from 'node:test';

import {
  forgetRememberedGoogleAccount,
  loadRememberedGoogleAccount,
  rememberedGoogleAccountKey,
  rememberGoogleAccount,
} from '../lib/remembered-google-account.ts';

const legacyKey = 'ijinden-deckbook:account';

function makeStorage(initial = {}, failures = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) {
      if (failures.get) throw new Error('storage read denied');
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (failures.set) throw new Error('storage write denied');
      values.set(key, String(value));
    },
    removeItem(key) {
      if (failures.remove) throw new Error('storage remove denied');
      values.delete(key);
    },
  };
}

function withWindow(localStorage, sessionStorage, operation) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage, sessionStorage },
  });
  try {
    operation();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    else delete globalThis.window;
  }
}

test('restores only sub and email from persisted account data', () => {
  const local = makeStorage({
    [rememberedGoogleAccountKey]: JSON.stringify({
      sub: '111',
      email: '111@example.com',
      accessToken: 'must-not-be-restored',
      extra: 'ignored',
    }),
  });
  const session = makeStorage({
    [legacyKey]: JSON.stringify({ sub: '222', email: '222@example.com' }),
  });

  withWindow(local, session, () => {
    assert.deepEqual(loadRememberedGoogleAccount(), {
      sub: '111',
      email: '111@example.com',
    });
    assert.equal(session.values.has(legacyKey), false);
  });
});

test('migrates the tab-only account and keeps a logout tombstone from reimporting it', () => {
  const local = makeStorage();
  const session = makeStorage({
    [legacyKey]: JSON.stringify({ sub: '111', email: '111@example.com' }),
  });

  withWindow(local, session, () => {
    assert.deepEqual(loadRememberedGoogleAccount(), {
      sub: '111',
      email: '111@example.com',
    });
    assert.deepEqual(JSON.parse(local.values.get(rememberedGoogleAccountKey)), {
      sub: '111',
      email: '111@example.com',
    });
    assert.equal(session.values.has(legacyKey), false);

    session.setItem(
      legacyKey,
      JSON.stringify({ sub: '222', email: '222@example.com' }),
    );
    forgetRememberedGoogleAccount();
    assert.deepEqual(JSON.parse(local.values.get(rememberedGoogleAccountKey)), {
      cleared: true,
    });
    assert.equal(loadRememberedGoogleAccount(), null);
    assert.equal(session.values.has(legacyKey), false);
  });
});

test('storage exceptions do not escape account read, remember, or logout', () => {
  const local = makeStorage({}, { get: true, set: true, remove: true });
  const session = makeStorage({}, { get: true, set: true, remove: true });

  withWindow(local, session, () => {
    assert.doesNotThrow(() => loadRememberedGoogleAccount());
    assert.equal(loadRememberedGoogleAccount(), null);
    assert.doesNotThrow(() =>
      rememberGoogleAccount({ sub: '111', email: '111@example.com' }),
    );
    assert.doesNotThrow(() => forgetRememberedGoogleAccount());
  });
});
