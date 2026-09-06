import type { Regulation } from '@/app/types/deck';

/**
 * Tournament and community card limits. A limit of 0 means that the card is
 * sealed for that regulation. The validator combines these limits with the
 * general deck rules at runtime, so saved decks never need migration.
 */
export const regulations: readonly Regulation[] = [
  {
    id: 'sdk-2026',
    name: '最強ダイバー決定戦2026',
    cardLimits: [
      {
        cardName: 'ジョバンニ＝ディ＝メディチ',
        shortName: 'メディチ',
        limit: 0,
      },
      {
        cardName: 'リユニオン',
        shortName: 'リユニオン',
        limit: 0,
      },
      {
        cardName: '千利休',
        shortName: '千利休',
        limit: 0,
      },
    ],
  },
  {
    id: '002',
    name: 'いわゆる002',
    cardLimits: [
      {
        cardName: 'ジョバンニ＝ディ＝メディチ',
        shortName: 'メディチ',
        limit: 0,
      },
      {
        cardName: 'リユニオン',
        shortName: 'リユニオン',
        limit: 0,
      },
    ],
  },
  {
    id: 'recommended',
    name: '推奨レギュレーション',
    cardLimits: [
      {
        cardName: 'ジョバンニ＝ディ＝メディチ',
        shortName: 'メディチ',
        limit: 2,
      },
      {
        cardName: 'リユニオン',
        shortName: 'リユニオン',
        limit: 2,
      },
    ],
  },
  {
    id: 'unrestricted',
    name: '封印なし',
    cardLimits: [
      {
        cardName: 'ジョバンニ＝ディ＝メディチ',
        shortName: 'メディチ',
        limit: 4,
      },
      {
        cardName: 'リユニオン',
        shortName: 'リユニオン',
        limit: 4,
      },
    ],
  },
];
