import assert from 'node:assert/strict';
import test from 'node:test';

import { ijindenCards } from '../app/ijinden-cards.ts';
import { applyCardCatalogCorrections } from '../lib/card-catalog-corrections.ts';
import {
  applyEffectProcessTags,
  getEffectProcessTags,
  matchesEffectProcessFilters,
  normalizeEffectProcessText,
} from '../lib/card-effect-processes.ts';

test('normalizes card text and extracts all six effect/process tags', () => {
  const tags = getEffectProcessTags(`
    相手のカードを 破壊して、カードを墓地に置いて発動する。<br>
    このカードは破壊されない。能力によって戦場を離れない。\n
    そのカードを山札の下に戻し、魔力ゾーンに置きます。
  `);

  assert.deepEqual(tags, {
    destroys: true,
    putsInGraveyard: true,
    cannotBeDestroyed: true,
    cannotLeaveBattlefield: true,
    putsOnBottomOfDeck: true,
    putsInManaZone: true,
  });
  assert.equal(
    normalizeEffectProcessText('墓地　に\n置く&nbsp;'),
    '墓地に置く',
  );
});

test('does not treat destruction immunity as a destruction process', () => {
  const tags = getEffectProcessTags('このカードは能力によって破壊されない。');

  assert.equal(tags.destroys, false);
  assert.equal(tags.cannotBeDestroyed, true);
});

test('uses OR within selected process filters and AND is left to other filters', () => {
  const card = {
    effectProcessTags: {
      destroys: false,
      putsInGraveyard: true,
      cannotBeDestroyed: false,
      cannotLeaveBattlefield: false,
      putsOnBottomOfDeck: false,
      putsInManaZone: false,
    },
  };

  assert.equal(matchesEffectProcessFilters(card, []), true);
  assert.equal(matchesEffectProcessFilters(card, ['putsInGraveyard']), true);
  assert.equal(
    matchesEffectProcessFilters(card, ['destroys', 'putsInGraveyard']),
    true,
  );
  assert.equal(matchesEffectProcessFilters(card, ['destroys']), false);
});

test('recognizes official wording variants and corrects Purple Stone to N', () => {
  const correctedCards = ijindenCards
    .map(applyCardCatalogCorrections)
    .map(applyEffectProcessTags);
  const purpleStone = correctedCards.find((card) => card.id === 'P-016');
  const montesquieu = correctedCards.find((card) => card.id === '02-016');
  const shinran = correctedCards.find((card) => card.id === '02-005');

  assert.equal(purpleStone?.name, 'パープルストーン');
  assert.equal(purpleStone?.rarity, 'N');
  assert.ok(
    correctedCards
      .filter((card) => card.rarity === 'N')
      .some((card) => card.id === 'P-016'),
  );
  assert.equal(montesquieu?.effectProcessTags?.cannotLeaveBattlefield, true);
  assert.equal(shinran?.effectProcessTags?.putsOnBottomOfDeck, true);
});
