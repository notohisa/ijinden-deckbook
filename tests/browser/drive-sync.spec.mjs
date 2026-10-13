import { test, expect } from '@playwright/test';
import { seed, original, key } from './helpers.mjs';

test.skip(
  process.env.SYNC_BROWSER_TESTS !== '1',
  'Build with a public test client ID and set SYNC_BROWSER_TESTS=1 for mocked Google tests.',
);
test.setTimeout(180_000);
const accountKey = `${key}:google:111`;

function cloud() {
  return { files: new Map(), writes: 0, nextId: 1, fail: 0 };
}
async function setup(context, server, sub = '111') {
  await seed(context);
  await context.addInitScript((sub) => {
    window.mockGoogleSub = sub;
    window.google = {
      accounts: {
        oauth2: {
          hasGrantedAllScopes: () => true,
          initTokenClient: ({ callback }) => ({
            requestAccessToken: () =>
              callback({
                access_token: `test-${window.mockGoogleSub}`,
                expires_in: 3600,
              }),
          }),
        },
      },
    };
  }, sub);
  await context.route('https://**googleapis.com/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const owner = request.headers().authorization?.replace('Bearer test-', '');
    const respond = (value, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(value),
      });
    if (url.hostname === 'openidconnect.googleapis.com')
      return respond({ sub: owner, email: `${owner}@example.com` });
    if (server.fail)
      return respond(
        { error: { errors: [{ reason: 'rateLimitExceeded' }] } },
        server.fail,
      );
    if (request.method() === 'GET' && url.pathname === '/drive/v3/files')
      return respond({
        files: [...server.files]
          .filter(([, f]) => f.owner === owner)
          .map(([id, f]) => ({
            id,
            name: f.name,
            mimeType: 'application/json',
          })),
      });
    const fileId = url.pathname.split('/').at(-1);
    if (request.method() === 'GET') {
      const file = server.files.get(fileId);
      return file?.owner === owner ? respond(file.snapshot) : respond({}, 404);
    }
    const data = request.postData();
    if (request.method() === 'POST') {
      const jsonParts = data
        .split('\r\n')
        .filter((line) => line.startsWith('{'))
        .map((line) => JSON.parse(line));
      const [meta, snapshot] = jsonParts;
      const id = `file-${server.nextId++}`;
      server.files.set(id, { name: meta.name, snapshot, owner });
      server.writes++;
      return respond({ id });
    }
    const file = server.files.get(fileId);
    if (request.method() === 'DELETE' && file?.owner === owner) {
      server.files.delete(fileId);
      return route.fulfill({ status: 204, body: '' });
    }
    if (request.method() === 'PATCH' && file?.owner === owner) {
      file.snapshot = JSON.parse(data);
      server.writes++;
      return respond({ id: fileId });
    }
    return respond({}, 400);
  });
}
async function login(page) {
  await page.goto('./');
  await page.getByRole('tab', { name: 'マイデッキ', exact: true }).click();
  await page.getByRole('button', { name: 'Googleで接続', exact: true }).click();
  await expect(
    page.getByText('保存先：111@example.com', { exact: true }),
  ).toBeVisible();
}
async function sync(page) {
  await page
    .getByRole('button', { name: '同期内容を確認', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: '同期内容の確認' });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('button', { name: 'この内容で同期', exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
}
async function importLocal(page) {
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('button', { name: 'この端末だけのデッキを追加', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: /^既存デッキ ✅/ }),
  ).toBeVisible();
}
async function archive(page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    accountKey,
  );
}
async function rename(page, old, next) {
  await page
    .getByRole('button', { name: `${old}の名前を変更`, exact: true })
    .click();
  await page.getByRole('textbox', { name: 'デッキ名', exact: true }).fill(next);
  await page.getByRole('button', { name: '変更を保存', exact: true }).click();
  await expect(
    page.getByRole('button', { name: `${next}の名前を変更`, exact: true }),
  ).toBeVisible();
}

