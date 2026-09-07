'use client';

import { type ReactNode, useMemo, useRef, useState } from 'react';
import type { AppCard, CardType, Deck, Pile } from '@/app/types/deck';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  effectProcessOptions,
  matchesEffectProcessFilters,
  type EffectProcessKey,
} from '@/lib/card-effect-processes';
import { cardTypes, countCards } from '@/lib/deck-utils';

type SortBy = 'official' | 'level' | 'power' | 'type' | 'color' | 'name';
type SortDirection = 'asc' | 'desc';

const colorOptions = ['赤', '青', '緑', '黄', '紫', '無'] as const;
const catalogColorTints: Record<string, string> = {
  赤: '#f9d2ca',
  青: '#d7e8f7',
  緑: '#d9eddf',
  黄: '#fff0bb',
  紫: '#e9dcf3',
  無: '#e8edf0',
};
const abilityKeywordOptions = [
  '剣術',
  '美術',
  '音楽',
  '思想',
  '医術',
  '志願',
  '航海',
  '執筆',
  '決起',
  '徴募',
  '魔導',
  '勝鬨',
  '躍進',
  '魔力化',
  '冥府発動',
  '復元',
  '反魂',
  '木霊',
  '喪神',
  '即応',
  'ダブルプレッシャー',
  'トリプルプレッシャー',
  'ドレイン',
  'ウォッチャー',
  'スタンド',
  'モータル',
  '消耗',
  '装備',
  '冥装',
];
const sortOptions: Array<{ value: SortBy; label: string }> = [
  { value: 'official', label: '公式順' },
  { value: 'level', label: 'レベル順' },
  { value: 'power', label: 'パワー順' },
  { value: 'type', label: '種類順' },
  { value: 'color', label: '色順' },
  { value: 'name', label: '名前順' },
];
const sortDirectionOptions: Array<{ value: SortDirection; label: string }> = [
  { value: 'asc', label: '昇順' },
  { value: 'desc', label: '降順' },
];

type Props = {
  cards: readonly AppCard[];
  activeDeck: Deck;
  onAdjustCard: (cardId: string, pile: Pile, difference: number) => void;
  onSelectCard: (cardId: string) => void;
};

