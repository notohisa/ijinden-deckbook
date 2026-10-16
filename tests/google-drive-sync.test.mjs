import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDriveClient,
  GoogleDriveSyncError,
} from '../lib/google-drive-sync.ts';

function snapshot(writerId, records = []) {
  return {
    format: 'ijinden-deckbook-sync',
    version: 1,
    writerId,
    records,
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function streamedResponse(
  chunks,
  { headers, onCancel, keepOpen = false } = {},
) {
  let index = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (index < chunks.length) controller.enqueue(chunks[index++]);
        else if (!keepOpen) controller.close();
      },
      cancel(reason) {
        onCancel?.(reason);
      },
    }),
    { headers },
  );
}

function paddedSnapshotBytes(size) {
  const writerId = 'writer-a';
  const value = snapshot(writerId, [
    {
      id: 'deck-a',
      clock: { [writerId]: 1 },
      state: 'active',
      deck: {
        id: 'deck-a',
        name: '雪のデッキ',
        main: {},
        side: {},
        updatedAt: '2026-01-01T00:00:00.000Z',
        isSaved: true,
      },
    },
  ]);
  const jsonBytes = new TextEncoder().encode(JSON.stringify(value));
  assert.ok(jsonBytes.byteLength <= size);
  const bytes = new Uint8Array(size);
  bytes.set(jsonBytes);
  bytes.fill(0x20, jsonBytes.byteLength);
  return bytes;
}

function listedFile(id, writerId) {
  return {
    id,
    name: `ijinden-deckbook-sync-v1-${writerId}.json`,
    mimeType: 'application/json',
  };
}

function assertBearer(init) {
  assert.equal(
    new Headers(init.headers).get('Authorization'),
    'Bearer test-token',
  );
}

test('reads every page and every duplicate same-writer snapshot', async () => {
  const requests = [];
  const contents = new Map([
    ['a-1', snapshot('writer-a', [])],
    ['a-2', snapshot('writer-a', [])],
    ['b-1', snapshot('writer-b', [])],
  ]);
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    assertBearer(init);
    if (url.pathname === '/drive/v3/files') {
      if (url.searchParams.get('pageToken') === 'page-2') {
        return jsonResponse({ files: [listedFile('b-1', 'writer-b')] });
      }
      return jsonResponse({
        files: [listedFile('a-2', 'writer-a'), listedFile('a-1', 'writer-a')],
        nextPageToken: 'page-2',
      });
    }
    const id = decodeURIComponent(url.pathname.split('/').at(-1));
    return new Response(JSON.stringify(contents.get(id)), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const client = createDriveClient('test-token', fetcher);
  const result = await client.readAll(new Set(['01-001']));

  assert.equal(result.snapshots.length, 3);
  assert.equal(result.files.length, 3);
  assert.deepEqual(
    result.files.map(({ id, writerId }) => `${writerId}:${id}`),
    ['writer-a:a-1', 'writer-a:a-2', 'writer-b:b-1'],
  );
  const listRequests = requests.filter(
    ({ url }) => url.pathname === '/drive/v3/files',
  );
  assert.equal(listRequests.length, 2);
  assert.equal(listRequests[0].url.searchParams.get('spaces'), 'appDataFolder');
  assert.match(
    listRequests[0].url.searchParams.get('q'),
    /ijinden-deckbook-sync-/u,
  );
  assert.equal(listRequests[1].url.searchParams.get('pageToken'), 'page-2');
  assert.equal(
    requests.filter(({ url }) => url.searchParams.get('alt') === 'media')
      .length,
    3,
  );
});

test('creates a fresh snapshot before deleting only previously observed own files', async () => {
  const requests = [];
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    assertBearer(init);
    if (url.pathname === '/drive/v3/files') {
      return jsonResponse({
        files: [
          listedFile('a-1', 'writer-a'),
          listedFile('a-2', 'writer-a'),
          listedFile('b-1', 'writer-b'),
        ],
      });
    }
    if (url.pathname === '/upload/drive/v3/files') {
      assert.equal(init.method, 'POST');
      return jsonResponse({ id: 'a-new' });
    }
    if (init.method === 'DELETE') {
      const id = decodeURIComponent(url.pathname.split('/').at(-1));
      if (id === 'a-1') {
        return jsonResponse(
          { error: { errors: [{ reason: 'internalError' }] } },
          500,
        );
      }
      return new Response(null, { status: 204 });
    }
    const id = decodeURIComponent(url.pathname.split('/').at(-1));
    return new Response(
      JSON.stringify(snapshot(id.startsWith('b-') ? 'writer-b' : 'writer-a')),
    );
  };
  const client = createDriveClient('test-token', fetcher);
  const result = await client.readAll();
  requests.length = 0;

  await client.write(snapshot('writer-a'), result.files);
  const writes = requests.filter(({ init }) => init.method === 'POST');
  const deletes = requests.filter(({ init }) => init.method === 'DELETE');
  assert.equal(requests.length, 3);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].url.pathname, '/upload/drive/v3/files');
  assert.deepEqual(
    deletes
      .map(({ url }) => decodeURIComponent(url.pathname.split('/').at(-1)))
      .sort(),
    ['a-1', 'a-2'],
  );
  assert.ok(writes[0].init.body.includes('"writerId":"writer-a"'));
  assert.ok(
    deletes.every(({ url }) => url.pathname.startsWith('/drive/v3/files/')),
  );
  assert.ok(!deletes.some(({ url }) => url.pathname.endsWith('/b-1')));
  assert.ok(
    requests.findIndex(({ init }) => init.method === 'POST') <
      requests.findIndex(({ init }) => init.method === 'DELETE'),
  );

  await assert.rejects(
    client.write(snapshot('writer-a'), [
      {
        ...result.files.find(({ writerId }) => writerId === 'writer-a'),
        writerId: 'writer-b',
      },
    ]),
    /読み取り済み/u,
  );
});

