import type { AppCard, DeckImportParseResult, Pile } from '@/app/types/deck';
import { migrateCardIdsInPile } from './card-id-migration.ts';
import { legacyDeckTextNames } from '../data/legacy-deck-text-names.ts';

const MAX_TEXT_LENGTH = 400_000;
const MAX_TOTAL_CARDS = 1_000;

export type DeckTextImportChoice = {
  key: string;
  name: string;
  candidates: AppCard[];
};

export class DeckTextImportAmbiguityError extends Error {
  readonly choices: DeckTextImportChoice[];

  constructor(choices: DeckTextImportChoice[]) {
    super('同名カードが複数あります。取り込む収録版を選んでください。');
    this.name = 'DeckTextImportAmbiguityError';
    this.choices = choices;
  }
}

type TextRow = {
  pile: Pile;
  name: string;
  cardId?: string;
  count: number;
  line: number;
};

function normalizeName(name: string): string {
  return name.normalize('NFKC').replace(/\s+/g, '');
}

function lineError(line: number, message: string): Error {
  return new Error(String(line) + '行目：' + message);
}

function readCount(raw: string, line: number, allowZero = false): number {
  const normalized = raw.normalize('NFKC').trim();
  const count = Number(normalized);
  if (
    !/^\d+$/.test(normalized) ||
    !Number.isSafeInteger(count) ||
    count < (allowZero ? 0 : 1)
  ) {
    throw lineError(
      line,
      '枚数は' + (allowZero ? '0' : '1') + '以上の整数で指定してください。',
    );
  }
  if (count > MAX_TOTAL_CARDS)
    throw lineError(line, '取り込めるカードは合計1000枚までです。');
  return count;
}

function parseRows(source: string): { rows: TextRow[]; title: string } {
  const lines = source.replace(/^\uFEFF/, '').split(/\r\n?|\n/);
  const rows: TextRow[] = [];
  const expected: Partial<Record<Pile, number>> = {};
  let pile: Pile | null = null;
  let title = '';
  let titleSeen = false;
  let format: 'tsv' | 'list' | null = null;

  lines.forEach((original, index) => {
    const line = index + 1;
    const text = original.trim();
    if (!text) return;
    const cells = original.split('\t').map((cell) => cell.trim());
    const tabHeader =
      cells.length === 2 && /^(メイン|サイド)デッキ$/.test(cells[0]);
    const listHeader = text.match(
      /^(メイン|サイド)デッキ[（(]([0-9０-９]+)枚[）)]$/,
    );
    if (tabHeader || listHeader) {
      const nextFormat = tabHeader ? 'tsv' : 'list';
      if (format && format !== nextFormat)
        throw lineError(line, '異なるテキスト形式が混在しています。');
      format = nextFormat;
      const title = tabHeader ? cells[0] : listHeader![1];
      pile = title.startsWith('メイン') ? 'main' : 'side';
      if (expected[pile] !== undefined)
        throw lineError(
          line,
          'デッキの見出しが重複しています。1デッキ分ずつ貼り付けてください。',
        );
      expected[pile] = readCount(
        tabHeader ? cells[1] : listHeader![2],
        line,
        true,
      );
      return;
    }
    if (pile === null) {
      if (!titleSeen && !original.includes('\t')) {
        title = text;
        titleSeen = true;
        return;
      }
      throw lineError(
        line,
        'メインデッキ・サイドデッキの見出しから、テキスト全体を貼り付けてください。',
      );
    }
    if (format === 'list' && text === 'なし') {
      if (expected[pile] !== 0)
        throw lineError(line, '「なし」と見出しの枚数が一致していません。');
      return;
    }
    if (format === 'tsv') {
      if (cells.length !== 2 || !cells[0])
        throw lineError(
          line,
          'カード名と枚数をタブで区切った行を確認してください。',
        );
      rows.push({
        pile,
        name: cells[0],
        count: readCount(cells[1], line),
        line,
      });
    } else {
      const match = text.match(/^-\s+(.+)（([^（）]+)）\s*×\s*([0-9０-９]+)$/);
      if (!match)
        throw lineError(
          line,
          'カード名・カードID・枚数の行を確認してください。',
        );
      rows.push({
        pile,
        name: match[1].trim(),
        cardId: match[2].trim(),
        count: readCount(match[3], line),
        line,
      });
    }
  });

  for (const key of ['main', 'side'] as const) {
    const label = key === 'main' ? 'メインデッキ' : 'サイドデッキ';
    if (expected[key] === undefined)
      throw new Error(
        label +
          'の見出しがありません。コピーしたテキスト全体を貼り付けてください。',
      );
    const total = rows
      .filter((row) => row.pile === key)
      .reduce((sum, row) => sum + row.count, 0);
    if (total !== expected[key])
      throw new Error(
        label +
          'の合計が一致しません。見出しは' +
          expected[key] +
          '枚、カード行は' +
          total +
          '枚です。',
      );
  }
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  if (total === 0)
    throw new Error(
      'カードがありません。カードを含むデッキをコピーしてください。',
    );
  if (total > MAX_TOTAL_CARDS)
    throw new Error('取り込めるカードは合計1000枚までです。');
  return { rows, title };
}