export function CardCatalog({
  cards,
  activeDeck,
  onAdjustCard,
  onSelectCard,
}: Props) {
  const [query, setQuery] = useState('');
  const [queryDraft, setQueryDraft] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<CardType[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedRarities, setSelectedRarities] = useState<string[]>([]);
  const [selectedReleases, setSelectedReleases] = useState<string[]>([]);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [selectedEffectProcesses, setSelectedEffectProcesses] = useState<
    EffectProcessKey[]
  >([]);
  const maxCardLevel = useMemo(
    () => Math.max(17, ...cards.map((card) => card.level ?? 0)),
    [cards],
  );
  const powerFilterCeiling = useMemo(
    () =>
      Math.ceil(
        Math.max(
          10000,
          ...cards.map((card) =>
            card.cardType === 'イジン' ? (card.power ?? 0) : 0,
          ),
        ) / 500,
      ) * 500,
    [cards],
  );
  const [levelMin, setLevelMin] = useState(0);
  const [levelMax, setLevelMax] = useState(maxCardLevel);
  const [powerMin, setPowerMin] = useState(0);
  const [powerMax, setPowerMax] = useState(powerFilterCeiling);
  const [sortBy, setSortBy] = useState<SortBy>('official');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const isComposingQueryRef = useRef(false);
  const releaseOptions = useMemo(
    () => Array.from(new Set(cards.map((card) => card.release))),
    [cards],
  );
  const rarityOptions = useMemo(
    () =>
      Array.from(new Set(cards.map((card) => card.rarity))).sort(
        (a, b) =>
          ['N', 'm', 'R', 'SR', 'PSR'].indexOf(a) -
          ['N', 'm', 'R', 'SR', 'PSR'].indexOf(b),
      ),
    [cards],
  );
  const cardOrder = useMemo(
    () => new Map(cards.map((card, index) => [card.id, index])),
    [cards],
  );
  const matchingCards = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ja');
    const filtered = cards.filter((card) => {
      const allText = (
        card.name +
        ' ' +
        card.number +
        ' ' +
        card.release +
        ' ' +
        card.rarity +
        ' ' +
        card.color +
        ' ' +
        card.cardType +
        ' ' +
        card.trait +
        ' ' +
        card.description
      ).toLocaleLowerCase('ja');
      const matchesColor =
        selectedColors.length === 0 ||
        selectedColors.some((color) =>
          color === '無' ? card.color === '無' : card.color.includes(color),
        );
      const matchesLevel =
        card.level === null ||
        (card.level >= levelMin && card.level <= levelMax);
      const matchesPower =
        card.cardType !== 'イジン' ||
        (card.power !== null &&
          card.power >= powerMin &&
          card.power <= powerMax);
      const abilityText = card.trait + ' ' + card.description;
      const matchesEffectProcesses = matchesEffectProcessFilters(
        card,
        selectedEffectProcesses,
      );
      return (
        (!normalized || allText.includes(normalized)) &&
        (selectedTypes.length === 0 || selectedTypes.includes(card.cardType)) &&
        matchesColor &&
        (selectedRarities.length === 0 ||
          selectedRarities.includes(card.rarity)) &&
        (selectedReleases.length === 0 ||
          selectedReleases.includes(card.release)) &&
        (selectedKeywords.length === 0 ||
          selectedKeywords.some((keyword) => abilityText.includes(keyword))) &&
        matchesEffectProcesses &&
        matchesLevel &&
        matchesPower
      );
    });
    return filtered.sort((left, right) => {
      const compareOptionalNumber = (
        leftValue: number | null,
        rightValue: number | null,
      ) => {
        if (leftValue === null) return rightValue === null ? 0 : 1;
        if (rightValue === null) return -1;
        return leftValue - rightValue;
      };
      const nameOrder = left.name.localeCompare(right.name, 'ja');
      const order =
        sortBy === 'level'
          ? compareOptionalNumber(left.level, right.level) || nameOrder
          : sortBy === 'power'
            ? compareOptionalNumber(left.power, right.power) || nameOrder
            : sortBy === 'type'
              ? cardTypes.indexOf(left.cardType) -
                  cardTypes.indexOf(right.cardType) || nameOrder
              : sortBy === 'color'
                ? colorOptions.findIndex((color) =>
                    left.color.includes(color),
                  ) -
                    colorOptions.findIndex((color) =>
                      right.color.includes(color),
                    ) || nameOrder
                : sortBy === 'name'
                  ? nameOrder
                  : (cardOrder.get(left.id) ?? 0) -
                    (cardOrder.get(right.id) ?? 0);
      return sortDirection === 'asc' ? order : -order;
    });
  }, [
    cardOrder,
    cards,
    levelMax,
    levelMin,
    powerMax,
    powerMin,
    query,
    selectedColors,
    selectedEffectProcesses,
    selectedKeywords,
    selectedRarities,
    selectedReleases,
    selectedTypes,
    sortBy,
    sortDirection,
  ]);
  const activeFilterCount =
    selectedTypes.length +
    selectedColors.length +
    selectedRarities.length +
    selectedReleases.length +
    selectedKeywords.length +
    selectedEffectProcesses.length +
    Number(levelMin !== 0 || levelMax !== maxCardLevel) +
    Number(powerMin !== 0 || powerMax !== powerFilterCeiling);

  function resetCardSearch() {
    setQuery('');
    setQueryDraft('');
    setSelectedTypes([]);
    setSelectedColors([]);
    setSelectedRarities([]);
    setSelectedReleases([]);
    setSelectedKeywords([]);
    setSelectedEffectProcesses([]);
    setLevelMin(0);
    setLevelMax(maxCardLevel);
    setPowerMin(0);
    setPowerMax(powerFilterCeiling);
    setSortBy('official');
    setSortDirection('asc');
  }

  return (
    <section
      className="rounded-2xl border border-[var(--line)] bg-white/70 p-3 shadow-[0_12px_30px_rgb(33_38_45/0.04)] sm:p-4"
      role="tabpanel"
      aria-label="カードを探す"
    >
      <div className="mb-3 flex items-center justify-between gap-3 px-1 pt-1">
        <div>
          <p className="label">CARD CATALOG</p>
          <h1 className="font-display mt-1 text-xl tracking-wide">
            カードを探す
          </h1>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            編集中：{activeDeck.name || '名前のないデッキ'} · メイン{' '}
            {countCards(activeDeck.main)}枚 / サイド{' '}
            {countCards(activeDeck.side)}枚
          </p>
        </div>
        <span className="rounded-full bg-[var(--mist)] px-2 py-1 text-[11px] text-[var(--muted)]">
          {matchingCards.length}件
        </span>
      </div>
      <div className="relative mb-3">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
          ⌕
        </span>
        <input
          type="text"
          enterKeyHint="search"
          value={queryDraft}
          onCompositionStart={() => {
            isComposingQueryRef.current = true;
          }}
          onCompositionEnd={(event) => {
            isComposingQueryRef.current = false;
            const value = event.currentTarget.value;
            setQueryDraft(value);
            setQuery(value);
          }}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setQueryDraft(value);
            if (!isComposingQueryRef.current) setQuery(value);
          }}
          placeholder="名前・能力文・特性・カード番号で検索"
          className="h-10 w-full rounded-lg border border-[var(--line)] bg-white py-1 pr-2 pl-9 text-base outline-none placeholder:text-[var(--muted)] focus-visible:border-[var(--ring)] focus-visible:ring-3 focus-visible:ring-[var(--ring)]/50 md:text-sm"
        />
      </div>
      <details className="mb-3 rounded-xl border border-[var(--line)] bg-white/80">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium marker:content-none">
          <span>⌘ 条件で絞り込む</span>
          <span
            className={
              activeFilterCount > 0
                ? 'rounded-full bg-[var(--red)] px-2 py-0.5 text-[10px] text-white'
                : 'rounded-full bg-[var(--mist)] px-2 py-0.5 text-[10px] text-[var(--muted)]'
            }
          >
            {activeFilterCount > 0 ? activeFilterCount + '件選択中' : 'すべて'}
          </span>
        </summary>
        <div className="space-y-4 border-t border-[var(--line)] px-3 pb-3 pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium">絞り込み条件</p>
            <Button
              size="xs"
              variant="ghost"
              className="text-[var(--red)]"
              onClick={resetCardSearch}
            >
              リセット
            </Button>
          </div>
          <CollapsibleFilterGroup
            label="種類"
            selectedCount={selectedTypes.length}
          >
            {cardTypes.map((type) => (
              <FilterPill
                key={type}
                label={type}
                active={selectedTypes.includes(type)}
                onClick={() =>
                  setSelectedTypes((values) => toggleFilterValue(values, type))
                }
              />
            ))}
          </CollapsibleFilterGroup>
          <CollapsibleFilterGroup
            label="色"
            selectedCount={selectedColors.length}
          >
            {colorOptions.map((color) => (
              <FilterPill
                key={color}
                label={color === '無' ? '無色' : color}
                active={selectedColors.includes(color)}
                onClick={() =>
                  setSelectedColors((values) =>
                    toggleFilterValue(values, color),
                  )
                }
              />
            ))}
          </CollapsibleFilterGroup>
          <CollapsibleFilterGroup
            label="レアリティ"
            selectedCount={selectedRarities.length}
          >
            {rarityOptions.map((rarity) => (
              <FilterPill
                key={rarity}
                label={rarity}
                active={selectedRarities.includes(rarity)}
                onClick={() =>
                  setSelectedRarities((values) =>
                    toggleFilterValue(values, rarity),
                  )
                }
              />
            ))}
          </CollapsibleFilterGroup>
          <CollapsibleFilterGroup
            label="収録"
            selectedCount={selectedReleases.length}
          >
            {releaseOptions.map((release) => (
              <FilterPill
                key={release}
                label={release === 'ブースター' ? '第1弾ブースター' : release}
                active={selectedReleases.includes(release)}
                onClick={() =>
                  setSelectedReleases((values) =>
                    toggleFilterValue(values, release),
                  )
                }
              />
            ))}
          </CollapsibleFilterGroup>
          <CollapsibleFilterGroup
            label="特性・能力語・遺業"
            selectedCount={selectedKeywords.length}
          >
            {abilityKeywordOptions.map((keyword) => (
              <FilterPill
                key={keyword}
                label={keyword}
                active={selectedKeywords.includes(keyword)}
                onClick={() =>
                  setSelectedKeywords((values) =>
                    toggleFilterValue(values, keyword),
                  )
                }
              />
            ))}
          </CollapsibleFilterGroup>
          <CollapsibleFilterGroup
            label="効果・処理"
            selectedCount={selectedEffectProcesses.length}
          >
            {effectProcessOptions.map((option) => (
              <FilterPill
                key={option.key}
                label={option.label}
                active={selectedEffectProcesses.includes(option.key)}
                onClick={() =>
                  setSelectedEffectProcesses((values) =>
                    toggleFilterValue(values, option.key),
                  )
                }
              />
            ))}
          </CollapsibleFilterGroup>
          <div className="grid gap-3 sm:grid-cols-2">
            <RangeFilter
              label="レベル"
              min={levelMin}
              max={levelMax}
              ceiling={maxCardLevel}
              onMinChange={setLevelMin}
              onMaxChange={setLevelMax}
            />
            <RangeFilter
              label="パワー（イジンのみ）"
              min={powerMin}
              max={powerMax}
              ceiling={powerFilterCeiling}
              step={500}
              onMinChange={setPowerMin}
              onMaxChange={setPowerMax}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <div>
              <label htmlFor="card-sort" className="text-xs font-medium">
                並べ替え
              </label>
              <select
                id="card-sort"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortBy)}
                className="mt-1 h-8 w-full rounded-lg border border-[var(--line)] bg-white px-2 text-xs"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="card-sort-direction"
                className="text-xs font-medium"
              >
                順序
              </label>
              <select
                id="card-sort-direction"
                value={sortDirection}
                onChange={(event) =>
                  setSortDirection(event.target.value as SortDirection)
                }
                className="mt-1 h-8 w-full rounded-lg border border-[var(--line)] bg-white px-2 text-xs"
              >
                {sortDirectionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </details>
      <div className="-mx-3 sm:mx-0">
        <Table
          aria-label="カード選択一覧"
          className="min-w-[18rem] table-fixed text-sm"
        >
          <TableHeader className="bg-[var(--mist)]/70">
            <TableRow className="border-[var(--line)] hover:bg-transparent">
              <TableHead
                scope="col"
                className="w-12 px-1 text-center font-bold sm:w-20"
              >
                ID
              </TableHead>
              <TableHead scope="col" className="px-2 font-bold">
                カード名
              </TableHead>
              <TableHead
                scope="col"
                className="w-20 px-1 text-center font-bold sm:w-36"
              >
                メイン
              </TableHead>
              <TableHead
                scope="col"
                className="w-20 px-1 text-center font-bold sm:w-36"
              >
                サイド
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matchingCards.map((card) => {
              const mainInDeck = activeDeck.main[card.id] ?? 0;
              const sideInDeck = activeDeck.side[card.id] ?? 0;
              const tints = Array.from(card.color).map(
                (color) => catalogColorTints[color] ?? catalogColorTints['無'],
              );
              const idBackground =
                tints.length > 1
                  ? 'linear-gradient(135deg, ' + tints.join(', ') + ')'
                  : tints[0];
              return (
                <TableRow
                  key={card.id}
                  className={
                    'border-[var(--line)] ' +
                    (mainInDeck + sideInDeck > 0
                      ? 'bg-[var(--mist)]/70'
                      : 'bg-white/70')
                  }
                >
                  <TableCell
                    className="whitespace-normal break-all px-1 py-2 text-center text-xs text-[var(--ink)] sm:text-sm"
                    style={{ background: idBackground }}
                  >
                    <span aria-label={card.color + '色・' + card.id}>
                      {card.id}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-normal px-1 py-1 sm:px-2">
                    <button
                      type="button"
                      onClick={() => onSelectCard(card.id)}
                      aria-label={card.name + '（' + card.id + '）の詳細を開く'}
                      className="block min-h-11 w-full touch-manipulation rounded px-1 py-1 text-left text-base leading-6 break-words hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--red)]"
                    >
                      <span aria-hidden="true">🔍</span>
                      {card.name}
                    </button>
                  </TableCell>
                  <TableCell className="px-1 py-2">
                    <CatalogCardCounter
                      label={card.name + '（' + card.id + '）のメイン'}
                      count={mainInDeck}
                      onDecrease={() => onAdjustCard(card.id, 'main', -1)}
                      onIncrease={() => onAdjustCard(card.id, 'main', 1)}
                    />
                  </TableCell>
                  <TableCell className="px-1 py-2">
                    <CatalogCardCounter
                      label={card.name + '（' + card.id + '）のサイド'}
                      count={sideInDeck}
                      onDecrease={() => onAdjustCard(card.id, 'side', -1)}
                      onIncrease={() => onAdjustCard(card.id, 'side', 1)}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
            {matchingCards.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="whitespace-normal px-3 py-8 text-center text-sm text-[var(--muted)]"
                >
                  一致するカードがありません。
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function toggleFilterValue<T>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function FilterPill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant="outline"
      aria-pressed={active}
      onClick={onClick}
      className={
        active
          ? 'border-[var(--ink)] bg-[var(--ink)] !text-white hover:bg-[var(--ink)]/85 hover:!text-white'
          : 'border-[var(--line)] bg-white text-[var(--ink)]'
      }
    >
      {label}
    </Button>
  );
}

function CollapsibleFilterGroup({
  label,
  selectedCount,
  children,
}: {
  label: string;
  selectedCount: number;
  children: ReactNode;
}) {
  return (
    <details
      open
      className="rounded-lg border border-[var(--line)] bg-[var(--soft)]/45"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2 text-xs font-medium marker:content-none">
        <span>{label}</span>
        <span
          className={
            selectedCount > 0
              ? 'rounded-full bg-[var(--red)] px-1.5 py-0.5 text-[10px] text-white'
              : 'text-[var(--muted)]'
          }
        >
          {selectedCount > 0 ? selectedCount + '件選択中' : '開く／しまう'}
        </span>
      </summary>
      <div className="border-t border-[var(--line)] px-2.5 py-2.5">
        <div className="flex flex-wrap gap-1.5">{children}</div>
      </div>
    </details>
  );
}

function RangeFilter({
  label,
  min,
  max,
  ceiling,
  step = 1,
  onMinChange,
  onMaxChange,
}: {
  label: string;
  min: number;
  max: number;
  ceiling: number;
  step?: number;
  onMinChange: (value: number) => void;
  onMaxChange: (value: number) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium">{label}</p>
      <p className="mt-1 text-[11px] text-[var(--muted)]">
        {min} 〜 {max}
      </p>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <input
          aria-label={label + 'の下限'}
          type="range"
          min="0"
          max={ceiling}
          step={step}
          value={min}
          onChange={(event) =>
            onMinChange(Math.min(Number(event.target.value), max))
          }
        />
        <input
          aria-label={label + 'の上限'}
          type="range"
          min="0"
          max={ceiling}
          step={step}
          value={max}
          onChange={(event) =>
            onMaxChange(Math.max(Number(event.target.value), min))
          }
        />
      </div>
    </div>
  );
}

function CatalogCardCounter({
  label,
  count,
  onDecrease,
  onIncrease,
}: {
  label: string;
  count: number;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <fieldset
      aria-label={label + 'の枚数'}
      className="grid min-w-0 grid-cols-3 overflow-hidden rounded-md border border-[var(--line)] bg-white p-0"
    >
      <Button
        type="button"
        variant="ghost"
        disabled={count === 0}
        onClick={onDecrease}
        aria-label={label + 'から1枚減らす'}
        className="h-11 min-w-0 touch-manipulation rounded-none border-r border-[var(--line)] px-0 text-base text-[var(--muted)]"
      >
        −
      </Button>
      <output
        aria-label={label + 'に入っている枚数'}
        className="grid h-11 min-w-0 place-items-center text-base tabular-nums"
      >
        {count}
      </output>
      <Button
        type="button"
        variant="ghost"
        onClick={onIncrease}
        aria-label={label + 'に1枚追加する'}
        className="h-11 min-w-0 touch-manipulation rounded-none border-l border-[var(--line)] px-0 text-base text-[var(--ink)]"
      >
        ＋
      </Button>
    </fieldset>
  );
}
