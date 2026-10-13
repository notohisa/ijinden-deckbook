import type { Deck } from '../app/types/deck.ts';

export type SyncRecord = {
  id: string;
  clock: Record<string, number>;
  state: 'active' | 'trash' | 'purged';
  deck?: Deck;
  trashedAt?: string;
  trashSyncedAt?: string;
};

export type SyncConflict = { id: string; candidates: SyncRecord[] };

export type SyncSnapshot = {
  format: 'ijinden-deckbook-sync';
  version: 1;
  writerId: string;
  records: SyncRecord[];
};

const FORMAT = 'ijinden-deckbook-sync';
const MAX_RECORDS = 20_000;
const MAX_PILE_CARDS = 10_000;
const MAX_CLOCK_WRITERS = 1_000;
const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function isObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
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

function assertKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${label}に未対応の項目「${key}」があります。`);
    }
  }
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    !hasControlCharacters(value) &&
    !DANGEROUS_KEYS.has(value)
  );
}

function assertIdentifier(
  value: unknown,
  label: string,
): asserts value is string {
  if (!isIdentifier(value)) throw new Error(`${label}が不正です。`);
}

function assertTimestamp(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 64 ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new Error(`${label}が不正な日時です。`);
  }
}

function cloneDeck(deck: Deck): Deck {
  return {
    id: deck.id,
    name: deck.name,
    main: { ...deck.main },
    side: { ...deck.side },
    updatedAt: deck.updatedAt,
    isSaved: true,
    ...(deck.color === undefined ? {} : { color: deck.color }),
  };
}

function validateDeck(
  value: unknown,
  recordId: string,
  knownCardIds?: ReadonlySet<string>,
): Deck {
  if (!isObject(value)) throw new Error('同期データのデッキ形式が不正です。');
  assertKeys(
    value,
    ['id', 'name', 'main', 'side', 'updatedAt', 'isSaved', 'color'],
    '同期データのデッキ',
  );
  if (value.id !== recordId) {
    throw new Error('同期データのデッキIDとレコードIDが一致しません。');
  }
  if (typeof value.name !== 'string' || value.name.length > 10_000) {
    throw new Error('同期データのデッキ名が不正です。');
  }
  assertTimestamp(value.updatedAt, '同期データの更新日時');
  if (value.isSaved !== undefined && value.isSaved !== true) {
    throw new Error('保存済みデッキ以外は同期できません。');
  }
  if (
    value.color !== undefined &&
    value.color !== 'default' &&
    value.color !== 'orange' &&
    value.color !== 'gray'
  ) {
    throw new Error('同期データに未対応のデッキ色があります。');
  }

  const parsePile = (pile: unknown, name: string): Record<string, number> => {
    if (!isObject(pile)) throw new Error(`同期データの${name}形式が不正です。`);
    const entries = Object.entries(pile);
    if (entries.length > MAX_PILE_CARDS) {
      throw new Error(`同期データの${name}のカード数が上限を超えています。`);
    }
    const result: Record<string, number> = {};
    for (const [cardId, count] of entries) {
      assertIdentifier(cardId, '同期データのカードID');
      if (!Number.isSafeInteger(count) || (count as number) <= 0) {
        throw new Error('同期データのカード枚数が不正です。');
      }
      if (knownCardIds && !knownCardIds.has(cardId)) {
        throw new Error(
          `同期データに未登録のカードID「${cardId}」があります。`,
        );
      }
      result[cardId] = count as number;
    }
    return result;
  };

  return {
    id: recordId,
    name: value.name,
    main: parsePile(value.main, 'メインデッキ'),
    side: parsePile(value.side, 'サイドデッキ'),
    updatedAt: value.updatedAt,
    isSaved: true,
    ...(value.color === undefined ? {} : { color: value.color }),
  };
}

function normalizeRecord(
  value: unknown,
  knownCardIds?: ReadonlySet<string>,
): SyncRecord {
  if (!isObject(value)) throw new Error('同期データのレコード形式が不正です。');
  assertKeys(
    value,
    ['id', 'clock', 'state', 'deck', 'trashedAt', 'trashSyncedAt'],
    '同期データのレコード',
  );
  assertIdentifier(value.id, '同期データのレコードID');
  if (!isObject(value.clock))
    throw new Error('同期データの変更履歴が不正です。');
  const clockEntries = Object.entries(value.clock);
  if (clockEntries.length === 0 || clockEntries.length > MAX_CLOCK_WRITERS) {
    throw new Error('同期データの変更履歴が不正です。');
  }
  const clock: Record<string, number> = {};
  for (const [writerId, counter] of clockEntries) {
    assertIdentifier(writerId, '同期データの端末ID');
    if (!Number.isSafeInteger(counter) || (counter as number) < 1) {
      throw new Error('同期データの変更履歴が不正です。');
    }
    clock[writerId] = counter as number;
  }
  if (
    value.state !== 'active' &&
    value.state !== 'trash' &&
    value.state !== 'purged'
  ) {
    throw new Error('同期データの状態が不正です。');
  }

  let deck: Deck | undefined;
  if (value.state === 'purged') {
    if (value.deck !== undefined) {
      throw new Error('削除済みレコードにデッキ内容が残っています。');
    }
    assertTimestamp(value.trashedAt, '同期データの削除日時');
    if (value.trashSyncedAt !== undefined) {
      assertTimestamp(value.trashSyncedAt, '同期データの同期確認日時');
    }
  } else {
    deck = validateDeck(value.deck, value.id, knownCardIds);
    if (value.state === 'active') {
      if (value.trashedAt !== undefined || value.trashSyncedAt !== undefined) {
        throw new Error('有効なデッキに削除情報が付いています。');
      }
    } else {
      assertTimestamp(value.trashedAt, '同期データの削除日時');
      if (value.trashSyncedAt !== undefined) {
        assertTimestamp(value.trashSyncedAt, '同期データの同期確認日時');
      }
    }
  }

  return {
    id: value.id,
    clock,
    state: value.state,
    ...(deck ? { deck } : {}),
    ...(value.trashedAt === undefined ? {} : { trashedAt: value.trashedAt }),
    ...(value.trashSyncedAt === undefined
      ? {}
      : { trashSyncedAt: value.trashSyncedAt }),
  };
}

export function validateSnapshot(
  value: unknown,
  knownCardIds?: ReadonlySet<string>,
): SyncSnapshot {
  if (!isObject(value)) throw new Error('Google Driveの同期データが不正です。');
  if (value.format !== FORMAT) {
    throw new Error('Google Driveに未対応の同期データ形式があります。');
  }
  if (
    typeof value.version !== 'number' ||
    !Number.isSafeInteger(value.version)
  ) {
    throw new Error('Google Driveの同期データのバージョンが不正です。');
  }
  if (value.version > 1) {
    throw new Error(
      'Google Driveの同期データは新しい形式です。アプリを更新してください。',
    );
  }
  if (value.version !== 1) {
    throw new Error('Google Driveの同期データのバージョンに対応していません。');
  }
  assertKeys(value, ['format', 'version', 'writerId', 'records'], '同期データ');
  assertIdentifier(value.writerId, '同期データの端末ID');
  if (!Array.isArray(value.records) || value.records.length > MAX_RECORDS) {
    throw new Error('Google Driveの同期データのレコード一覧が不正です。');
  }
  const records = value.records.map((record) =>
    normalizeRecord(record, knownCardIds),
  );
  const ids = new Set<string>();
  for (const record of records) {
    if (ids.has(record.id)) {
      throw new Error(
        `同期データに同じレコードID「${record.id}」が複数あります。`,
      );
    }
    ids.add(record.id);
  }
  return { format: FORMAT, version: 1, writerId: value.writerId, records };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function samePayload(left: SyncRecord, right: SyncRecord): boolean {
  if (left.state !== right.state) return false;
  if (left.state === 'purged') return true;
  if (left.state === 'trash' && left.trashedAt !== right.trashedAt) {
    return false;
  }
  return stableJson(left.deck) === stableJson(right.deck);
}

function earliestTimestamp(
  ...values: Array<string | undefined>
): string | undefined {
  const timestamps = values.filter(
    (value): value is string => value !== undefined,
  );
  if (timestamps.length === 0) return undefined;
  return timestamps.sort(
    (left, right) => Date.parse(left) - Date.parse(right),
  )[0];
}

function mergeEquivalent(left: SyncRecord, right: SyncRecord): SyncRecord {
  const clock = mergeClocks([left.clock, right.clock]);
  if (left.state === 'active') return { ...left, clock };
  if (left.state === 'trash') {
    const trashSyncedAt = earliestTimestamp(
      left.trashSyncedAt,
      right.trashSyncedAt,
    );
    return {
      ...left,
      clock,
      trashedAt: earliestTimestamp(left.trashedAt, right.trashedAt),
      ...(trashSyncedAt ? { trashSyncedAt } : {}),
    };
  }
  return {
    ...left,
    clock,
    trashedAt: earliestTimestamp(left.trashedAt, right.trashedAt),
    trashSyncedAt: earliestTimestamp(left.trashSyncedAt, right.trashSyncedAt),
  };
}

function mergeClocks(
  clocks: readonly Record<string, number>[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const clock of clocks) {
    for (const [writerId, counter] of Object.entries(clock)) {
      result[writerId] = Math.max(
        Object.hasOwn(result, writerId) ? result[writerId] : 0,
        counter,
      );
    }
  }
  if (Object.keys(result).length > MAX_CLOCK_WRITERS) {
    throw new Error('同期に参加した端末数が上限を超えています。');
  }
  return result;
}

function clockRelation(
  left: Record<string, number>,
  right: Record<string, number>,
): 'equal' | 'dominates' | 'dominated' | 'concurrent' {
  let leftGreater = false;
  let rightGreater = false;
  for (const writerId of new Set([
    ...Object.keys(left),
    ...Object.keys(right),
  ])) {
    const leftValue = Object.hasOwn(left, writerId) ? left[writerId] : 0;
    const rightValue = Object.hasOwn(right, writerId) ? right[writerId] : 0;
    if (leftValue > rightValue) leftGreater = true;
    else if (rightValue > leftValue) rightGreater = true;
  }
  if (leftGreater && rightGreater) return 'concurrent';
  if (leftGreater) return 'dominates';
  if (rightGreater) return 'dominated';
  return 'equal';
}

function compareRecords(left: SyncRecord, right: SyncRecord): number {
  const leftValue = stableJson(left);
  const rightValue = stableJson(right);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

export function mergeRecords(
  local: SyncRecord[],
  remotes: SyncRecord[][],
): { records: SyncRecord[]; conflicts: SyncConflict[] } {
  const groups = new Map<string, SyncRecord[]>();
  for (const raw of [...local, ...remotes.flat()]) {
    const record = normalizeRecord(raw);
    const group = groups.get(record.id) ?? [];
    group.push(record);
    groups.set(record.id, group);
  }

  const records: SyncRecord[] = [];
  const conflicts: SyncConflict[] = [];
  for (const id of Array.from(groups.keys()).sort()) {
    const unique: SyncRecord[] = [];
    for (const candidate of groups.get(id) ?? []) {
      const equivalentIndex = unique.findIndex((entry) =>
        samePayload(entry, candidate),
      );
      if (equivalentIndex >= 0) {
        unique[equivalentIndex] = mergeEquivalent(
          unique[equivalentIndex],
          candidate,
        );
      } else {
        unique.push(candidate);
      }
    }

    const maximal = unique.filter(
      (candidate, index) =>
        !unique.some(
          (other, otherIndex) =>
            index !== otherIndex &&
            clockRelation(other.clock, candidate.clock) === 'dominates',
        ),
    );
    maximal.sort(compareRecords);
    const purgedCandidates = unique.filter(
      (candidate) => candidate.state === 'purged',
    );
    const supersededPurged = purgedCandidates.some((purged) =>
      unique.some(
        (candidate) =>
          candidate.state !== 'purged' &&
          clockRelation(candidate.clock, purged.clock) === 'dominates',
      ),
    );
    const conflictCandidates = supersededPurged
      ? [...new Set([...purgedCandidates, ...maximal])].sort(compareRecords)
      : maximal;
    if (conflictCandidates.length > 1) {
      conflicts.push({
        id,
        candidates: conflictCandidates.map((record) => normalizeRecord(record)),
      });
    } else if (maximal.length === 1) {
      records.push(maximal[0]);
    }
  }
  return { records, conflicts };
}

function incrementClock(
  clocks: readonly Record<string, number>[],
  writerId: string,
): Record<string, number> {
  assertIdentifier(writerId, 'この端末のID');
  const clock = mergeClocks(clocks);
  const next = (Object.hasOwn(clock, writerId) ? clock[writerId] : 0) + 1;
  if (!Number.isSafeInteger(next))
    throw new Error('変更履歴の上限に達しました。');
  clock[writerId] = next;
  return clock;
}

function assertNow(now: string): void {
  assertTimestamp(now, '現在日時');
}

export function changeRecord(
  previous: SyncRecord | undefined,
  state: 'active' | 'trash' | 'purged',
  deck: Deck | undefined,
  writerId: string,
  now = new Date().toISOString(),
): SyncRecord {
  assertNow(now);
  const before = previous ? normalizeRecord(previous) : undefined;
  const id = before?.id ?? deck?.id;
  assertIdentifier(id, 'レコードID');
  if (before?.state === 'purged' && state !== 'purged') {
    throw new Error(
      '削除済みのデッキは復元できません。別IDで作成してください。',
    );
  }
  if (deck && deck.id !== id) throw new Error('デッキIDを変更できません。');
  const clock = incrementClock(before ? [before.clock] : [], writerId);

  if (state === 'active') {
    if (!deck) throw new Error('有効なデッキ内容が必要です。');
    return { id, clock, state, deck: cloneDeck(deck) };
  }
  if (state === 'trash') {
    if (!deck) throw new Error('削除待ちのデッキ内容が必要です。');
    const sameTrash = before?.state === 'trash';
    return {
      id,
      clock,
      state,
      deck: cloneDeck(deck),
      trashedAt: sameTrash ? before.trashedAt : now,
      ...(sameTrash && before.trashSyncedAt
        ? { trashSyncedAt: before.trashSyncedAt }
        : {}),
    };
  }
  if (deck) throw new Error('削除済みレコードにはデッキ内容を含められません。');
  if (!before || (before.state !== 'trash' && before.state !== 'purged')) {
    throw new Error('削除待ちのデッキだけを完全削除できます。');
  }
  return {
    id,
    clock,
    state: 'purged',
    trashedAt: before.trashedAt,
    ...(before.trashSyncedAt ? { trashSyncedAt: before.trashSyncedAt } : {}),
  };
}

function randomId(): string {
  const cryptoObject = globalThis.crypto;
  if (typeof cryptoObject?.randomUUID === 'function')
    return cryptoObject.randomUUID();
  if (typeof cryptoObject?.getRandomValues !== 'function') {
    throw new Error('新しいデッキIDを安全に作成できません。');
  }
  const bytes = cryptoObject.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function recordWithId(
  record: SyncRecord,
  id: string,
  clock: Record<string, number>,
): SyncRecord {
  const copy: SyncRecord = {
    ...record,
    id,
    clock: { ...clock },
    ...(record.deck ? { deck: { ...cloneDeck(record.deck), id } } : {}),
  };
  if (id !== record.id && record.state === 'trash') delete copy.trashSyncedAt;
  return copy;
}

function makeTombstone(
  id: string,
  candidates: SyncRecord[],
  clock: Record<string, number>,
): SyncRecord {
  const purged = candidates.find((candidate) => candidate.state === 'purged');
  const source = purged ?? candidates[0];
  const trashedAt = source.trashedAt;
  if (!trashedAt) {
    throw new Error('削除済みデータの削除日時を確認できません。');
  }
  return {
    id,
    clock: { ...clock },
    state: 'purged',
    trashedAt,
    ...(source.trashSyncedAt ? { trashSyncedAt: source.trashSyncedAt } : {}),
  };
}

export function resolveConflict(
  conflict: SyncConflict,
  choice: number | 'both',
  writerId: string,
): SyncRecord[] {
  assertIdentifier(conflict?.id, '競合レコードID');
  if (!Array.isArray(conflict.candidates) || conflict.candidates.length < 2) {
    throw new Error('解決する同期競合がありません。');
  }
  const candidates = conflict.candidates.map((candidate) =>
    normalizeRecord(candidate),
  );
  if (candidates.some((candidate) => candidate.id !== conflict.id)) {
    throw new Error('同期競合のレコードIDが一致しません。');
  }
  if (
    choice !== 'both' &&
    (!Number.isSafeInteger(choice) || choice < 0 || choice >= candidates.length)
  ) {
    throw new Error('競合の選択肢が不正です。');
  }
  assertIdentifier(writerId, 'この端末のID');
  const hasPurged = candidates.some(
    (candidate) => candidate.state === 'purged',
  );
  const mergedClock = mergeClocks(
    candidates.map((candidate) => candidate.clock),
  );
  const resolvedClock = incrementClock([mergedClock], writerId);

  if (hasPurged) {
    const tombstone = makeTombstone(conflict.id, candidates, resolvedClock);
    if (choice !== 'both') {
      const selected = candidates[choice];
      if (selected.state === 'purged') return [tombstone];
      const newId = randomId();
      return [tombstone, recordWithId(selected, newId, resolvedClock)];
    }
    const live = candidates.filter((candidate) => candidate.state !== 'purged');
    const copies = live.map((candidate) =>
      recordWithId(candidate, randomId(), resolvedClock),
    );
    return [tombstone, ...copies];
  }

  if (choice !== 'both') {
    return [recordWithId(candidates[choice], conflict.id, resolvedClock)];
  }
  const [first, ...rest] = candidates;
  return [
    recordWithId(first, conflict.id, resolvedClock),
    ...rest.map((candidate) =>
      recordWithId(candidate, randomId(), resolvedClock),
    ),
  ];
}

export function prepareForUpload(
  records: SyncRecord[],
  writerId: string,
  now = new Date().toISOString(),
): SyncRecord[] {
  assertNow(now);
  assertIdentifier(writerId, 'この端末のID');
  const nowMs = Date.parse(now);
  const seen = new Set<string>();
  return records.map((raw) => {
    const record = normalizeRecord(raw);
    if (seen.has(record.id)) {
      throw new Error('競合を解決してから同期してください。');
    }
    seen.add(record.id);
    if (record.state === 'trash' && !record.trashSyncedAt) {
      const stamped = changeRecord(record, 'trash', record.deck, writerId, now);
      return { ...stamped, trashSyncedAt: now };
    }
    if (
      record.state === 'trash' &&
      record.trashSyncedAt &&
      nowMs - Date.parse(record.trashSyncedAt) >= TRASH_RETENTION_MS
    ) {
      return changeRecord(record, 'purged', undefined, writerId, now);
    }
    return record;
  });
}
