import { test, expect } from '@playwright/test';
import { seed, stored } from './helpers.mjs';

test('catalog counters keep rapid edits, both piles, filters and persisted counts in sync', async ({
  context,
  page,
}) => {
  await seed(context);
  await page.goto('./');
  const catalog = page.getByRole('tabpanel', {
    name: 'カードを探す',
    exact: true,
  });
  const mainName = '織田信長（01-001）のメイン';
  const sideName = '織田信長（01-001）のサイド';
  const mainCount = catalog.getByLabel(mainName + 'に入っている枚数', {
    exact: true,
  });
  await expect(mainCount).toHaveText('4');
  await catalog
    .getByRole('button', { name: mainName + 'に1枚追加する', exact: true })
    .click({ clickCount: 3, delay: 20 });
  await expect(mainCount).toHaveText('7');
  await catalog
    .getByRole('button', { name: mainName + 'から1枚減らす', exact: true })
    .click();
  await expect(mainCount).toHaveText('6');
  await catalog
    .getByRole('button', { name: sideName + 'に1枚追加する', exact: true })
    .click({ clickCount: 2, delay: 20 });
  await expect(
    catalog.getByLabel(sideName + 'に入っている枚数', { exact: true }),
  ).toHaveText('2');
  await expect
    .poll(async () => (await stored(page)).draft.main['01-001'])
    .toBe(6);
  await expect
    .poll(async () => (await stored(page)).draft.side['01-001'])
    .toBe(2);
  expect((await stored(page)).draft.main['01-002']).toBe(4);

  await page
    .getByRole('textbox', { name: 'カードを検索', exact: true })
    .fill('織田信長');
  await expect(
    catalog.getByRole('button', { name: /クレオパトラ.*の詳細を開く$/ }),
  ).toHaveCount(0);
  await catalog
    .getByRole('button', {
      name: '織田信長（01-001）の詳細を開く',
      exact: true,
    })
    .click();
  await expect(
    page
      .getByRole('dialog')
      .getByRole('heading', { name: '織田信長', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await page.getByRole('tab', { name: 'レシピ', exact: true }).click();
  await page.getByRole('tab', { name: 'カード', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'カードを検索', exact: true }),
  ).toHaveValue('織田信長');
  await expect(mainCount).toHaveText('6');
  await page.reload();
  await expect(mainCount).toHaveText('6');
  await expect(
    catalog.getByLabel(sideName + 'に入っている枚数', { exact: true }),
  ).toHaveText('2');
});
