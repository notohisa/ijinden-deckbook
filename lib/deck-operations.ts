import type { Deck, DeckColor, Pile } from '@/app/types/deck';
import { countCards, normalizedDeckName } from './deck-utils.ts';

export function editDraft(deck: Deck, change: (deck: Deck) => Deck): Deck {
  return {
    ...change(deck),
    updatedAt: new Date().toISOString(),
    isSaved: false,
  };
}

export function adjustDraftCard(
  deck: Deck,
  id: string,
  pile: Pile,
  difference: number,
): Deck {
  const next = { ...deck[pile] };
  const count = Math.max(0, (next[id] ?? 0) + difference);
  if (count === 0) delete next[id];
  else next[id] = count;
  return { ...deck, [pile]: next };
}

export function moveDraftCard(deck: Deck, id: string, from: Pile): Deck {
  if (!deck[from][id]) return deck;
  const to = from === 'main' ? 'side' : 'main';
  return adjustDraftCard(adjustDraftCard(deck, id, from, -1), id, to, 1);
}

export function addSavedDeck(
  decks: Deck[],
  draft: Deck,
  allowRenaming = false,
): { decks: Deck[]; value: string } {
  if (countCards(draft.main) + countCards(draft.side) === 0) {
    throw new Error(
      '空のデッキはマイデッキに保存できません。カードを追加してから保存してください。',
    );
  }
  const base = normalizedDeckName(draft.name);
  const target =
    !allowRenaming && draft.sourceId
      ? decks.find((deck) => deck.id === draft.sourceId)
      : undefined;
  if (!allowRenaming && draft.sourceId && !target)
    throw new Error(
      '元のデッキは削除されています。「別のデッキとして保存」を使ってください。',
    );
  if (target && draft.sourceUpdatedAt !== target.updatedAt)
    throw new Error(
      '元のデッキは別のタブまたは同期で変更されています。読み込み直すか、別のデッキとして保存してください。',
    );
  let name = base;
  let suffix = 2;
  while (
    decks.some(
      (deck) =>
        deck.id !== target?.id && normalizedDeckName(deck.name) === name,
    )
  ) {
    if (!allowRenaming)
      throw new Error(
        '同名のデッキはマイデッキに保存できません。デッキ名を変更してください。',
      );
    name = `${base || '名前のないデッキ'} (${suffix++})`;
  }
  const saved = {
    ...draft,
    id: target?.id ?? crypto.randomUUID(),
    name,
    main: { ...draft.main },
    side: { ...draft.side },
    updatedAt: new Date().toISOString(),
    isSaved: true,
  };
  delete saved.sourceId;
  delete saved.sourceUpdatedAt;
  return {
    decks: [saved, ...decks.filter((deck) => deck.id !== saved.id)],
    value: name,
  };
}

export function renameDeck(decks: Deck[], id: string, input: string) {
  const name = normalizedDeckName(input);
  if (
    decks.some(
      (deck) => deck.id !== id && normalizedDeckName(deck.name) === name,
    )
  ) {
    throw new Error(
      '同名のデッキには変更できません。別のデッキ名を入力してください。',
    );
  }
  return decks.map((deck) =>
    deck.id === id
      ? { ...deck, name, updatedAt: new Date().toISOString() }
      : deck,
  );
}

export function colorDeck(decks: Deck[], id: string, color: DeckColor) {
  return decks.map((deck) =>
    deck.id === id
      ? { ...deck, color, updatedAt: new Date().toISOString() }
      : deck,
  );
}
