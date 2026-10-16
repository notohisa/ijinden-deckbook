import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createArchiveRepository,
  syncKey,
  SavedDecksChangedError,
} from '../lib/deck-archive-repository.ts';
import { addSavedDeck } from '../lib/deck-operations.ts';
import { changeRecord, prepareForUpload } from '../lib/deck-sync.ts';
import { loadStoredArchive } from '../lib/deck-storage.ts';

const deck = {
  id: 'one',
  name: '一つ目',
  main: { '01-001': 4 },
  side: {},
  updatedAt: '2026-10-14T00:00:00Z',
  isSaved: true,
};
function setup() {
  let raw = JSON.stringify({
    version: 2,
    decks: [deck],
    draft: { ...deck, id: 'draft', isSaved: false },
  });
  const repo = createArchiveRepository(
    {
      read: () => raw,
      write: (value) => {
        raw = value;
      },
      exclusive: async (operation) => operation(),
    },
    deck,
  );
  return { repo, raw: () => raw };
}
test('migration adds sync metadata without losing the draft; reads v3 after reload', async () => {
  const { repo, raw } = setup();
  const before = repo.read();
  const after = await repo.initializeSync();
  assert.deepEqual(after.decks, before.decks);
  assert.deepEqual(after.draft, before.draft);
  assert.equal(after.sync.records[0].id, deck.id);
  assert.equal(loadStoredArchive(raw).status, 'ready');
});
test('trash, restore and unsynced permanent deletion survive reload and remove payload', async () => {
  const { repo, raw } = setup();
  await repo.changeDecks(() => ({ decks: [], value: true }));
  let current = repo.read();
  assert.equal(current.sync.records[0].state, 'trash');
  await repo.changeTrash(deck.id, 'restore', syncKey(current));
  assert.equal(repo.read().decks[0].id, deck.id);
  await repo.changeDecks(() => ({ decks: [], value: true }));
  current = repo.read();
  await repo.changeTrash(deck.id, 'purge', syncKey(current));
  current = loadStoredArchive(raw);
  assert.equal(current.status, 'ready');
  assert.equal(current.sync.records[0].state, 'purged');
  assert.equal(current.sync.records[0].deck, undefined);
});
test('sync cannot overwrite a saved-deck change made after the preview', async () => {
  const { repo } = setup();
  const before = await repo.initializeSync();
  await repo.changeDecks((decks) => ({
    decks: decks.map((d) => ({ ...d, name: '編集中' })),
    value: true,
  }));
  await assert.rejects(
    repo.applySync(syncKey(before), []),
    SavedDecksChangedError,
  );
  assert.equal(repo.read().decks[0].name, '編集中');
});
test('successful sync preserves a draft edited during network access and validates on reload', async () => {
  const { repo, raw } = setup();
  const before = await repo.initializeSync();
  const { draftKey } = await import('../lib/deck-archive-repository.ts');
  await repo.changeDraft(draftKey(before.draft), {
    ...before.draft,
    name: '作業中',
  });
  const records = prepareForUpload(before.sync.records, before.sync.writerId);
  await repo.applySync(syncKey(before), records, '2026-10-14T01:00:00Z');
  assert.equal(repo.read().draft.name, '作業中');
  assert.equal(loadStoredArchive(raw).status, 'ready');
});
test('saved-deck edits keep identity; stale edits require a copy; copies have fresh identity', () => {
  const draft = {
    ...deck,
    id: 'draft',
    sourceId: deck.id,
    sourceUpdatedAt: deck.updatedAt,
    name: '変更',
  };
  assert.equal(addSavedDeck([deck], draft).decks[0].id, deck.id);
  assert.throws(
    () => addSavedDeck([{ ...deck, updatedAt: '2026-10-14T02:00:00Z' }], draft),
    /変更されています/,
  );
  assert.notEqual(addSavedDeck([deck], draft, true).decks[0].id, deck.id);
});
test('v3 inconsistent or newer metadata is blocked rather than replaced', async () => {
  const { repo, raw } = setup();
  await repo.initializeSync();
  const value = JSON.parse(raw());
  value.sync.records = [];
  assert.equal(
    loadStoredArchive(() => JSON.stringify(value)).status,
    'blocked',
  );
  value.version = 4;
  assert.equal(
    loadStoredArchive(() => JSON.stringify(value)).reason,
    'unsupported-version',
  );
});
test('an empty device merges incoming deck identities without deleting the cloud', async () => {
  const { repo } = setup();
  const before = await repo.initializeSync();
  const incoming = changeRecord(
    undefined,
    'active',
    { ...deck, id: 'cloud' },
    'other',
  );
  await repo.applySync(syncKey(before), [...before.sync.records, incoming]);
  assert.deepEqual(
    new Set(repo.read().decks.map((d) => d.id)),
    new Set(['one', 'cloud']),
  );
});

test('prototype-named clock keys remain numeric after editing and reloading', async () => {
  const { repo, raw } = setup();
  const before = await repo.initializeSync();
  const incoming = { ...before.sync.records[0], clock: { toString: 1 } };
  await repo.applySync(syncKey(before), [incoming]);
  await repo.changeDecks((decks) => ({
    decks: decks.map((d) => ({ ...d, name: '編集' })),
    value: true,
  }));
  assert.equal(loadStoredArchive(raw).status, 'ready');
  assert.equal(repo.read().sync.records[0].clock.toString, 1);
});
