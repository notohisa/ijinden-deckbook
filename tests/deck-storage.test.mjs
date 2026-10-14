import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadStoredArchive,
  localStorageKey,
  saveStoredArchive,
} from '../lib/deck-storage.ts';

function deck(id, name = id, main = { '01-001': 40 }, side = {}, isSaved) {
  return {
    id,
    name,
    main,
    side,
    updatedAt: '2026-09-06T00:00:00.000Z',
    ...(isSaved === undefined ? {} : { isSaved }),
  };
}

function rawArchive(archive) {
  return JSON.stringify(archive);
}

test('localStorageKey is stable', () => {
  assert.equal(localStorageKey, 'ijinden-deckbook-v1');
});

test('empty storage starts with an empty ready archive', () => {
  assert.deepEqual(
    loadStoredArchive(() => null),
    {
      status: 'ready',
      source: 'empty',
      decks: [],
      draft: null,
    },
  );
});

test('getItem errors block loading without a raw value', () => {
  assert.deepEqual(
    loadStoredArchive(() => {
      throw new Error('storage unavailable');
    }),
    { status: 'blocked', raw: null, reason: 'read-error' },
  );
});

test('malformed JSON is blocked and preserves the exact raw value', () => {
  const raw = '{"version":2';
  assert.deepEqual(
    loadStoredArchive(() => raw),
    {
      status: 'blocked',
      raw,
      reason: 'invalid-data',
    },
  );
});

test('an empty string is invalid data rather than empty storage', () => {
  assert.deepEqual(
    loadStoredArchive(() => ''),
    {
      status: 'blocked',
      raw: '',
      reason: 'invalid-data',
    },
  );
});

test('unknown versions are blocked and preserve the exact raw value', () => {
  const raw = rawArchive({ version: 99, decks: [] });
  assert.deepEqual(
    loadStoredArchive(() => raw),
    {
      status: 'blocked',
      raw,
      reason: 'unsupported-version',
    },
  );
});

test('JSON null, primitives, and a root array are invalid data', () => {
  for (const value of ['null', '42', '"archive"', '[]']) {
    assert.deepEqual(
      loadStoredArchive(() => value),
      {
        status: 'blocked',
        raw: value,
        reason: 'invalid-data',
      },
    );
  }
});

test('an invalid deck array is blocked instead of being filtered and saved', () => {
  const raw = rawArchive({
    version: 2,
    decks: [deck('valid'), { ...deck('invalid'), main: { '01-001': 0 } }],
    draft: deck('draft'),
  });
  assert.deepEqual(
    loadStoredArchive(() => raw),
    {
      status: 'blocked',
      raw,
      reason: 'invalid-data',
    },
  );
});

test('invalid v2 drafts are blocked', () => {
  const raw = rawArchive({
    version: 2,
    decks: [deck('saved')],
    draft: { ...deck('draft'), side: [] },
  });
  assert.deepEqual(
    loadStoredArchive(() => raw),
    {
      status: 'blocked',
      raw,
      reason: 'invalid-data',
    },
  );
});

test('v3 saved decks and active records must match one-to-one before saving', () => {
  const savedA = deck('saved-a', 'Saved A');
  const savedB = deck('saved-b', 'Saved B');
  const activeRecord = (value) => ({
    id: value.id,
    clock: { writer: 1 },
    state: 'active',
    deck: value,
  });
  const invalidArchives = [
    {
      decks: [savedA, savedA],
      records: [activeRecord(savedA), activeRecord(savedB)],
    },
    {
      decks: [savedA, savedB],
      records: [activeRecord(savedA), activeRecord(deck('orphan', 'Orphan'))],
    },
  ];

  for (const { decks, records } of invalidArchives) {
    const raw = rawArchive({
      version: 3,
      decks,
      draft: deck('draft'),
      sync: { writerId: 'writer', records },
    });
    const result = loadStoredArchive(() => raw);
    assert.deepEqual(result, {
      status: 'blocked',
      raw,
      reason: 'invalid-data',
    });

    let stored = raw;
    let writes = 0;
    saveStoredArchive(
      result,
      {
        version: 3,
        updatedAt: '2026-09-11T00:00:00.000Z',
        decks: [],
        draft: deck('replacement-draft'),
        sync: { writerId: 'writer', records: [] },
      },
      (value) => {
        writes += 1;
        stored = value;
      },
    );
    assert.equal(writes, 0);
    assert.equal(stored, raw);
  }
});

