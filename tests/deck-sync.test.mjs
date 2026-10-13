import assert from 'node:assert/strict';
import test from 'node:test';

import {
  changeRecord,
  mergeRecords,
  prepareForUpload,
  resolveConflict,
  validateSnapshot,
} from '../lib/deck-sync.ts';

const now = '2026-10-14T00:00:00.000Z';
const knownCards = new Set(['01-001', '01-002']);

function deck(id, name = id, main = { '01-001': 4 }) {
  return {
    id,
    name,
    main,
    side: {},
    updatedAt: now,
    isSaved: true,
  };
}

function record(id, clock, state = 'active', value = deck(id)) {
  if (state === 'purged') {
    return {
      id,
      clock,
      state,
      trashedAt: '2026-08-01T00:00:00.000Z',
      trashSyncedAt: '2026-08-01T00:00:00.000Z',
    };
  }
  if (state === 'trash') {
    return {
      id,
      clock,
      state,
      deck: value,
      trashedAt: '2026-08-01T00:00:00.000Z',
      trashSyncedAt: '2026-08-01T00:00:00.000Z',
    };
  }
  return { id, clock, state, deck: value };
}

function snapshot(records, writerId = 'writer-a') {
  return {
    format: 'ijinden-deckbook-sync',
    version: 1,
    writerId,
    records,
  };
}

test('validates snapshots strictly and stops for newer or unknown card data', () => {
  const input = snapshot([record('deck-a', { 'writer-a': 1 })]);
  const result = validateSnapshot(input, knownCards);
  assert.equal(result.records[0].deck.isSaved, true);
  assert.notEqual(result.records[0], input.records[0]);

  assert.throws(
    () => validateSnapshot({ ...input, version: 2 }),
    /新しい形式/u,
  );
  assert.throws(
    () =>
      validateSnapshot(
        snapshot([
          record(
            'deck-a',
            { 'writer-a': 1 },
            'active',
            deck('deck-a', 'Unknown', { '99-999': 1 }),
          ),
        ]),
        knownCards,
      ),
    /未登録のカードID/u,
  );
  assert.throws(() => validateSnapshot(snapshot([null])), /レコード形式/u);
  assert.throws(
    () =>
      validateSnapshot(
        snapshot([
          record('deck-a', { 'writer-a': 1 }),
          record('deck-a', { 'writer-a': 2 }),
        ]),
      ),
    /複数/u,
  );
});

test('a causally newer deletion dominates a stale offline deck without resurrection', () => {
  const stale = record('deck-a', { 'writer-a': 1 });
  const trash = changeRecord(stale, 'trash', stale.deck, 'writer-a', now);
  const merged = mergeRecords([], [[trash], [stale]]);
  assert.deepEqual(merged.conflicts, []);
  assert.equal(merged.records.length, 1);
  assert.equal(merged.records[0].state, 'trash');

  const stamped = prepareForUpload(merged.records, 'writer-a', now)[0];
  const purged = prepareForUpload(
    [stamped],
    'writer-b',
    '2026-11-13T00:00:00.000Z',
  )[0];
  assert.equal(purged.state, 'purged');
  assert.equal('deck' in purged, false);
  assert.throws(
    () => changeRecord(purged, 'active', deck('deck-a'), 'writer-a', now),
    /削除済み/u,
  );
  const afterPurge = mergeRecords([], [[purged], [stale]]);
  assert.deepEqual(afterPurge.conflicts, []);
  assert.equal(afterPurge.records[0].state, 'purged');
});

test('a later same-writer active version cannot automatically replace a purged ID', () => {
  const purged = record('deck-a', { 'writer-a': 3 }, 'purged');
  const active = record(
    'deck-a',
    { 'writer-a': 4 },
    'active',
    deck('deck-a', 'Restored'),
  );
  const merged = mergeRecords([purged], [[active]]);
  assert.deepEqual(merged.records, []);
  assert.equal(merged.conflicts.length, 1);
  assert.deepEqual(
    new Set(merged.conflicts[0].candidates.map(({ state }) => state)),
    new Set(['purged', 'active']),
  );

  const [tombstone, copiedActive] = resolveConflict(
    merged.conflicts[0],
    1,
    'writer-b',
  );
  assert.equal(tombstone.id, 'deck-a');
  assert.equal(tombstone.state, 'purged');
  assert.notEqual(copiedActive.id, 'deck-a');
  assert.equal(copiedActive.deck.name, 'Restored');
  assert.deepEqual(resolveConflict(merged.conflicts[0], 0, 'writer-b'), [
    { ...tombstone, clock: { 'writer-a': 4, 'writer-b': 1 } },
  ]);
});

