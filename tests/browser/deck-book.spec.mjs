import { test, expect } from '@playwright/test';
import {
  seed,
  openRecipe,
  stored,
  openTextPreview,
  original,
  draft,
  key,
} from './helpers.mjs';

test.beforeEach(async ({ context }) => seed(context));

test('import confirmation detects a saved-deck change while waiting for the write lock', async ({
  page,
  context,
}) => {
  await openRecipe(page);
  const other = await context.newPage();
  await openRecipe(other);
  const preview = await openTextPreview(
    page,
    'メインデッキ\t1\n親鸞\t1\n\nサイドデッキ\t0',
  );
  await other.evaluate(
    ({ key, original }) =>
      new Promise((ready) => {
        void navigator.locks.request('ijinden-deckbook:archive', async () => {
          await new Promise((release) => {
            window.releaseArchiveLock = release;
            ready();
          });
          const archive = JSON.parse(localStorage.getItem(key));
          archive.decks.unshift({
            ...original,
            id: 'other-import',
            name: '移行デッキ',
          });
          localStorage.setItem(key, JSON.stringify(archive));
        });
      }),
    { key, original },
  );
  await preview
    .getByRole('button', { name: '1件をインポート', exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(async () => (await navigator.locks.query()).pending.length),
    )
    .toBe(1);
  await other.evaluate(() => window.releaseArchiveLock());
  await expect(
    preview.getByText('移行デッキ (2)', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('alert', { includeHidden: true }).filter({ hasText: '別のタブでマイデッキが変更されました' })).toContainText(
    '別のタブでマイデッキが変更されました',
  );
  expect(
    (await stored(page)).decks.find((d) => d.id === 'other-import').main,
  ).toEqual(original.main);
  await preview
    .getByRole('button', { name: '1件をインポート', exact: true })
    .click();
  await expect(preview).toHaveCount(0);
  expect(
    (await stored(page)).decks.find((d) => d.name === '移行デッキ (2)').main,
  ).toEqual({ '02-005': 1 });
});

test('JSON import remains available and preserves the draft', async ({
  page,
}) => {
  await openRecipe(page);
  const imported = { ...original, id: 'json', name: 'JSONから移行' };
  await page.locator('input[type=file]').setInputFiles({
    name: 'decks.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ version: 2, decks: [imported], draft }),
    ),
  });
  const preview = page.getByRole('dialog', {
    name: 'マイデッキをインポート',
    exact: true,
  });
  await expect(preview).toBeVisible();
  await preview
    .getByRole('button', { name: '1件をインポート', exact: true })
    .click();
  await expect(preview).toHaveCount(0);
  expect((await stored(page)).decks.some((d) => d.name === imported.name)).toBe(
    true,
  );
  expect((await stored(page)).draft).toEqual(draft);
});

test('another tab editing its draft cannot remove a newly saved deck', async ({
  page,
  context,
}) => {
  await openRecipe(page);
  const other = await context.newPage();
  await openRecipe(other);
  await page
    .getByRole('textbox', { name: 'デッキ名', exact: true })
    .fill('タブAの保存');
  await page
    .getByRole('button', { name: 'マイデッキに保存', exact: true })
    .click();
  await expect
    .poll(async () =>
      (await stored(page)).decks.some((d) => d.name === 'タブAの保存'),
    )
    .toBe(true);
  await expect(
    other.getByRole('textbox', { name: 'デッキ名', exact: true }),
  ).toHaveValue('タブAの保存');
  await other
    .getByRole('textbox', { name: 'デッキ名', exact: true })
    .fill('タブBで編集');
  await expect
    .poll(async () => (await stored(other)).draft.name)
    .toBe('タブBで編集');
  expect((await stored(page)).decks.map((d) => d.name)).toEqual([
    'タブAの保存',
    original.name,
  ]);
  await other.getByRole('tab', { name: 'マイデッキ', exact: true }).click();
  await expect(
    other.getByRole('button', { name: /^タブAの保存 ✅/ }),
  ).toBeVisible();
});

test('conflicting drafts survive reload and can be saved as a separate deck', async ({
  page,
  context,
}) => {
  await openRecipe(page);
  await page
    .getByRole('textbox', { name: 'デッキ名', exact: true })
    .fill('タブAの草稿');
  await expect
    .poll(async () => (await stored(page)).draft.name)
    .toBe('タブAの草稿');
  const other = await context.newPage();
  await openRecipe(other);
  await other
    .getByRole('textbox', { name: 'デッキ名', exact: true })
    .fill('タブBの草稿');
  await expect(
    page.getByRole('alert', { name: '他のタブとの編集の競合' }),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'デッキ名', exact: true }),
  ).toHaveValue('タブAの草稿');
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page.getByRole('tab', { name: 'レシピ', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'デッキ名', exact: true }),
  ).toHaveValue('タブAの草稿');
  await page
    .getByRole('button', { name: 'このタブの内容を別名で保存', exact: true })
    .click();
  await expect
    .poll(async () =>
      (await stored(page)).decks.some((d) => d.name === 'タブAの草稿'),
    )
    .toBe(true);
  expect((await stored(page)).draft.name).toBe('タブBの草稿');
  await page
    .getByRole('button', { name: '他のタブのレシピを読み込む', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'デッキ名', exact: true }),
  ).toHaveValue('タブBの草稿');
  await expect(
    page.getByRole('alert', { name: '他のタブとの編集の競合' }),
  ).toHaveCount(0);
  page.removeAllListeners('dialog');
});

