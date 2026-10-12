import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { seed, openRecipe, stored, original, draft } from './helpers.mjs';

test.beforeEach(async ({ context }) => seed(context));

async function openGuide(page) {
  await page
    .getByRole('button', { name: 'マイデッキをインポート', exact: true })
    .click();
  await page
    .getByRole('button', { name: '旧サイトからまとめて移行', exact: true })
    .click();
  const guide = page.getByRole('dialog', {
    name: '旧サイトからまとめて移行',
    exact: true,
  });
  await expect(guide).toBeVisible();
  return guide;
}

test('migration guide exposes a registerable bookmark and mobile instructions from import and help', async ({
  page,
}) => {
  await openRecipe(page);
  const guide = await openGuide(page);
  const bookmark = guide.getByRole('link', {
    name: '旧サイトの全デッキを書き出す',
    exact: true,
  });
  await expect(bookmark).toHaveAttribute('href', /^javascript:/);
  const url = page.url();
  await bookmark.click();
  expect(page.url()).toBe(url);
  await expect(guide.getByRole('status')).toContainText('ドラッグして登録');
  await guide
    .getByText('スマートフォン・ドラッグできない場合', { exact: true })
    .click();
  await expect(
    guide.getByRole('button', { name: '登録用アドレスをコピー', exact: true }),
  ).toBeVisible();
  const bounds = await guide.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(
    page.viewportSize().width,
  );
  await guide.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.getByRole('tab', { name: 'ヘルプ', exact: true }).click();
  await page
    .getByRole('button', { name: '旧サイトからまとめて移行', exact: true })
    .click();
  await expect(guide).toBeVisible();
});

test('built bookmark exports readonly legacy data and the file migrates safely with repeat protection', async ({
  page,
  context,
}) => {
  await openRecipe(page);
  const guide = await openGuide(page);
  const bookmarklet = await guide
    .getByRole('link', { name: '旧サイトの全デッキを書き出す', exact: true })
    .getAttribute('href');
  const raw = [
    {
      id: 1,
      title: '同じ構成',
      timestamp: 1750000000000,
      main: Object.entries(original.main).map(([id, count]) => [
        '1-' + Number(id.split('-')[1]),
        count,
      ]),
      side: [],
    },
    {
      id: 2,
      title: original.name,
      timestamp: 1750000001000,
      main: [['2nd1-2', 4]],
      side: [['2nd2-48', 2]],
    },
    {
      id: 3,
      title: 'サイドあり',
      timestamp: 1750000002000,
      main: [['2-5', 4]],
      side: [['R-1', 1]],
    },
    {
      id: 4,
      title: '未対応カード',
      timestamp: 1750000003000,
      main: [['unknown-1', 1]],
      side: [],
    },
  ];
  // Isolated browser context and a synthetic old-site page; no user's database
  // or live old-site script is used by this integration test.
  const legacy = await context.newPage();
  await legacy.route('https://sweetpotato.github.io/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="ja"><title>移行テスト</title><body>旧サイトのテスト用デッキ</body></html>',
    }),
  );
  await legacy.goto('https://sweetpotato.github.io/ijinden-deck-builder/');
  await legacy.evaluate(
    (records) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('ijinden-deck-builder');
        request.onupgradeneeded = () =>
          request.result.createObjectStore('decks', { keyPath: 'id' });
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('decks', 'readwrite');
          records.forEach((record) =>
            transaction.objectStore('decks').put(record),
          );
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    raw,
  );
  legacy.on('dialog', (dialog) => dialog.accept());
  const downloadPromise = legacy.waitForEvent('download');
  await legacy.evaluate((url) => {
    const link = document.createElement('a');
    link.href = url;
    link.textContent = '書き出し用ブックマーク';
    document.body.append(link);
    link.click();
  }, bookmarklet);
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(exported.type).toBe('ijinden-deck-builder-backup');
  expect(exported.decks).toEqual(raw);
  const afterExport = await legacy.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('ijinden-deck-builder');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db
            .transaction('decks', 'readonly')
            .objectStore('decks')
            .getAll();
          read.onsuccess = () => {
            db.close();
            resolve(read.result);
          };
          read.onerror = () => reject(read.error);
        };
      }),
  );
  expect(afterExport).toEqual(raw);
  await legacy.close();

  const chooserPromise = page.waitForEvent('filechooser');
  await guide
    .getByRole('button', { name: '旧サイトのJSONファイルを選ぶ', exact: true })
    .click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'legacy.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  const preview = page.getByRole('dialog', {
    name: 'マイデッキをインポート',
    exact: true,
  });
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('取り込み候補 2件・同じ内容で省略 1件');
  await expect(preview).toContainText('1件は読み込めませんでした');
  await expect(preview).toContainText('既存デッキ（旧#2）');
  expect((await stored(page)).decks).toEqual([original]);
  await preview
    .getByRole('button', { name: '2件をインポート', exact: true })
    .click();
  await expect(preview).toHaveCount(0);
  const saved = await stored(page);
  expect(saved.decks).toHaveLength(3);
  expect(saved.decks.find((deck) => deck.id === original.id)).toEqual(original);
  expect(saved.draft).toEqual(draft);
  expect(
    saved.decks.find((deck) => deck.name === '既存デッキ（旧#2）'),
  ).toMatchObject({ main: { '05-002': 4 }, side: { '06-048': 2 } });
  expect(saved.decks.find((deck) => deck.name === 'サイドあり')).toMatchObject({
    main: { '02-005': 4 },
    side: { 'R-001': 1 },
  });
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'マイデッキをインポート', exact: true }),
  ).toBeEnabled();
  expect((await stored(page)).decks).toEqual(saved.decks);
  await page.locator('input[type=file]').setInputFiles({
    name: 'legacy.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(preview).toContainText('取り込み候補 0件・同じ内容で省略 3件');
  await expect(
    preview.getByRole('button', { name: '0件をインポート', exact: true }),
  ).toBeDisabled();
  expect((await stored(page)).decks).toEqual(saved.decks);
});