test('merges equivalent concurrent payloads and combines their vector clocks', () => {
  const left = record('deck-a', { 'writer-a': 2 });
  const right = record('deck-a', { 'writer-b': 3 });
  const merged = mergeRecords([left], [[right]]);
  assert.deepEqual(merged.conflicts, []);
  assert.equal(merged.records.length, 1);
  assert.deepEqual(merged.records[0].clock, { 'writer-a': 2, 'writer-b': 3 });
});

test('a new trash cycle keeps its own retention start when a stale old trash reappears', () => {
  const active = record('deck-a', { 'writer-a': 1 });
  const oldTrash = changeRecord(
    active,
    'trash',
    active.deck,
    'writer-a',
    '2026-08-01T00:00:00.000Z',
  );
  const oldConfirmed = prepareForUpload(
    [oldTrash],
    'writer-b',
    '2026-08-02T00:00:00.000Z',
  )[0];
  const restored = changeRecord(
    oldConfirmed,
    'active',
    deck('deck-a'),
    'writer-a',
    '2026-09-01T00:00:00.000Z',
  );
  const newTrash = changeRecord(
    restored,
    'trash',
    deck('deck-a'),
    'writer-a',
    '2026-10-01T00:00:00.000Z',
  );

  const merged = mergeRecords([newTrash], [[oldConfirmed]]);
  assert.deepEqual(merged.conflicts, []);
  assert.equal(merged.records.length, 1);
  assert.equal(merged.records[0].trashedAt, '2026-10-01T00:00:00.000Z');
  assert.equal(merged.records[0].trashSyncedAt, undefined);
});

test('divergent concurrent edits to the same ID remain an explicit conflict', () => {
  const left = record(
    'deck-a',
    { 'writer-a': 2 },
    'active',
    deck('deck-a', 'A'),
  );
  const right = record(
    'deck-a',
    { 'writer-b': 1 },
    'active',
    deck('deck-a', 'B'),
  );
  const merged = mergeRecords([left], [[right]]);
  assert.equal(merged.conflicts.length, 1);
  assert.equal(merged.conflicts[0].id, 'deck-a');
  assert.equal(merged.conflicts[0].candidates.length, 2);
  assert.deepEqual(merged.records, []);
});

test('different IDs merge independently', () => {
  const merged = mergeRecords(
    [record('deck-a', { 'writer-a': 1 })],
    [[record('deck-b', { 'writer-b': 1 })]],
  );
  assert.deepEqual(merged.conflicts, []);
  assert.deepEqual(
    merged.records.map(({ id }) => id),
    ['deck-a', 'deck-b'],
  );
});

test('resolving one conflict keeps both candidates under distinct IDs', () => {
  const conflict = {
    id: 'deck-a',
    candidates: [
      record('deck-a', { 'writer-a': 1 }, 'active', deck('deck-a', 'A')),
      record('deck-a', { 'writer-b': 1 }, 'active', deck('deck-a', 'B')),
    ],
  };
  const resolved = resolveConflict(conflict, 'both', 'writer-c');
  assert.equal(resolved.length, 2);
  assert.notEqual(resolved[0].id, resolved[1].id);
  assert.deepEqual(resolved[0].clock, {
    'writer-a': 1,
    'writer-b': 1,
    'writer-c': 1,
  });
  assert.equal(resolved[1].deck.id, resolved[1].id);
});

test('resolving a conflict with a purged ID retains its tombstone and assigns surviving content a new ID', () => {
  const conflict = {
    id: 'deck-a',
    candidates: [
      record('deck-a', { 'writer-a': 2 }, 'purged'),
      record(
        'deck-a',
        { 'writer-b': 1 },
        'active',
        deck('deck-a', 'Still here'),
      ),
    ],
  };
  const [tombstone, restoredCopy] = resolveConflict(conflict, 1, 'writer-c');
  assert.equal(tombstone.id, 'deck-a');
  assert.equal(tombstone.state, 'purged');
  assert.notEqual(restoredCopy.id, 'deck-a');
  assert.equal(restoredCopy.state, 'active');
  assert.equal(restoredCopy.deck.id, restoredCopy.id);
  const merged = mergeRecords(
    [],
    [[tombstone], [record('deck-a', { 'writer-b': 1 })]],
  );
  assert.deepEqual(merged.conflicts, []);
  assert.equal(merged.records[0].state, 'purged');
});

