import { validateSnapshot, type SyncSnapshot } from './deck-sync.ts';

export type DriveSyncFile = { id: string; writerId: string };
export type DriveSyncReadResult = {
  snapshots: SyncSnapshot[];
  files: DriveSyncFile[];
};
export type DriveSyncClient = {
  readAll(knownCardIds?: ReadonlySet<string>): Promise<DriveSyncReadResult>;
  write(snapshot: SyncSnapshot, files: DriveSyncFile[]): Promise<void>;
};

const API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const FILE_PREFIX = 'ijinden-deckbook-sync-';
const SUPPORTED_PREFIX = 'ijinden-deckbook-sync-v1-';
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_READ_BYTES = 10 * 1024 * 1024;
const MAX_WRITERS = 100;
const MAX_FILES = 500;
const PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 20_000;
const READ_CONCURRENCY = 5;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) {
      return true;
    }
  }
  return false;
}

export class GoogleDriveSyncError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GoogleDriveSyncError';
    this.status = status;
  }
}

type ReadBudget = {
  bytesRead: number;
  controller: AbortController;
  readers: Set<ReadableStreamDefaultReader<Uint8Array>>;
  error?: GoogleDriveSyncError;
};

function abortReadBudget(
  budget: ReadBudget,
  error: GoogleDriveSyncError,
  body?: ReadableStream<Uint8Array> | null,
): GoogleDriveSyncError {
  if (!budget.error) {
    budget.error = error;
    budget.controller.abort(error);
  }
  for (const reader of budget.readers) {
    void reader.cancel(budget.error).catch(() => {});
  }
  if (body && !body.locked) void body.cancel(budget.error).catch(() => {});
  return budget.error;
}

async function readResponseText(
  response: Response,
  budget: ReadBudget,
): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  budget.readers.add(reader);
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let fileBytesRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const nextFileBytes = fileBytesRead + value.byteLength;
      if (nextFileBytes > MAX_FILE_BYTES) {
        throw abortReadBudget(
          budget,
          new GoogleDriveSyncError(
            'Google Driveの同期ファイルがサイズ上限を超えています。',
          ),
        );
      }
      const nextTotalBytes = budget.bytesRead + value.byteLength;
      if (nextTotalBytes > MAX_TOTAL_READ_BYTES) {
        throw abortReadBudget(
          budget,
          new GoogleDriveSyncError(
            'Google Driveから読み取る同期データの合計が上限を超えています。',
          ),
        );
      }
      fileBytesRead = nextFileBytes;
      budget.bytesRead = nextTotalBytes;
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  } catch (error) {
    if (budget.error) throw budget.error;
    if (error instanceof GoogleDriveSyncError) {
      throw abortReadBudget(budget, error);
    }
    throw new GoogleDriveSyncError(
      'Google Driveの同期ファイルを読み取れませんでした。',
      undefined,
      { cause: error },
    );
  } finally {
    budget.readers.delete(reader);
    try {
      reader.releaseLock();
    } catch {
      // A cancelled reader may already have released its lock.
    }
  }
}

function assertToken(accessToken: string): void {
  if (typeof accessToken !== 'string' || accessToken.trim().length === 0) {
    throw new GoogleDriveSyncError(
      'Google認証の有効期限が切れました。再接続してください。',
      401,
    );
  }
}

function errorForStatus(status: number, reason = ''): GoogleDriveSyncError {
  const normalizedReason = reason.toLowerCase();
  if (status === 401) {
    return new GoogleDriveSyncError(
      'Google認証の有効期限が切れました。再接続してください。',
      status,
    );
  }
  if (
    normalizedReason.includes('storagequota') ||
    normalizedReason.includes('storage_quota')
  ) {
    return new GoogleDriveSyncError(
      'Google Driveの保存容量が不足しています。',
      status,
    );
  }
  if (
    status === 429 ||
    normalizedReason.includes('ratelimit') ||
    normalizedReason.includes('quota')
  ) {
    return new GoogleDriveSyncError(
      'Google Driveの利用上限に達しました。時間をおいて再試行してください。',
      status,
    );
  }
  if (status === 403) {
    return new GoogleDriveSyncError(
      'Google Driveへのアクセスが拒否されました。権限を確認して再接続してください。',
      status,
    );
  }
  if (status >= 500) {
    return new GoogleDriveSyncError(
      'Google Driveで一時的なエラーが発生しました。時間をおいて再試行してください。',
      status,
    );
  }
  return new GoogleDriveSyncError(
    'Google Driveとの同期に失敗しました。時間をおいて再試行してください。',
    status,
  );
}