test('two isolated devices sync, trash, restore, and keep other Google accounts separate', async ({
  page,
  context,
  browser,
}) => {
  const server = cloud();
  await setup(context, server);
  await login(page);
  await expect(page.getByText('保存済みのデッキはありません。')).toBeVisible();
  await importLocal(page);
  await sync(page);
  const otherContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  try {
    await setup(otherContext, server);
    const other = await otherContext.newPage();
    await login(other);
    await sync(other);
    expect((await archive(other)).decks.map((d) => d.id)).toEqual([
      original.id,
    ]);
    other.once('dialog', (dialog) => dialog.accept());
    await other
      .getByRole('button', { name: `${original.name}を削除`, exact: true })
      .click();
    await sync(other);
    await sync(page);
    expect((await archive(page)).decks).toEqual([]);
    await page.getByText('ゴミ箱（1件）', { exact: true }).click();
    await page.getByRole('button', { name: '復元', exact: true }).click();
    await sync(page);
    await sync(other);
    expect((await archive(other)).decks[0].id).toBe(original.id);
    await page.getByRole('button', { name: 'ログアウト', exact: true }).click();
    await page.getByRole('tab', { name: 'マイデッキ', exact: true }).click();
    await expect(
      page.getByText('保存先：この端末のみ', { exact: true }),
    ).toBeVisible();
    await page.evaluate(() => {
      window.mockGoogleSub = '222';
    });
    await page
      .getByRole('button', { name: 'Googleで接続', exact: true })
      .click();
    await expect(
      page.getByText('保存先：222@example.com', { exact: true }),
    ).toBeVisible();
    await sync(page);
    const otherAccount = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(`${key}:google:222`)),
      key,
    );
    expect(otherAccount.decks).toEqual([]);
    expect((await archive(page)).decks[0].id).toBe(original.id);
    const persisted = await page.evaluate(() =>
      JSON.stringify([
        Object.keys(localStorage).map((key) => localStorage.getItem(key)),
        Object.keys(sessionStorage).map((key) => sessionStorage.getItem(key)),
      ]),
    );
    expect(persisted).not.toContain('test-111');
    expect(persisted).not.toContain('test-222');
  } finally {
    await otherContext.close();
  }
});

test('concurrent edits require a choice and preserve both versions', async ({
  page,
  context,
  browser,
}) => {
  const server = cloud();
  await setup(context, server);
  await login(page);
  await importLocal(page);
  await sync(page);
  const otherContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  try {
    await setup(otherContext, server);
    const other = await otherContext.newPage();
    await login(other);
    await sync(other);
    await rename(page, original.name, 'スマホ版');
    await rename(other, original.name, 'PC版');
    await sync(page);
    await other
      .getByRole('button', { name: '同期内容を確認', exact: true })
      .click();
    const dialog = other.getByRole('dialog', { name: '同期内容の確認' });
    await expect(
      dialog.getByRole('button', { name: 'この内容で同期' }),
    ).toBeDisabled();
    await dialog.getByLabel('内容を別々のデッキとして残す').check();
    await dialog.getByRole('button', { name: 'この内容で同期' }).click();
    await expect(dialog).toHaveCount(0);
    await sync(page);
    expect((await archive(page)).decks.map((d) => d.name).sort()).toEqual([
      'PC版',
      'スマホ版',
    ]);
    await other.screenshot({
      path: 'outputs/drive-sync-desktop.png',
      fullPage: true,
    });
    await page.screenshot({
      path: 'outputs/drive-sync-mobile.png',
      fullPage: true,
    });
  } finally {
    await otherContext.close();
  }
});

test('quota failures and newer cloud formats never erase local decks or report success', async ({
  page,
  context,
}) => {
  const server = cloud();
  await setup(context, server);
  await login(page);
  await importLocal(page);
  await sync(page);
  await rename(page, original.name, '未同期の変更');
  server.fail = 429;
  const before = await archive(page);
  const writes = server.writes;
  await page
    .getByRole('button', { name: '同期内容を確認', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(/制限|上限/);
  expect(await archive(page)).toEqual(before);
  expect(server.writes).toBe(writes);
  server.fail = 0;
  [...server.files.values()][0].snapshot.version = 2;
  await page
    .getByRole('button', { name: '同期内容を確認', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('新しい形式');
  expect(await archive(page)).toEqual(before);
  expect(server.writes).toBe(writes);
});