test('v3 saved and active piles match regardless of JSON key order', () => {
  const saved = deck('saved', 'Saved', { '01-001': 2, '01-002': 3 });
  const active = {
    ...saved,
    main: { '01-002': 3, '01-001': 2 },
    isSaved: true,
  };
  const raw = rawArchive({
    version: 3,
    decks: [saved],
    draft: deck('draft'),
    sync: {
      writerId: 'writer',
      records: [
        {
          id: 'saved',
          clock: { writer: 1 },
          state: 'active',
          deck: active,
        },
      ],
    },
  });

  const result = loadStoredArchive(() => raw);
  assert.equal(result.status, 'ready');
  assert.equal(result.source, 'v3');
});

test('v1 and v2 reject missing deck arrays and preserve partially invalid archives', () => {
  for (const version of [1, 2]) {
    for (const decks of [undefined, {}, [deck('saved'), null]]) {
      const raw = rawArchive({ version, decks, draft: deck('draft') });
      assert.deepEqual(
        loadStoredArchive(() => raw),
        {
          status: 'blocked',
          raw,
          reason: 'invalid-data',
        },
      );
    }
  }
});

test('positive safe integer counts are required in both piles', () => {
  for (const count of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const raw = rawArchive({
      version: 2,
      decks: [deck('saved', 'saved', { '01-001': count })],
      draft: deck('draft'),
    });
    assert.equal(loadStoredArchive(() => raw).status, 'blocked', String(count));
  }
});

test('normal v2 data loads as saved decks and an independent draft clone', () => {
  const saved = deck('saved', 'Saved', { '01-001': 2 }, { '01-002': 1 }, false);
  const draft = deck('draft', 'Draft', { '01-003': 3 }, {}, true);
  const archive = {
    version: 2,
    updatedAt: '2026-09-06T00:00:00.000Z',
    decks: [saved],
    draft,
  };
  const result = loadStoredArchive(() => rawArchive(archive));

  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') return;
  assert.equal(result.source, 'v2');
  assert.equal(result.decks.length, 1);
  assert.equal(result.decks[0].isSaved, true);
  assert.equal(result.draft?.isSaved, false);
  assert.deepEqual(result.decks[0].main, saved.main);
  assert.deepEqual(result.decks[0].side, saved.side);
  assert.deepEqual(result.draft?.main, draft.main);
  assert.deepEqual(result.draft?.side, draft.side);
  assert.notEqual(result.decks[0], saved);
  assert.notEqual(result.decks[0].main, saved.main);
  assert.notEqual(result.decks[0].side, saved.side);
  assert.notEqual(result.draft, draft);
  assert.notEqual(result.draft?.main, draft.main);
  assert.notEqual(result.draft?.side, draft.side);

  result.decks[0].main['01-001'] = 40;
  if (result.draft) result.draft.main['01-003'] = 1;
  assert.equal(saved.main['01-001'], 2);
  assert.equal(draft.main['01-003'], 3);
});

test('v2 saved decks and the active draft migrate both piles and combine aliased counts', () => {
  const saved = {
    ...deck(
      'saved',
      'Saved',
      { 'PSR-01-008': 2, 'FA-SR-01-001': 1, 'HW-SR-01-007': 1, '01-001': 4 },
      { 'HW-SR-01-007': 2, '01-002': 1 },
      true,
    ),
    customMetadata: { source: 'saved deck' },
  };
  const draft = {
    ...deck(
      'draft',
      'Draft',
      { 'HW-SR-01-007': 3, 'FA-SR-01-003': 1 },
      { 'PSR-01-008': 1, 'FA-SR-01-001': 2 },
      true,
    ),
    customMetadata: { source: 'active draft' },
  };
  const result = loadStoredArchive(() =>
    rawArchive({ version: 2, decks: [saved], draft }),
  );

  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') return;
  assert.deepEqual(result.decks[0].main, {
    'FA-SR-01-001': 3,
    'FA-SR-01-003': 1,
    '01-001': 4,
  });
  assert.deepEqual(result.decks[0].side, {
    'FA-SR-01-003': 2,
    '01-002': 1,
  });
  assert.deepEqual(result.draft?.main, { 'FA-SR-01-003': 4 });
  assert.deepEqual(result.draft?.side, { 'FA-SR-01-001': 3 });
  assert.equal(result.decks[0].id, 'saved');
  assert.equal(result.draft?.id, 'draft');
  assert.equal(result.decks[0].customMetadata.source, 'saved deck');
  assert.equal(result.draft?.customMetadata.source, 'active draft');
  assert.equal(result.decks[0].isSaved, true);
  assert.equal(result.draft?.isSaved, false);
  assert.equal(result.decks[0].main['FA-SR-01-002'], undefined);
  assert.equal(result.draft?.main['FA-SR-01-002'], undefined);
  assert.deepEqual(saved.main, {
    'PSR-01-008': 2,
    'FA-SR-01-001': 1,
    'HW-SR-01-007': 1,
    '01-001': 4,
  });
});