function isTimeoutError(error: unknown): boolean {
  return (
    (error instanceof DOMException &&
      (error.name === 'TimeoutError' || error.name === 'AbortError')) ||
    (error !== null &&
      typeof error === 'object' &&
      'name' in error &&
      ((error as { name?: unknown }).name === 'TimeoutError' ||
        (error as { name?: unknown }).name === 'AbortError'))
  );
}

function describeNetworkError(error: unknown): GoogleDriveSyncError {
  if (error instanceof GoogleDriveSyncError) return error;
  if (isTimeoutError(error)) {
    return new GoogleDriveSyncError(
      'Google Driveへの通信がタイムアウトしました。接続を確認して再試行してください。',
      undefined,
      { cause: error },
    );
  }
  return new GoogleDriveSyncError(
    'Google Driveに接続できませんでした。ネットワークを確認して再試行してください。',
    undefined,
    { cause: error },
  );
}

async function responseError(
  response: Response,
): Promise<GoogleDriveSyncError> {
  let reason = '';
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object') {
      const error = (body as { error?: unknown }).error;
      if (error && typeof error === 'object') {
        const errors = (error as { errors?: unknown }).errors;
        if (Array.isArray(errors)) {
          const first = errors.find(
            (item): item is { reason: string } =>
              item !== null &&
              typeof item === 'object' &&
              typeof (item as { reason?: unknown }).reason === 'string',
          );
          reason = first?.reason ?? '';
        }
        if (
          !reason &&
          typeof (error as { status?: unknown }).status === 'string'
        ) {
          reason = (error as { status: string }).status;
        }
      }
    }
  } catch {
    // The HTTP status is enough to choose a safe user-facing error.
  }
  return errorForStatus(response.status, reason);
}

function parseFileWriter(name: unknown): string {
  if (typeof name !== 'string' || !name.startsWith(FILE_PREFIX)) {
    throw new GoogleDriveSyncError(
      'Google Driveに不正な同期ファイル名があります。',
    );
  }
  const match = /^ijinden-deckbook-sync-v(\d+)-(.+)\.json$/u.exec(name);
  if (!match) {
    throw new GoogleDriveSyncError(
      'Google Driveに形式を確認できない同期ファイルがあります。',
    );
  }
  const version = Number(match[1]);
  if (!Number.isSafeInteger(version) || version > 1) {
    throw new GoogleDriveSyncError(
      'Google Driveの同期データは新しい形式です。アプリを更新してください。',
    );
  }
  if (version !== 1) {
    throw new GoogleDriveSyncError(
      'Google Driveの同期データ形式に対応していません。',
    );
  }
  const writerId = match[2];
  if (
    writerId.length > 256 ||
    hasControlCharacters(writerId) ||
    writerId.includes('/') ||
    writerId.includes('\\') ||
    writerId === '__proto__' ||
    writerId === 'constructor' ||
    writerId === 'prototype'
  ) {
    throw new GoogleDriveSyncError(
      'Google Driveに不正な端末IDの同期ファイルがあります。',
    );
  }
  return writerId;
}

function assertListFile(value: unknown): { id: string; name: string } {
  if (!value || typeof value !== 'object') {
    throw new GoogleDriveSyncError(
      'Google Driveのファイル一覧を読み取れませんでした。',
    );
  }
  const file = value as { id?: unknown; name?: unknown };
  if (
    typeof file.id !== 'string' ||
    file.id.length === 0 ||
    typeof file.name !== 'string'
  ) {
    throw new GoogleDriveSyncError(
      'Google Driveのファイル一覧に不正な項目があります。',
    );
  }
  return { id: file.id, name: file.name };
}

