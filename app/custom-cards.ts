import type { IjindenCard } from '@/app/ijinden-cards';

export type CustomIjindenCard = IjindenCard & { illustrator?: string };

export const customCards: CustomIjindenCard[] = [
  {
    id: 'FA-SR-01-001',
    number: '001',
    name: 'マーサ・ジェーン・カナリー',
    release: 'ファンアートコレクション',
    cardType: 'イジン',
    rarity: 'SR',
    color: '赤',
    level: 1,
    power: 100000,
    trait: '',
    description:
      'トリプルプレッシャー\n戦場に他の赤のイジンがいる間「即応」を得る。\n（戦場に置かれたターンでもアタッカーになれる）\n\n遺業能力：（戦場から墓地に置かれたときに発動できる）\n1ドローする。',
    imageUrl: 'cards/martha-jane-canary-psr.png',
    illustrator: '堀美芙夕',
  },
  {
    id: 'FA-SR-01-002',
    number: '002',
    name: 'マーサ・ジェーン・カナリー（サマー）',
    release: 'ファンアートコレクション',
    cardType: 'イジン',
    rarity: 'SR',
    color: '赤',
    level: 1,
    power: 1000,
    trait: '',
    description:
      '戦場に他の赤のイジンがいる間「即応」を得る。\n（戦場に置かれたターンでもアタッカーになれる）\n\n遺業能力：（戦場から墓地に置かれたときに発動できる）\n1ドローする。',
    imageUrl: 'cards/martha-jane-canary-summer-sr.png',
  },
  {
    id: 'FA-SR-01-003',
    number: '003',
    name: 'マーサ・ジェーン・カナリー（ハロウィン）',
    release: 'ファンアートコレクション',
    cardType: 'イジン',
    rarity: 'SR',
    color: '紫',
    level: 1,
    power: 1000,
    trait: '',
    description:
      '戦場に他の紫のイジンがいる間「即応」を得る。\n（戦場に置かれたターンでもアタッカーになれる）\n\n遺業能力：（戦場から墓地に置かれたときに発動できる）\n1ドローする。',
    imageUrl: 'cards/martha-jane-canary-halloween-sr.png',
  },
];