test('v1 saved decks and the copied legacy draft migrate aliases in main and side', () => {
  const saved = deck(
    'saved',
    'Saved',
    { 'PSR-01-008': 2 },
    { 'HW-SR-01-007': 3 },
    true,
  );
  const legacyDraft = deck(
    'legacy-draft',
    'Draft',
    { 'HW-SR-01-007': 4 },
    { 'PSR-01-008': 5 },
    false,
  );
  const result = loadStoredArchive(() =>
    rawArchive({ version: 1, decks: [saved, legacyDraft] }),
  );

  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') return;
  assert.deepEqual(result.decks[0].main, { 'FA-SR-01-001': 2 });
  assert.deepEqual(result.decks[0].side, { 'FA-SR-01-003': 3 });
  assert.deepEqual(result.draft?.main, { 'FA-SR-01-003': 4 });
  assert.deepEqual(result.draft?.side, { 'FA-SR-01-001': 5 });
  assert.notEqual(result.draft?.id, legacyDraft.id);
  assert.equal(result.decks[0].id, saved.id);
  assert.deepEqual(legacyDraft.side, { 'PSR-01-008': 5 });
});

test('migration stays canonical through archive save, reload, and JSON re-import', async () => {
  const { parseDeckImport } = await import('../lib/deck-import.ts');
  const original = rawArchive({
    version: 2,
    decks: [
      deck(
        'saved',
        'Saved',
        { 'PSR-01-008': 2, 'FA-SR-01-001': 1 },
        { 'HW-SR-01-007': 3 },
      ),
    ],
    draft: deck('draft', 'Draft', { 'HW-SR-01-007': 1 }, {}),
  });
  const firstLoad = loadStoredArchive(() => original);
  assert.equal(firstLoad.status, 'ready');
  if (firstLoad.status !== 'ready') return;
  const archive = {
    version: 2,
    updatedAt: '2026-09-11T00:00:00.000Z',
    decks: firstLoad.decks,
    draft: firstLoad.draft,
  };
  const writes = [];
  saveStoredArchive(firstLoad, archive, (raw) => writes.push(raw));
  assert.equal(writes.length, 1);

  const secondLoad = loadStoredArchive(() => writes[0]);
  assert.equal(secondLoad.status, 'ready');
  if (secondLoad.status !== 'ready') return;
  assert.deepEqual(secondLoad.decks[0].main, { 'FA-SR-01-001': 3 });
  assert.deepEqual(secondLoad.decks[0].side, { 'FA-SR-01-003': 3 });
  assert.deepEqual(secondLoad.draft?.main, { 'FA-SR-01-003': 1 });
  const imported = parseDeckImport(
    { decks: secondLoad.decks },
    new Set(['FA-SR-01-001', 'FA-SR-01-002', 'FA-SR-01-003']),
  );
  assert.deepEqual(imported.invalidDecks, []);
  assert.deepEqual(imported.decks[0].main, { 'FA-SR-01-001': 3 });
  assert.deepEqual(imported.decks[0].side, { 'FA-SR-01-003': 3 });
});

test('aliased count overflow blocks the archive and prevents replacing its raw value', () => {
  const raw = rawArchive({
    version: 2,
    decks: [
      deck('saved', 'Saved', {
        'PSR-01-008': Number.MAX_SAFE_INTEGER,
        'FA-SR-01-001': 1,
      }),
    ],
    draft: deck('draft'),
  });
  const result = loadStoredArchive(() => raw);
  assert.deepEqual(result, { status: 'blocked', raw, reason: 'invalid-data' });

  const writes = [];
  saveStoredArchive(
    result,
    {
      version: 2,
      updatedAt: '2026-09-11T00:00:00.000Z',
      decks: [],
      draft: deck('new-draft'),
    },
    (value) => writes.push(value),
  );
  assert.deepEqual(writes, []);
});