test('original TSV and this app text import only after confirmation without changing the draft', async ({
  page,
}) => {
  await openRecipe(page);
  let preview = await openTextPreview(
    page,
    'メインデッキ\t5\n親鸞\t2\nイエローオーブ (第5弾)\t3\n\nサイドデッキ\t1\nカール大帝\t1',
  );
  expect((await stored(page)).decks).toEqual([original]);
  await preview
    .getByRole('button', { name: '1件をインポート', exact: true })
    .click();
  await expect(preview).toHaveCount(0);
  let archive = await stored(page);
  expect(archive.draft).toEqual(draft);
  expect(archive.decks.find((d) => d.name === '移行デッキ').main).toEqual({
    '02-005': 2,
    '05-099': 3,
  });
  expect(archive.decks.find((d) => d.name === '移行デッキ').side).toEqual({
    '04-010': 1,
  });
  preview = await openTextPreview(
    page,
    '自分の出力\n\nメインデッキ（1枚）\n- 親鸞（02-005） × 1\n\nサイドデッキ（0枚）\nなし',
    '',
  );
  await preview
    .getByRole('button', { name: '1件をインポート', exact: true })
    .click();
  await expect(preview).toHaveCount(0);
  archive = await stored(page);
  expect(archive.decks.find((d) => d.name === '自分の出力').main).toEqual({
    '02-005': 1,
  });
  expect(archive.draft).toEqual(draft);
  await expect(
    page.getByRole('button', { name: '写真からデッキを取り込む', exact: true }),
  ).toHaveCount(0);
});

test('a write failure is visible and does not claim a successful save', async ({
  page,
}) => {
  await openRecipe(page);
  await page.evaluate((key) => {
    // oxlint-disable-next-line typescript/unbound-method -- Preserve the prototype method and explicitly pass this with call below.
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Full', 'QuotaExceededError');
      return originalSet.call(this, name, value);
    };
  }, key);
  await page
    .getByRole('textbox', { name: 'デッキ名', exact: true })
    .fill('容量不足テスト');
  await page
    .getByRole('button', { name: 'マイデッキに保存', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('保存できませんでした');
  expect((await stored(page)).decks).toEqual([original]);
  await expect(
    page.getByText('「容量不足テスト」をマイデッキに保存しました。', {
      exact: true,
    }),
  ).toHaveCount(0);
});

test('malformed persisted data is retained rather than replaced with an empty archive', async ({
  page,
}) => {
  await openRecipe(page);
  await page.evaluate((key) => localStorage.setItem(key, '{broken'), key);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: '保存データを読み込めませんでした' }),
  ).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(
    '{broken',
  );
});

test('browsers without Web Locks reject writes while retaining existing data', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'locks', {
      value: undefined,
      configurable: true,
    }),
  );
  await openRecipe(page);
  await expect(page.getByRole('alert')).toContainText('安全に保存できません');
  await page
    .getByRole('textbox', { name: 'デッキ名', exact: true })
    .fill('保存不可');
  await page
    .getByRole('button', { name: 'マイデッキに保存', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('安全に保存できません');
  expect((await stored(page)).decks).toEqual([original]);
  expect((await stored(page)).draft).toEqual(draft);
});