/** Reads the original builder's two-column TSV or this app's ID-bearing list. */
export function parseDeckTextImport(
  source: string,
  cards: readonly AppCard[],
  requestedName = '',
  selections: Readonly<Record<string, string>> = {},
): DeckImportParseResult {
  if (source.length > MAX_TEXT_LENGTH)
    throw new Error('テキストは40万文字以内にしてください。');
  if (!source.trim()) throw new Error('テキストを貼り付けてください。');
  const { rows, title } = parseRows(source);
  const name = requestedName.trim() || title.trim();
  if (Array.from(name).length > 200)
    throw new Error('デッキ名は200文字以内にしてください。');
  const byId = new Map(cards.map((card) => [card.id, card]));
  const byName = new Map<string, AppCard[]>();
  for (const card of cards) {
    const key = normalizeName(card.name);
    byName.set(key, [...(byName.get(key) ?? []), card]);
  }
  const main = new Map<string, number>();
  const side = new Map<string, number>();
  const choices = new Map<string, DeckTextImportChoice>();
  for (const row of rows) {
    let selected: AppCard | undefined;
    if (row.cardId) {
      const migrated = migrateCardIdsInPile({ [row.cardId]: 1 });
      const id = migrated && Object.keys(migrated)[0];
      selected = id ? byId.get(id) : undefined;
      if (!selected)
        throw lineError(
          row.line,
          'カードID「' + row.cardId.slice(0, 80) + '」が登録されていません。',
        );
      if (normalizeName(selected.name) !== normalizeName(row.name))
        throw lineError(row.line, 'カード名とカードIDが一致していません。');
    } else {
      const key = normalizeName(row.name);
      const legacyId = legacyDeckTextNames.get(key);
      if (legacyId) {
        selected = byId.get(legacyId);
        if (!selected)
          throw lineError(
            row.line,
            'このカードは現在のカード一覧にありません。サイトを更新してから試してください。',
          );
      } else {
        const candidates = byName.get(key) ?? [];
        if (candidates.length === 0)
          throw lineError(
            row.line,
            '「' +
              row.name.slice(0, 80) +
              '」が見つかりません。名前を確認してください。',
          );
        if (candidates.length === 1) selected = candidates[0];
        else {
          const selection = Object.hasOwn(selections, key)
            ? selections[key]
            : undefined;
          selected = candidates.find((card) => card.id === selection);
          if (!selected) {
            choices.set(key, { key, name: row.name, candidates });
            continue;
          }
        }
      }
    }
    const target = row.pile === 'main' ? main : side;
    target.set(selected.id, (target.get(selected.id) ?? 0) + row.count);
  }
  if (choices.size > 0)
    throw new DeckTextImportAmbiguityError([...choices.values()]);
  const id = crypto.randomUUID();
  const createdAt = new Date();
  return {
    decks: [
      {
        id,
        name:
          name ||
          'テキストから作成 ' +
            new Intl.DateTimeFormat('ja-JP', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hourCycle: 'h23',
            }).format(createdAt) +
            ' ' +
            id.slice(0, 4),
        main: Object.fromEntries(main),
        side: Object.fromEntries(side),
        updatedAt: createdAt.toISOString(),
        isSaved: false,
      },
    ],
    invalidDecks: [],
    totalCount: 1,
  };
}