test('normal v1 data separates saved decks and copies the first legacy draft', () => {
  const saved = deck('saved', 'Saved', { '01-001': 2 }, {}, true);
  const legacyDraft = deck('draft', 'Draft', { '01-002': 3 }, {}, false);
  const raw = rawArchive({
    version: 1,
    updatedAt: '2026-09-06T00:00:00.000Z',
    decks: [saved, legacyDraft],
  });
  const result = loadStoredArchive(() => raw);

  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') return;
  assert.equal(result.source, 'v1');
  assert.deepEqual(
    result.decks.map(({ id }) => id),
    ['saved'],
  );
  assert.equal(result.decks[0].isSaved, true);
  assert.equal(result.draft?.isSaved, false);
  assert.notEqual(result.draft?.id, legacyDraft.id);
  assert.deepEqual(result.draft?.main, legacyDraft.main);
  assert.notEqual(result.decks[0], saved);
  assert.notEqual(result.decks[0].main, saved.main);
  assert.notEqual(result.draft, legacyDraft);
  assert.notEqual(result.draft?.main, legacyDraft.main);
});

test('normal v1 data without a draft returns null', () => {
  const raw = rawArchive({
    version: 1,
    updatedAt: '2026-09-06T00:00:00.000Z',
    decks: [deck('saved', 'Saved', { '01-001': 2 }, {}, true)],
  });
  const result = loadStoredArchive(() => raw);

  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') return;
  assert.equal(result.source, 'v1');
  assert.deepEqual(
    result.decks.map(({ id }) => id),
    ['saved'],
  );
  assert.equal(result.draft, null);
});

test('failed loads never overwrite the original data on initial or later saves', () => {
  const originalValues = [
    '{"version":2',
    '',
    'null',
    rawArchive({ version: 999, decks: [], draft: deck('future') }),
    rawArchive({ version: 2, decks: [], draft: null }),
    rawArchive({
      version: 2,
      decks: [deck('saved'), null],
      draft: deck('draft'),
    }),
    rawArchive({ version: 1, decks: [deck('saved'), null] }),
  ];
  for (const original of originalValues) {
    let stored = original;
    let writes = 0;
    const result = loadStoredArchive(() => stored);
    const initial = {
      version: 2,
      updatedAt: '2026-09-11T00:00:00.000Z',
      decks: [],
      draft: deck('new-deck', 'New', {}),
    };
    const write = (raw) => {
      writes += 1;
      stored = raw;
    };
    saveStoredArchive(result, initial, write);
    saveStoredArchive(result, { ...initial, draft: deck('edited') }, write);
    assert.equal(writes, 0);
    assert.equal(stored, original);
  }
});

test('saving before hydration or after a read error does not access storage', () => {
  const readError = loadStoredArchive(() => {
    throw new Error('storage unavailable');
  });
  const archive = {
    version: 2,
    updatedAt: '2026-09-11T00:00:00.000Z',
    decks: [],
    draft: deck('new-deck'),
  };
  for (const result of [null, readError]) {
    saveStoredArchive(result, archive, () =>
      assert.fail('Unexpected storage write'),
    );
  }
});

test('first-use, v1 migration and v2 archives can save after successful loading', () => {
  const originals = [
    null,
    rawArchive({
      version: 1,
      decks: [deck('saved', 'Saved', {}, {}, true), deck('draft')],
    }),
    rawArchive({ version: 2, decks: [deck('saved')], draft: deck('draft') }),
  ];
  for (const original of originals) {
    const result = loadStoredArchive(() => original);
    assert.equal(result.status, 'ready');
    const archive = {
      version: 2,
      updatedAt: '2026-09-11T00:00:00.000Z',
      decks: result.decks,
      draft: result.draft ?? deck('new-deck', 'New', {}),
    };
    const writes = [];
    saveStoredArchive(result, archive, (raw) => writes.push(raw));
    assert.equal(writes.length, 1);
    assert.deepEqual(JSON.parse(writes[0]), archive);
    if (original !== null) {
      assert.equal(JSON.parse(writes[0]).decks[0].id, 'saved');
      assert.equal(JSON.parse(writes[0]).draft.name, 'draft');
    }
  }
});

test('write failures reach the caller so the UI can report them', () => {
  const archive = {
    version: 2,
    updatedAt: '2026-09-11T00:00:00.000Z',
    decks: [],
    draft: deck('draft'),
  };
  const error = new Error('quota exceeded');
  assert.throws(
    () =>
      saveStoredArchive(
        loadStoredArchive(() => null),
        archive,
        () => {
          throw error;
        },
      ),
    (actual) => actual === error,
  );
});