test('an unknown or failed create response never triggers old-file deletion', async () => {
  let deleteRequests = 0;
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    assertBearer(init);
    if (url.pathname === '/drive/v3/files' && init.method === 'GET') {
      return jsonResponse({ files: [listedFile('a-old', 'writer-a')] });
    }
    if (url.pathname === '/drive/v3/files/a-old' && init.method === 'GET') {
      return new Response(JSON.stringify(snapshot('writer-a')));
    }
    if (init.method === 'POST')
      throw new TypeError('connection dropped after request');
    if (init.method === 'DELETE') deleteRequests += 1;
    return new Response(null, { status: 204 });
  };
  const client = createDriveClient('test-token', fetcher);
  const result = await client.readAll();
  await assert.rejects(
    client.write(snapshot('writer-a'), result.files),
    /接続/u,
  );
  assert.equal(deleteRequests, 0);
});

test('creates a new appDataFolder file when the current writer has no file', async () => {
  const requests = [];
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    assertBearer(init);
    if (url.pathname === '/drive/v3/files') return jsonResponse({ files: [] });
    assert.equal(url.pathname, '/upload/drive/v3/files');
    assert.equal(init.method, 'POST');
    assert.match(
      new Headers(init.headers).get('Content-Type'),
      /multipart\/related/u,
    );
    assert.match(init.body, /"parents":\["appDataFolder"\]/u);
    assert.match(init.body, /ijinden-deckbook-sync-v1-writer-a\.json/u);
    return jsonResponse({ id: 'created-id' }, 200);
  };
  const client = createDriveClient('test-token', fetcher);
  const result = await client.readAll();
  await client.write(snapshot('writer-a'), result.files);
  assert.equal(requests.length, 2);
});

test('a failed file read rejects the whole operation instead of returning an empty account', async () => {
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    assertBearer(init);
    if (url.pathname === '/drive/v3/files') {
      return jsonResponse({ files: [listedFile('broken-file', 'writer-a')] });
    }
    return jsonResponse(
      { error: { errors: [{ reason: 'rateLimitExceeded' }] } },
      429,
    );
  };
  const client = createDriveClient('test-token', fetcher);
  await assert.rejects(client.readAll(), (error) => {
    assert.ok(error instanceof GoogleDriveSyncError);
    assert.match(error.message, /利用上限/u);
    return true;
  });
});

test('malformed snapshots and newer named formats stop synchronization', async (t) => {
  await t.test('malformed JSON', async () => {
    const fetcher = async (input, init) => {
      const url = new URL(String(input));
      assertBearer(init);
      if (url.pathname === '/drive/v3/files') {
        return jsonResponse({ files: [listedFile('broken-file', 'writer-a')] });
      }
      return new Response('{broken');
    };
    await assert.rejects(
      createDriveClient('test-token', fetcher).readAll(),
      /壊れている/u,
    );
  });

  await t.test('newer filename format', async () => {
    const fetcher = async (input, init) => {
      assertBearer(init);
      return jsonResponse({
        files: [
          {
            id: 'future-file',
            name: 'ijinden-deckbook-sync-v2-writer-future.json',
            mimeType: 'application/json',
          },
        ],
      });
    };
    await assert.rejects(
      createDriveClient('test-token', fetcher).readAll(),
      /新しい形式/u,
    );
  });
});

test('401 authentication and 403 storage errors have clear messages', async (t) => {
  await t.test('401', async () => {
    const fetcher = async () =>
      jsonResponse({ error: { errors: [{ reason: 'authError' }] } }, 401);
    await assert.rejects(
      createDriveClient('test-token', fetcher).readAll(),
      /有効期限/u,
    );
  });

  await t.test('storage full', async () => {
    const fetcher = async () =>
      jsonResponse(
        { error: { errors: [{ reason: 'storageQuotaExceeded' }] } },
        403,
      );
    await assert.rejects(
      createDriveClient('test-token', fetcher).readAll(),
      (error) => {
        assert.ok(error instanceof GoogleDriveSyncError);
        assert.equal(error.message, 'Google Driveの保存容量が不足しています。');
        return true;
      },
    );
  });
});

