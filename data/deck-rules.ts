export type DeckRules = {
  mainDeckMinimum: number;
  sideDeckMaximum: number;
  totalDeckMaximum: number;
  defaultSameNameLimit: number;
};

/**
 * Rules that apply to every deck, independent of a tournament or community
 * regulation. Keep rule values here; deck-validator owns the judgement.
 */
export const deckRules: Readonly<DeckRules> = {
  mainDeckMinimum: 40,
  sideDeckMaximum: 10,
  totalDeckMaximum: 60,
  defaultSameNameLimit: 4,
};
