import { test, expect } from '@playwright/test';
import { seed, stored } from './helpers.mjs';

const themeKey = 'ijinden-deckbook-theme';
const selector = (page) =>
  page.getByRole('combobox', { name: '表示テーマ', exact: true });
const expectTheme = async (page, theme) => {
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
};

// Resolve CSS colors in the browser, including alpha surfaces, then check the
// actual foreground/background pair instead of coupling this to palette values.
const textContrast = (locator) =>
  locator.evaluate((element) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    const rgba = (color) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data);
    };
    const layers = [];
    for (let node = element; node; node = node.parentElement) {
      layers.push(rgba(getComputedStyle(node).backgroundColor));
    }
    const background = layers
      .reverse()
      .reduce(
        (base, color) =>
          base.map(
            (channel, i) =>
              (color[i] * color[3]) / 255 + channel * (1 - color[3] / 255),
          ),
        [255, 255, 255],
      );
    const luminance = (color) =>
      color
        .slice(0, 3)
        .map((channel) => {
          const srgb = channel / 255;
          return srgb <= 0.04045
            ? srgb / 12.92
            : ((srgb + 0.055) / 1.055) ** 2.4;
        })
        .reduce(
          (sum, channel, i) => sum + channel * [0.2126, 0.7152, 0.0722][i],
          0,
        );
    const fg = luminance(rgba(getComputedStyle(element).color));
    const bg = luminance(background);
    return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  });

test('system theme follows the device while explicit choices survive reload without changing decks', async ({
  context,
  page,
}) => {
  await seed(context);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./');
  await expect(selector(page)).toHaveValue('system');
  await expectTheme(page, 'dark');
  const before = await stored(page);

  await page.emulateMedia({ colorScheme: 'light' });
  await expectTheme(page, 'light');
  await selector(page).selectOption('dark');
  await expectTheme(page, 'dark');
  await page.reload();
  await expect(selector(page)).toHaveValue('dark');
  await expectTheme(page, 'dark');

  await page.emulateMedia({ colorScheme: 'dark' });
  await selector(page).selectOption('light');
  await expectTheme(page, 'light');
  await page.reload();
  await expectTheme(page, 'light');
  await expect(selector(page)).toHaveValue('light');
  await selector(page).selectOption('system');
  await expectTheme(page, 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expectTheme(page, 'light');
  expect(await stored(page)).toEqual(before);
});

test('theme preferences synchronize across tabs and removal restores system behavior', async ({
  context,
  page,
}) => {
  await seed(context);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('./');
  const other = await context.newPage();
  await other.emulateMedia({ colorScheme: 'light' });
  await other.goto('./');
  await expect(selector(other)).toHaveValue('system');
  await selector(page).selectOption('dark');
  await expect(selector(other)).toHaveValue('dark');
  await expectTheme(other, 'dark');
  await other.evaluate((key) => localStorage.removeItem(key), themeKey);
  await expect(selector(page)).toHaveValue('system');
  await expectTheme(page, 'light');
});

test('invalid saved preferences safely fall back to the device appearance', async ({
  context,
  page,
}) => {
  await seed(context);
  await context.addInitScript(
    (key) => localStorage.setItem(key, 'invalid-theme'),
    themeKey,
  );
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./');
  await expect(selector(page)).toHaveValue('system');
  await expectTheme(page, 'dark');
  await selector(page).selectOption('light');
  await expectTheme(page, 'light');
});

test('theme selection remains usable when browser storage is unavailable', async ({
  context,
  page,
}) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Storage blocked', 'SecurityError');
      },
    });
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('./');
  await expect(selector(page)).toHaveValue('system');
  await selector(page).selectOption('dark');
  await expectTheme(page, 'dark');
  await selector(page).selectOption('light');
  await expectTheme(page, 'light');
});

test('theme control fits a narrow phone and dark appearance covers tabs and card details', async ({
  context,
  page,
}) => {
  await seed(context);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('./');
  await selector(page).selectOption('dark');
  await expectTheme(page, 'dark');
  await expect(selector(page)).toBeInViewport();
  await expect(
    page.getByRole('button', { name: 'マイデッキをインポート', exact: true }),
  ).toBeInViewport();
  const control = await selector(page).boundingBox();
  expect(control.x).toBeGreaterThanOrEqual(0);
  expect(control.x + control.width).toBeLessThanOrEqual(320);

  for (const name of ['レシピ', 'マイデッキ', 'シミュ', 'ヘルプ', 'カード']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await expectTheme(page, 'dark');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
  }
  await page
    .getByRole('button', {
      name: '織田信長（01-001）の詳細を開く',
      exact: true,
    })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const channels = await dialog.evaluate((element) =>
    getComputedStyle(element)
      .backgroundColor.match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number),
  );
  expect(Math.max(...channels)).toBeLessThan(100);
  await expect(
    dialog.getByRole('heading', { name: '織田信長', exact: true }),
  ).toBeVisible();
});

test('colored card IDs and saved-deck rows remain legible in dark mode', async ({
  context,
  page,
}) => {
  await seed(context);
  await page.goto('./');
  await selector(page).selectOption('dark');
  for (const label of ['赤色・01-001', '青色・01-003', '緑色・01-005']) {
    await expect
      .poll(() =>
        textContrast(page.getByRole('cell', { name: label, exact: true })),
      )
      .toBeGreaterThanOrEqual(4.5);
  }
  await page.getByRole('tab', { name: 'マイデッキ', exact: true }).click();
  const name = page.getByText('既存デッキ', { exact: true });
  for (const color of ['オレンジ', 'グレー', '標準']) {
    await page
      .getByRole('button', { name: '既存デッキの色を変更', exact: true })
      .click();
    await page.getByRole('button', { name: color, exact: true }).click();
    await expect.poll(() => textContrast(name)).toBeGreaterThanOrEqual(4.5);
  }
});
