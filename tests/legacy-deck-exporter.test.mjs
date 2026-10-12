import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import { LEGACY_EXPORT_BOOKMARKLET } from '../lib/legacy-deck-exporter.ts';

const expectedOrigin = 'https://sweetpotato.github.io';
const expectedPath = '/ijinden-deck-builder/';

function decodedSource() {
  assert.ok(LEGACY_EXPORT_BOOKMARKLET.startsWith('javascript:'));
  return decodeURIComponent(
    LEGACY_EXPORT_BOOKMARKLET.slice('javascript:'.length),
  );
}

async function runBookmarklet({
  location = { origin: expectedOrigin, pathname: expectedPath },
  indexedDB,
} = {}) {
  const alerts = [];
  const downloads = [];
  const objectUrls = [];
  const revocations = [];
  let clicked = 0;
  const anchor = {
    href: '',
    download: '',
    click() {
      clicked += 1;
    },
    remove() {},
  };
  const sandbox = {
    location,
    indexedDB,
    alert(message) {
      alerts.push(message);
    },
    Blob: class MockBlob {
      constructor(parts, options) {
        this.parts = parts;
        this.type = options.type;
        downloads.push(this);
      }
    },
    URL: {
      createObjectURL(blob) {
        objectUrls.push(blob);
        return 'blob:legacy-backup';
      },
      revokeObjectURL(url) {
        revocations.push(url);
      },
    },
    document: {
      body: {
        appendChild(value) {
          assert.equal(value, anchor);
        },
      },
      createElement(tag) {
        assert.equal(tag, 'a');
        return anchor;
      },
    },
    queueMicrotask,
    setTimeout(callback) {
      callback();
      return 1;
    },
  };

  vm.runInNewContext(decodedSource(), sandbox);
  await new Promise((resolve) => setTimeout(resolve, 10));
  return { alerts, downloads, objectUrls, revocations, anchor, clicked };
}

function openExistingDatabase(rows, options = {}) {
  const calls = [];
  const state = { closed: 0, mode: null, store: null };
  const database = {
    objectStoreNames: {
      contains(name) {
        return name === 'decks';
      },
    },
    transaction(storeName, mode) {
      calls.push(['transaction', storeName, mode]);
      state.mode = mode;
      const transaction = {};
      state.store = {
        getAll() {
          calls.push(['getAll']);
          const request = {};
          queueMicrotask(() => {
            if (options.readError) {
              request.onerror?.();
              return;
            }
            request.result = rows;
            request.onsuccess?.();
            queueMicrotask(() => transaction.oncomplete?.());
          });
          return request;
        },
      };
      transaction.objectStore = (name) => {
        calls.push(['objectStore', name]);
        return state.store;
      };
      return transaction;
    },
    close() {
      state.closed += 1;
    },
  };
  const indexedDB = {
    open(...args) {
      calls.push(['open', ...args]);
      const request = { result: database };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  };
  return { indexedDB, calls, state };
}

test('ブックマークレットはUTF-8とURI予約文字を安全にエンコードする', () => {
  const source = decodedSource();
  assert.match(source, /旧サイトのデッキ画面/);
  assert.match(source, /https:\/\/sweetpotato\.github\.io/);
  assert.match(LEGACY_EXPORT_BOOKMARKLET, /%E6%97%A7/);
  assert.equal(LEGACY_EXPORT_BOOKMARKLET.includes('#'), false);
});

test('許可外origin/pathではIndexedDBを開かない', async () => {
  for (const location of [
    { origin: 'https://example.com', pathname: expectedPath },
    { origin: expectedOrigin, pathname: '/another-page/' },
  ]) {
    let openCount = 0;
    const result = await runBookmarklet({
      location,
      indexedDB: {
        open() {
          openCount += 1;
        },
      },
    });

    assert.equal(openCount, 0);
    assert.equal(result.downloads.length, 0);
    assert.match(result.alerts[0], /旧サイト/);
  }
});

test('DB未作成時はupgrade transactionをabortして新DBを作らない', async () => {
  let openArgs;
  let aborted = 0;
  let succeeded = 0;
  const indexedDB = {
    open(...args) {
      openArgs = args;
      const request = {
        transaction: {
          abort() {
            aborted += 1;
            queueMicrotask(() => request.onerror?.());
          },
        },
      };
      queueMicrotask(() => request.onupgradeneeded?.());
      request.onsuccess = () => {
        succeeded += 1;
      };
      return request;
    },
  };
  const result = await runBookmarklet({ indexedDB });

  assert.deepEqual(openArgs, ['ijinden-deck-builder']);
  assert.equal(aborted, 1);
  assert.equal(succeeded, 0);
  assert.match(result.alerts[0], /保存データが見つかりませんでした/);
});

test('blocked後に遅れてopen成功した場合もDBを閉じてreadしない', async () => {
  let closed = 0;
  let transactionCount = 0;
  const database = {
    objectStoreNames: { contains: () => true },
    transaction() {
      transactionCount += 1;
      throw new Error('finished database should not be read');
    },
    close() {
      closed += 1;
    },
  };
  const indexedDB = {
    open() {
      const request = { result: database };
      queueMicrotask(() => {
        request.onblocked?.();
        queueMicrotask(() => request.onsuccess?.());
      });
      return request;
    },
  };
  const result = await runBookmarklet({ indexedDB });

  assert.equal(closed, 1);
  assert.equal(transactionCount, 0);
  assert.equal(result.downloads.length, 0);
  assert.equal(result.alerts.length, 1);
});

test('readonly getAllの全件をwrapper JSONとしてダウンロードしDBを閉じる', async () => {
  const rows = [
    { id: 7, title: '旧デッキ', timestamp: 123, main: [['1-1', 3]], side: [] },
    { id: 9, timestamp: 456, main: [], side: [['2nd1-2', 1]] },
  ];
  const db = openExistingDatabase(rows);
  const result = await runBookmarklet({ indexedDB: db.indexedDB });

  assert.deepEqual(db.calls[0], ['open', 'ijinden-deck-builder']);
  assert.equal(db.state.mode, 'readonly');
  assert.ok(db.calls.some((call) => call[0] === 'getAll'));
  assert.equal(db.state.closed, 1);
  assert.equal(result.clicked, 1);
  assert.equal(result.anchor.href, 'blob:legacy-backup');
  assert.match(
    result.anchor.download,
    /^ijinden-deck-builder-backup-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const payload = JSON.parse(result.downloads[0].parts[0]);
  assert.equal(payload.version, 1);
  assert.equal(payload.type, 'ijinden-deck-builder-backup');
  assert.ok(Number.isFinite(Date.parse(payload.exportedAt)));
  assert.deepEqual(payload.decks, rows);
  assert.equal(result.revocations[0], 'blob:legacy-backup');
  assert.match(result.alerts[0], /書き出しました/);
});

test('読み込み失敗時はDBを閉じてエラーを案内する', async () => {
  const db = openExistingDatabase([], { readError: true });
  const result = await runBookmarklet({ indexedDB: db.indexedDB });

  assert.equal(db.state.mode, 'readonly');
  assert.equal(db.state.closed, 1);
  assert.equal(result.downloads.length, 0);
  assert.match(result.alerts[0], /読み込めませんでした/);
});

test('デッキ0件ではJSONを作らず案内する', async () => {
  const db = openExistingDatabase([]);
  const result = await runBookmarklet({ indexedDB: db.indexedDB });

  assert.equal(db.state.closed, 1);
  assert.equal(result.downloads.length, 0);
  assert.match(result.alerts[0], /デッキがありません/);
});
