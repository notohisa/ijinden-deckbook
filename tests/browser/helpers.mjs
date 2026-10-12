import { expect } from '@playwright/test';

export const key = 'ijinden-deckbook-v1';
export const main = Object.fromEntries(
  Array.from({ length: 10 }, (_, i) => [
    '01-' + String(i + 1).padStart(3, '0'),
    4,
  ]),
);
export const original = {
  id: 'original',
  name: '既存デッキ',
  main,
  side: {},
  updatedAt: '2026-10-11T00:00:00Z',
  isSaved: true,
};
export const draft = {
  ...original,
  id: 'draft',
  name: '作成中のレシピ',
  isSaved: false,
};

export async function seed(context) {
  // No external analytics/card downloads are needed for state and operation tests.
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (
      url.hostname === '127.0.0.1' ||
      url.hostname === 'localhost' ||
      url.hostname === 'notohisa.github.io'
    )
      return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="90"/>',
    });
  });
  await context.addInitScript(
    ({ key, original, draft }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(
          key,
          JSON.stringify({ version: 2, decks: [original], draft }),
        );
    },
    { key, original, draft },
  );
}

export async function openRecipe(page) {
  await page.goto('./');
  await page.getByRole('tab', { name: 'レシピ', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'デッキ名', exact: true }),
  ).toBeVisible();
}

export const stored = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);

export async function openTextPreview(page, text, name = '移行デッキ') {
  await page
    .getByRole('button', { name: 'マイデッキをインポート', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'デッキをインポート',
    exact: true,
  });
  await dialog.getByLabel('デッキ名（任意）', { exact: true }).fill(name);
  await dialog.getByLabel('コピーしたテキスト', { exact: true }).fill(text);
  await dialog
    .getByRole('button', { name: '内容を確認する', exact: true })
    .click();
  const preview = page.getByRole('dialog', {
    name: 'マイデッキをインポート',
    exact: true,
  });
  await expect(preview).toBeVisible();
  return preview;
}