function fileName(writerId: string): string {
  return `${SUPPORTED_PREFIX}${writerId}.json`;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function createDriveClient(
  accessToken: string,
  fetcher: typeof fetch = fetch,
): DriveSyncClient {
  assertToken(accessToken);
  const knownFiles = new Map<string, string>();

  async function request(
    url: string,
    init: RequestInit = {},
  ): Promise<Response> {
    try {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${accessToken}`);
      const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const signal = init.signal
        ? AbortSignal.any([timeoutSignal, init.signal])
        : timeoutSignal;
      const response = await fetcher(url, {
        ...init,
        headers,
        signal,
      });
      if (!response.ok) throw await responseError(response);
      return response;
    } catch (error) {
      throw describeNetworkError(error);
    }
  }

  async function listFiles(): Promise<Array<{ id: string; writerId: string }>> {
    const matching: Array<{ id: string; writerId: string }> = [];
    const pageTokens = new Set<string>();
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({
        spaces: 'appDataFolder',
        pageSize: String(PAGE_SIZE),
        q: `name contains '${FILE_PREFIX}' and trashed = false`,
        orderBy: 'name',
        fields: 'nextPageToken,incompleteSearch,files(id,name,mimeType)',
      });
      if (pageToken) query.set('pageToken', pageToken);
      const response = await request(`${API_BASE}/files?${query}`, {
        method: 'GET',
      });
      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        throw new GoogleDriveSyncError(
          'Google Driveのファイル一覧の応答が不正です。',
          undefined,
          { cause: error },
        );
      }
      if (!body || typeof body !== 'object') {
        throw new GoogleDriveSyncError(
          'Google Driveのファイル一覧の応答が不正です。',
        );
      }
      const data = body as {
        files?: unknown;
        nextPageToken?: unknown;
        incompleteSearch?: unknown;
      };
      if (data.incompleteSearch === true) {
        throw new GoogleDriveSyncError(
          'Google Driveのファイル一覧が完全に取得できませんでした。',
        );
      }
      if (!Array.isArray(data.files)) {
        throw new GoogleDriveSyncError(
          'Google Driveのファイル一覧の応答が不正です。',
        );
      }
      for (const rawFile of data.files) {
        const file = assertListFile(rawFile);
        if (!file.name.startsWith(FILE_PREFIX)) continue;
        matching.push({ id: file.id, writerId: parseFileWriter(file.name) });
        if (matching.length > MAX_FILES) {
          throw new GoogleDriveSyncError(
            '同期ファイル数が上限を超えています。',
          );
        }
      }
      if (
        data.nextPageToken !== undefined &&
        typeof data.nextPageToken !== 'string'
      ) {
        throw new GoogleDriveSyncError('Google Driveのページ情報が不正です。');
      }
      pageToken = data.nextPageToken as string | undefined;
      if (pageToken) {
        if (pageTokens.has(pageToken)) {
          throw new GoogleDriveSyncError(
            'Google Driveのファイル一覧を最後まで取得できませんでした。',
          );
        }
        pageTokens.add(pageToken);
      }
      if (pageTokens.size > Math.ceil(MAX_FILES / PAGE_SIZE)) {
        throw new GoogleDriveSyncError('同期ファイル数が上限を超えています。');
      }
    } while (pageToken);

    const writers = new Set(matching.map((file) => file.writerId));
    if (writers.size > MAX_WRITERS) {
      throw new GoogleDriveSyncError(
        '同期に参加している端末数が上限を超えています。',
      );
    }
    matching.sort(
      (left, right) =>
        compareText(left.writerId, right.writerId) ||
        compareText(left.id, right.id),
    );
    return matching;
  }

  async function readFile(
    file: { id: string; writerId: string },
    budget: ReadBudget,
    knownCardIds?: ReadonlySet<string>,
  ): Promise<SyncSnapshot> {
    try {
      const response = await request(
        `${API_BASE}/files/${encodeURIComponent(file.id)}?alt=media`,
        { method: 'GET', signal: budget.controller.signal },
      );
      if (budget.error) throw budget.error;
      const contentLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > MAX_FILE_BYTES) {
        throw abortReadBudget(
          budget,
          new GoogleDriveSyncError(
            'Google Driveの同期ファイルがサイズ上限を超えています。',
          ),
          response.body,
        );
      }
      const text = await readResponseText(response, budget);
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch (error) {
        throw new GoogleDriveSyncError(
          'Google Driveの同期ファイルが壊れているため、安全のため同期を停止しました。',
          undefined,
          { cause: error },
        );
      }
      const snapshot = validateSnapshot(value, knownCardIds);
      if (snapshot.writerId !== file.writerId) {
        throw new GoogleDriveSyncError(
          'Google Driveの同期ファイルと端末IDが一致しません。',
        );
      }
      return snapshot;
    } catch (error) {
      if (budget.error) throw budget.error;
      const readError =
        error instanceof GoogleDriveSyncError
          ? error
          : error instanceof Error
            ? new GoogleDriveSyncError(error.message, undefined, {
                cause: error,
              })
            : new GoogleDriveSyncError(
                'Google Driveの同期ファイルを読み取れませんでした。',
                undefined,
                { cause: error },
              );
      throw abortReadBudget(budget, readError);
    }
  }

  return {
    async readAll(knownCardIds) {
      knownFiles.clear();
      const files = await listFiles();
      const budget: ReadBudget = {
        bytesRead: 0,
        controller: new AbortController(),
        readers: new Set(),
      };
      const snapshotsByIndex = new Map<number, SyncSnapshot>();
      let nextIndex = 0;
      const workers = Array.from(
        { length: Math.min(READ_CONCURRENCY, files.length) },
        async () => {
          while (true) {
            if (budget.error) throw budget.error;
            const index = nextIndex;
            nextIndex += 1;
            if (index >= files.length) return;
            snapshotsByIndex.set(
              index,
              await readFile(files[index], budget, knownCardIds),
            );
          }
        },
      );
      const workerResults = await Promise.allSettled(workers);
      if (budget.error) throw budget.error;
      const failedWorker = workerResults.find(
        (result) => result.status === 'rejected',
      );
      if (failedWorker?.status === 'rejected') throw failedWorker.reason;
      const snapshots: SyncSnapshot[] = [];
      for (let index = 0; index < files.length; index += 1) {
        const snapshot = snapshotsByIndex.get(index);
        if (!snapshot) {
          throw new GoogleDriveSyncError(
            'Google Driveの同期ファイルをすべて読み取れませんでした。',
          );
        }
        snapshots.push(snapshot);
      }
      knownFiles.clear();
      for (const file of files) knownFiles.set(file.id, file.writerId);
      return { snapshots, files };
    },

    async write(snapshotValue, fileValues) {
      const snapshot = validateSnapshot(snapshotValue);
      const writerId = snapshot.writerId;
      const files: DriveSyncFile[] = [];
      const seen = new Set<string>();
      for (const file of fileValues) {
        if (
          !file ||
          typeof file.id !== 'string' ||
          !file.id ||
          typeof file.writerId !== 'string'
        ) {
          throw new GoogleDriveSyncError('同期ファイルの指定が不正です。');
        }
        if (seen.has(file.id)) {
          throw new GoogleDriveSyncError(
            '同じ同期ファイルが複数指定されています。',
          );
        }
        seen.add(file.id);
        const observedWriterId = knownFiles.get(file.id);
        if (!observedWriterId || observedWriterId !== file.writerId) {
          throw new GoogleDriveSyncError(
            '読み取り済みの同期ファイル以外は更新できません。',
          );
        }
        if (file.writerId !== writerId) continue;
        files.push({ id: file.id, writerId });
      }

      const body = JSON.stringify(snapshot);
      if (utf8ByteLength(body) > MAX_FILE_BYTES) {
        throw new GoogleDriveSyncError(
          '同期データがサイズ上限を超えています。',
        );
      }
      const boundary = `ijinden_sync_${globalThis.crypto.randomUUID()}`;
      const metadata = {
        name: fileName(writerId),
        mimeType: 'application/json',
        parents: ['appDataFolder'],
      };
      const multipart =
        `--${boundary}\r\n` +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        `${body}\r\n` +
        `--${boundary}--`;
      const response = await request(
        `${UPLOAD_BASE}/files?uploadType=multipart&fields=id`,
        {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipart,
        },
      );
      let result: unknown;
      try {
        result = await response.json();
      } catch (error) {
        throw new GoogleDriveSyncError(
          'Google Driveへの保存結果を確認できませんでした。もう一度同期してください。',
          undefined,
          { cause: error },
        );
      }
      const createdId =
        result &&
        typeof result === 'object' &&
        typeof (result as { id?: unknown }).id === 'string'
          ? (result as { id: string }).id
          : '';
      if (!createdId) {
        throw new GoogleDriveSyncError(
          'Google Driveへの保存結果を確認できませんでした。もう一度同期してください。',
        );
      }
      knownFiles.set(createdId, writerId);

      // This is bounded garbage collection: only IDs observed by readAll are eligible.
      // A failed delete leaves harmless duplicate snapshots for the next full merge.
      for (const file of files) {
        if (file.id === createdId) continue;
        try {
          await request(`${API_BASE}/files/${encodeURIComponent(file.id)}`, {
            method: 'DELETE',
          });
          knownFiles.delete(file.id);
        } catch {
          // No retry: old and new snapshots are both safe to read and merge later.
        }
      }
    },
  };
}
