import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createArchiveRepository,
  draftKey,
  ArchiveReadError,
  SavedDecksChangedError,
  savedDecksKey,
} from '../lib/deck-archive-repository.ts';
import { addSavedDeck, renameDeck } from '../lib/deck-operations.ts';

const draft = {
  id: 'draft',
  name: '編集中',
  main: { '01-001': 4 },
  side: {},
  updatedAt: '2026-10-11T00:00:00Z',
  isSaved: false,
};
const saved = { ...draft, id: 'saved', name: '既存デッキ', isSaved: true };
function setup(initial = { version: 2, decks: [saved], draft }) {
  let raw = JSON.stringify(initial);
  let tail = Promise.resolve();
  const port = {
    read: () => raw,
    write: (value) => {
      raw = value;
    },
    exclusive: (operation) => {
      const result = tail.then(operation);
      tail = result.catch(() => {});
      return result;
    },
  };
  return {
    a: createArchiveRepository(port, draft),
    b: createArchiveRepository(port, draft),
    port,
    get: () => JSON.parse(raw),
  };
}

test('confirmation cannot overwrite decks changed while waiting for the lock', async () => {
  const { a, b, get } = setup();
  const confirmed = savedDecksKey(b.read().decks);
  await a.changeDecks((decks) =>
    addSavedDeck(decks, { ...draft, name: '移行デッキ' }),
  );
  const before = get();
  let called = false;
  await assert.rejects(
    b.changeDecks(() => {
      called = true;
      return { decks: [], value: true };
    }, confirmed),
    SavedDecksChangedError,
  );
  assert.equal(called, false);
  assert.deepEqual(get(), before);
});

test('two queued tab saves both survive; draft edits use the latest saved deck list', async () => {
  const { a, b, get } = setup();
  await Promise.all([
    a.changeDecks((decks) => addSavedDeck(decks, { ...draft, name: 'A' })),
    b.changeDecks((decks) => addSavedDeck(decks, { ...draft, name: 'B' })),
  ]);
  const result = await b.changeDraft(draftKey(draft), {
    ...draft,
    name: '編集B',
  });
  assert.equal(result.conflict, false);
  assert.deepEqual(
    get()
      .decks.map((d) => d.name)
      .sort(),
    ['A', 'B', '既存デッキ'].sort(),
  );
  assert.equal(get().draft.name, '編集B');
});

test('stale drafts cannot overwrite another tab, including simultaneous edits', async () => {
  const { a, b, get } = setup();
  const [left, right] = await Promise.all([
    a.changeDraft(draftKey(draft), { ...draft, name: 'A' }),
    b.changeDraft(draftKey(draft), { ...draft, name: 'B' }),
  ]);
  assert.equal(left.conflict, false);
  assert.equal(right.conflict, true);
  assert.equal(get().draft.name, 'A');
  assert.equal(right.snapshot.draft.name, 'A');
  await b.changeDecks((decks) =>
    addSavedDeck(decks, { ...draft, name: 'Bの退避' }, true),
  );
  assert.equal(get().draft.name, 'A');
  assert.ok(get().decks.some((d) => d.name === 'Bの退避'));
});

test('a stale tab cannot resurrect a deleted saved deck', async () => {
  const { a, b, get } = setup();
  await a.changeDecks(() => ({ decks: [], value: true }));
  await b.changeDraft(draftKey(draft), { ...draft, name: '変更' });
  assert.deepEqual(get().decks, []);
});

test('name uniqueness is checked against the current archive inside the lock', async () => {
  const { a, b, get } = setup();
  await a.changeDecks((decks) =>
    addSavedDeck(decks, { ...draft, name: '新規' }),
  );
  await assert.rejects(
    b.changeDecks((decks) => addSavedDeck(decks, { ...draft, name: '新規' })),
    /同名/,
  );
  await assert.rejects(
    b.changeDecks((decks) => ({
      decks: renameDeck(decks, 'saved', '新規'),
      value: true,
    })),
    /同名/,
  );
  assert.equal(get().decks.length, 2);
});

test('failed reads and unsupported data never get overwritten', async () => {
  for (const raw of ['{broken', '{"version":99,"decks":[]}']) {
    const { a, port } = setup();
    port.write(raw);
    await assert.rejects(
      a.changeDraft(draftKey(draft), draft),
      ArchiveReadError,
    );
    await assert.rejects(
      a.changeDecks((decks) => ({ decks, value: true })),
      ArchiveReadError,
    );
    assert.equal(port.read(), raw);
  }
});

test('write errors reject the operation without reporting an updated snapshot', async () => {
  const { port, get } = setup();
  const before = get();
  const repo = createArchiveRepository(
    {
      ...port,
      write: () => {
        throw new Error('quota');
      },
    },
    draft,
  );
  await assert.rejects(
    repo.changeDecks((decks) => addSavedDeck(decks, { ...draft, name: 'new' })),
    /quota/,
  );
  assert.deepEqual(get(), before);
});

test('v1 migration retains saved decks and treats regenerated draft IDs as the same content', async () => {
  const { a, get } = setup({ version: 1, decks: [saved, draft] });
  const first = a.read();
  assert.equal(first.status, 'ready');
  const result = await a.changeDraft(draftKey(first.draft), {
    ...first.draft,
    name: '移行後',
  });
  assert.equal(result.conflict, false);
  assert.equal(get().version, 2);
  assert.deepEqual(get().decks, [saved]);
  assert.equal(get().draft.name, '移行後');
});

test('conflict copies receive a unique name without overwriting saved decks', async () => {
  const { a, get } = setup();
  await a.changeDecks((decks) =>
    addSavedDeck(decks, { ...draft, name: saved.name }, true),
  );
  assert.deepEqual(
    get().decks.map((d) => d.name),
    ['既存デッキ (2)', '既存デッキ'],
  );
});