test('a trash candidate copied to a new ID starts its own confirmed-sync period', () => {
  const conflict = {
    id: 'deck-a',
    candidates: [
      record('deck-a', { 'writer-a': 2 }, 'purged'),
      record('deck-a', { 'writer-b': 1 }, 'trash'),
    ],
  };
  const [, copiedTrash] = resolveConflict(conflict, 1, 'writer-c');
  assert.notEqual(copiedTrash.id, 'deck-a');
  assert.equal(copiedTrash.state, 'trash');
  assert.equal(copiedTrash.trashSyncedAt, undefined);
  const prepared = prepareForUpload(
    [copiedTrash],
    'writer-c',
    '2026-10-14T00:00:00.000Z',
  )[0];
  assert.equal(prepared.state, 'trash');
  assert.equal(prepared.trashSyncedAt, '2026-10-14T00:00:00.000Z');
});

test('manual purge of unsynced trash creates a valid permanent tombstone and resolves safely', () => {
  const active = record('deck-a', { 'writer-a': 1 });
  const unsyncedTrash = changeRecord(
    active,
    'trash',
    active.deck,
    'writer-a',
    '2026-10-01T00:00:00.000Z',
  );
  const purged = changeRecord(
    unsyncedTrash,
    'purged',
    undefined,
    'writer-a',
    '2026-10-02T00:00:00.000Z',
  );
  assert.equal(purged.state, 'purged');
  assert.equal(purged.trashSyncedAt, undefined);
  assert.equal(
    validateSnapshot(snapshot([purged])).records[0].trashSyncedAt,
    undefined,
  );

  const conflict = {
    id: 'deck-a',
    candidates: [
      purged,
      record(
        'deck-a',
        { 'writer-b': 1 },
        'active',
        deck('deck-a', 'Offline edit'),
      ),
    ],
  };
  const [tombstone, copiedDeck] = resolveConflict(conflict, 1, 'writer-c');
  assert.equal(tombstone.state, 'purged');
  assert.equal(tombstone.trashSyncedAt, undefined);
  assert.notEqual(copiedDeck.id, 'deck-a');
});

test('prepareForUpload stamps trash on first successful-sync payload and never mutates input', () => {
  const trashed = changeRecord(
    record('deck-a', { 'writer-a': 1 }),
    'trash',
    deck('deck-a'),
    'writer-a',
    '2026-09-01T00:00:00.000Z',
  );
  const prepared = prepareForUpload([trashed], 'writer-b', now)[0];
  assert.equal(prepared.trashSyncedAt, now);
  assert.equal(prepared.clock['writer-b'], 1);
  assert.equal(trashed.trashSyncedAt, undefined);
  assert.equal(trashed.clock['writer-b'], undefined);
});

test('purges only after 30 days from confirmed sync and keeps unconfirmed trash', () => {
  const oldUnconfirmed = {
    ...record('deck-a', { 'writer-a': 1 }, 'trash'),
    trashedAt: '2026-01-01T00:00:00.000Z',
    trashSyncedAt: undefined,
  };
  const unconfirmed = prepareForUpload(
    [oldUnconfirmed],
    'writer-b',
    '2026-10-14T00:00:00.000Z',
  )[0];
  assert.equal(unconfirmed.state, 'trash');
  assert.equal(unconfirmed.trashSyncedAt, '2026-10-14T00:00:00.000Z');

  const confirmed = {
    ...record('deck-a', { 'writer-a': 1 }, 'trash'),
    trashedAt: '2026-01-01T00:00:00.000Z',
    trashSyncedAt: '2026-09-14T00:00:00.000Z',
  };
  const boundary = prepareForUpload(
    [confirmed],
    'writer-b',
    '2026-10-14T00:00:00.000Z',
  )[0];
  assert.equal(boundary.state, 'purged');
  assert.equal('deck' in boundary, false);

  const notYet = prepareForUpload(
    [{ ...confirmed, trashSyncedAt: '2026-09-14T00:00:01.000Z' }],
    'writer-b',
    '2026-10-14T00:00:00.000Z',
  )[0];
  assert.equal(notYet.state, 'trash');
});

test('prepareForUpload refuses unresolved duplicate IDs', () => {
  assert.throws(
    () =>
      prepareForUpload(
        [
          record('deck-a', { 'writer-a': 1 }),
          record('deck-a', { 'writer-b': 1 }),
        ],
        'writer-c',
        now,
      ),
    /競合/u,
  );
});
