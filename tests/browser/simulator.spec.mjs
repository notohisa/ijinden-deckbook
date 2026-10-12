import { test, expect } from '@playwright/test';
import { seed, openRecipe, stored } from './helpers.mjs';

test.beforeEach(async ({ context }) => seed(context));

test('board operations and simple-view operations share one session without changing saved decks', async ({
  page,
}) => {
  await openRecipe(page);
  const before = await stored(page);
  await page.getByRole('tab', { name: 'シミュ', exact: true }).click();
  await page.getByRole('button', { name: '盤面表示', exact: true }).click();
  const board = page.getByRole('tabpanel', {
    name: 'シミュレーション',
    exact: true,
  });
  await board
    .getByRole('button', { name: 'このレシピで開始', exact: true })
    .click();
  await expect(
    board.getByRole('button', { name: '手札 6枚', exact: true }),
  ).toBeVisible();
  await board
    .getByRole('button', { name: '手札を引き直す（1回）', exact: true })
    .click();
  await expect(
    board.getByRole('button', { name: '手札を引き直す（1回）', exact: true }),
  ).toBeDisabled();
  await board.getByRole('button', { name: '1枚引く', exact: true }).click();
  await expect(
    board.getByRole('button', { name: '手札 7枚', exact: true }),
  ).toBeVisible();
  await board
    .getByRole('button', { name: '山札の上からガーディアンへ', exact: true })
    .click();
  await expect(
    board.getByRole('button', { name: 'ガーディアン 5枚', exact: true }),
  ).toBeVisible();
  await board.getByRole('button', { name: '簡易表示', exact: true }).click();
  const simple = page.getByRole('tabpanel', {
    name: 'シミュレーション・簡易表示',
    exact: true,
  });
  const guardians = simple.getByRole('region', {
    name: 'ガーディアン',
    exact: true,
  });
  const remaining = simple.getByRole('region', {
    name: '手札・残りのカード',
    exact: true,
  });
  await expect(guardians.getByRole('listitem')).toHaveCount(5);
  await expect(remaining.getByRole('listitem')).toHaveCount(35);
  const first = remaining.getByRole('listitem').first();
  await first.getByRole('button', { name: /通常を切り替える$/ }).click();
  await expect(
    first.getByRole('button', { name: /、マリョクを切り替える$/ }),
  ).toBeVisible();
  await first
    .getByRole('button', { name: /を裏向きのガーディアンにする$/ })
    .click();
  await expect(guardians.getByRole('listitem')).toHaveCount(6);
  await expect(remaining.getByRole('listitem')).toHaveCount(34);
  await simple.getByRole('button', { name: '盤面表示', exact: true }).click();
  await expect(
    board.getByRole('button', { name: 'ガーディアン 6枚', exact: true }),
  ).toBeVisible();
  await expect(
    board.getByRole('button', { name: '手札 6枚', exact: true }),
  ).toBeVisible();
  expect(await stored(page)).toEqual(before);
});

test('board card menu and drag still move cards after extraction', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await openRecipe(page);
  await page.getByRole('tab', { name: 'シミュ', exact: true }).click();
  const board = page.getByRole('tabpanel', {
    name: 'シミュレーション',
    exact: true,
  });
  await board
    .getByRole('button', { name: 'このレシピで開始', exact: true })
    .click();
  const hand = board.getByRole('region', { name: '手札', exact: true });
  await hand.getByRole('listitem').first().getByRole('button').click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '戦場へ', exact: true })
    .click();
  await expect(
    board.getByRole('button', { name: '戦場 1枚', exact: true }),
  ).toBeVisible();
  const card = hand.getByRole('listitem').first().getByRole('button');
  const destination = board.getByRole('region', { name: '戦場', exact: true });
  const from = await card.boundingBox();
  const to = await destination.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 15, from.y + from.height / 2);
  // The mouse sensor activates first; wait until React enables drop targets.
  await expect(destination).toHaveClass(/border-\[var\(--green\)\]\/60/);
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 10,
  });
  await expect(destination).toHaveClass(/ring-2/);
  await page.mouse.up();
  await expect(
    board.getByRole('button', { name: '戦場 2枚', exact: true }),
  ).toBeVisible();
  await expect(
    board.getByRole('button', { name: '手札 4枚', exact: true }),
  ).toBeVisible();
});
