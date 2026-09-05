import type { CustomIjindenCard } from '@/app/custom-cards';
import type { IjindenCard } from '@/app/ijinden-cards';

export type Pile = 'main' | 'side';
export type DeckColor = 'default' | 'orange' | 'gray';
export type CardType = IjindenCard['cardType'];
/** Optional rule metadata can be added to either official or custom card data. */
export type AppCard = (IjindenCard | CustomIjindenCard) & {
  /** `null` means the named card is exempt from the normal same-name limit. */
  deckLimit?: number | null;
};

export type Deck = {
  id: string;
  name: string;
  main: Record<string, number>;
  side: Record<string, number>;
  updatedAt: string;
  isSaved?: boolean;
  color?: DeckColor;
};

export type ArchiveData = {
  version: 2;
  updatedAt: string;
  decks: Deck[];
  draft: Deck;
};

export type LegacyArchiveData = {
  version: 1;
  updatedAt: string;
  decks: Deck[];
};

export type MyDeckExport = {
  version: 1;
  type: 'ijinden-deckbook-my-decks';
  exportedAt: string;
  decks: Deck[];
};

export type CardRestriction = {
  cardName: string;
  limit: number;
  effectiveFrom?: string;
  note?: string;
};

export type DeckRuleIssue = {
  code:
    | 'main-minimum'
    | 'side-maximum'
    | 'total-maximum'
    | 'card-limit'
    | 'unknown-card';
  title: string;
  detail: string;
  cardName?: string;
  count?: number;
  limit?: number;
  note?: string;
};

export type DeckValidationStatus = 'valid' | 'incomplete' | 'invalid';

export type DeckValidation = {
  status: DeckValidationStatus;
  errors: DeckRuleIssue[];
  warnings: DeckRuleIssue[];
  mainCount: number;
  sideCount: number;
  totalCount: number;
  namedCardCounts: ReadonlyMap<string, number>;
};

export type DeckImportError = {
  index: number;
  name: string;
  reason: string;
};

export type DeckImportParseResult = {
  decks: Deck[];
  invalidDecks: DeckImportError[];
  totalCount: number;
};

export type ImportAction = 'add' | 'update';

export type ImportPreviewItem = {
  key: string;
  deck: Deck;
  action: ImportAction;
  existingDeck?: Deck;
};