test('file size limits reject oversized responses and writes', async (t) => {
  await t.test('oversized remote file', async () => {
    const fetcher = async (input, init) => {
      const url = new URL(String(input));
      assertBearer(init);
      if (url.pathname === '/drive/v3/files') {
        return jsonResponse({ files: [listedFile('large-file', 'writer-a')] });
      }
      return new Response('x', {
        headers: { 'Content-Length': String(3 * 1024 * 1024) },
      });
    };
    await assert.rejects(
      createDriveClient('test-token', fetcher).readAll(),
      /サイズ上限/u,
    );
  });

  await t.test('oversized outbound snapshot', async () => {
    const client = createDriveClient('test-token', async () => {
      assert.fail('Oversized data must be rejected before network access');
    });
    const records = Array.from({ length: 20_000 }, (_, index) => ({
      id: `deck-${index}`,
      clock: { 'writer-a': 1 },
      state: 'purged',
      trashedAt: '2026-01-01T00:00:00.000Z',
      trashSyncedAt: '2026-01-01T00:00:00.000Z',
    }));
    await assert.rejects(
      client.write(snapshot('writer-a', records), []),
      /上限/u,
    );
  });
});

test('streamed Drive reads enforce actual per-file and aggregate byte limits', async (t) => {
  const fileLimit = 2 * 1024 * 1024;
  const totalLimit = 10 * 1024 * 1024;

  await t.test(
    'accepts the exact file limit and decodes split UTF-8',
    async () => {
      const bytes = paddedSnapshotBytes(fileLimit);
      const text = JSON.stringify(
        snapshot('writer-a', [
          {
            id: 'deck-a',
            clock: { 'writer-a': 1 },
            state: 'active',
            deck: {
              id: 'deck-a',
              name: '雪のデッキ',
              main: {},
              side: {},
              updatedAt: '2026-01-01T00:00:00.000Z',
              isSaved: true,
            },
          },
        ]),
      );
      const snowOffset = new TextEncoder().encode(
        text.slice(0, text.indexOf('雪')),
      ).byteLength;
      const fetcher = async (input, init) => {
        const url = new URL(String(input));
        assertBearer(init);
        if (url.pathname === '/drive/v3/files') {
          return jsonResponse({ files: [listedFile('boundary', 'writer-a')] });
        }
        return streamedResponse(
          [bytes.slice(0, snowOffset + 1), bytes.slice(snowOffset + 1)],
          { headers: { 'content-length': String(fileLimit) } },
        );
      };

      const result = await createDriveClient('test-token', fetcher).readAll();
      assert.equal(result.snapshots[0].records[0].deck.name, '雪のデッキ');
    },
  );

  await t.test(
    'cancels an over-limit stream despite understated content length',
    async () => {
      let cancelled = false;
      const bytes = paddedSnapshotBytes(fileLimit + 1);
      const fetcher = async (input, init) => {
        const url = new URL(String(input));
        assertBearer(init);
        if (url.pathname === '/drive/v3/files') {
          return jsonResponse({ files: [listedFile('too-large', 'writer-a')] });
        }
        return streamedResponse(
          [bytes.slice(0, fileLimit), bytes.slice(fileLimit)],
          {
            headers: { 'content-length': '1' },
            keepOpen: true,
            onCancel: () => {
              cancelled = true;
            },
          },
        );
      };

      await assert.rejects(
        createDriveClient('test-token', fetcher).readAll(),
        /サイズ上限/u,
      );
      assert.equal(cancelled, true);
    },
  );

  await t.test(
    'accepts exactly 10 MiB across files and cancels above it',
    async (t) => {
      const bytes = paddedSnapshotBytes(fileLimit);
      const createFetcher = (
        fileCount,
        { onCancel = () => {}, keepOpenFileId } = {},
      ) => {
        const files = Array.from({ length: fileCount }, (_, index) =>
          listedFile(`file-${index}`, 'writer-a'),
        );
        return async (input, init) => {
          const url = new URL(String(input));
          assertBearer(init);
          if (url.pathname === '/drive/v3/files') {
            return jsonResponse({ files });
          }
          const fileId = decodeURIComponent(url.pathname.split('/').at(-1));
          return streamedResponse([bytes], {
            keepOpen: fileId === keepOpenFileId,
            onCancel,
          });
        };
      };

      await t.test('exact aggregate boundary', async () => {
        const result = await createDriveClient(
          'test-token',
          createFetcher(totalLimit / fileLimit),
        ).readAll();
        assert.equal(result.snapshots.length, totalLimit / fileLimit);
      });

      await t.test('aggregate overflow', async () => {
        let cancelled = 0;
        await assert.rejects(
          createDriveClient(
            'test-token',
            createFetcher(totalLimit / fileLimit + 1, {
              keepOpenFileId: 'file-5',
              onCancel: () => {
                cancelled += 1;
              },
            }),
          ).readAll(),
          /合計.*上限/u,
        );
        assert.ok(cancelled > 0);
      });
    },
  );
});
