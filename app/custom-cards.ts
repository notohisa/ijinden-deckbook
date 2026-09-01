import type { IjindenCard } from '@/app/ijinden-cards';

export type CustomIjindenCard = IjindenCard & { illustrator?: string };

export const customCards: CustomIjindenCard[] = [
  {
    id: 'PSR-01-008',
    number: 'No1-8',
    name: 'マーサ・ジェーン・カナリー',
    release: 'ブースター',
    cardType: 'イジン',
    rarity: 'PSR',
    color: '赤',
    level: 1,
    power: 100000,
    trait: '',
    description: 'トリプルプレッシャー\n戦場に他の赤のイジンがいる間「即応」を得る。\n（戦場に置かれたターンでもアタッカーになれる）\n\n遺業能力：（戦場から墓地に置かれたときに発動できる）\n1ドローする。',
    imageUrl: 'cards/martha-jane-canary-psr.png',
    illustrator: '堀美芙夕',
  },
];
