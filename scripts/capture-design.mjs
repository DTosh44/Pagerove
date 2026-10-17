import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch();
const directory = 'docs/design/screenshots';
await mkdir(directory, { recursive: true });
try {
  for (const [name, width, height] of [
    ['mobile', 390, 844],
    ['desktop', 1440, 1100],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    // Review only the original demo titles; keep test-generated additions out of design screenshots.
    await page.route('**/api/state', async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      data.books = data.books.filter((book) => /^copy-\d+$/.test(book.id));
      await route.fulfill({ response, json: data });
    });
    for (const [screen, path] of [
      ['onboarding', '/welcome'],
      ['home', '/home'],
      ['library', '/library'],
      ['recommendations', '/recommendations'],
      ['people', '/members'],
      ['scan', '/scan'],
      ['book', '/books/copy-1'],
    ]) {
      await page.goto('http://127.0.0.1:5173' + path);
      await page.locator('h1').waitFor();
      if (screen === 'recommendations') {
        await page.getByLabel('Reading profile').selectOption('sam');
        await page.getByRole('button', { name: 'Funny', exact: true }).click();
        await page.getByRole('button', { name: 'Find my next read' }).click();
        await page.locator('.recommendation-feature').waitFor();
      }
      await page.evaluate(() => document.fonts.ready);
      await page
        .waitForFunction(
          () => [...document.images].every((image) => image.complete),
          {},
          { timeout: 15000 },
        )
        .catch(() => {});
      await page.screenshot({
        path: `${directory}/${name}-${screen}.png`,
        fullPage: false,
      });
    }
    await page.close();
  }
} finally {
  await browser.close();
}
