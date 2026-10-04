import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('reading-list action persists and refreshed suggestions exclude the saved book', async ({
  page,
}) => {
  await page.goto('/recommendations');
  await page.getByRole('button', { name: 'Find my next read' }).click();
  const feature = page.getByRole('region', { name: 'Primary recommendation' });
  await expect(feature).toBeVisible();
  const resultAudit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    resultAudit.violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
  const title = await feature.locator('h2').innerText();
  const bookPath = await feature.locator('a').first().getAttribute('href');
  await feature.getByRole('button', { name: 'Add to my reading list' }).click();
  await expect(feature.getByRole('button', { name: 'On your reading list' })).toBeDisabled();
  await page.goto(bookPath!);
  await expect(page.getByLabel('Reading status')).toHaveValue('want_to_read');
  await page.goto('/recommendations');
  await page.getByRole('button', { name: 'Find my next read' }).click();
  await expect(page.locator('.recommendations-page')).not.toContainText(title);
});
for (const width of [390, 430, 768, 1440]) {
  test(`intentional navigation and layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      '/home',
      '/library',
      '/members',
      '/recommendations',
      '/more',
      '/scan',
      '/books/copy-1',
    ]) {
      await page.goto(route);
      await expect(page.locator('h1')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        route,
      ).toBe(true);
    }
    if (width < 761) {
      const nav = page.getByRole('navigation', { name: 'Mobile navigation' });
      await expect(nav).toBeVisible();
      for (const name of ['Home', 'Library', 'Recommend', 'Family', 'More']) {
        const link = nav.getByRole('link', { name, exact: true });
        const box = await link.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
      await nav.getByRole('link', { name: 'More', exact: true }).click();
      await page
        .getByRole('link', { name: 'Reading history Catch up on the books you’ve enjoyed.' })
        .click();
      await expect(
        page.getByRole('heading', { name: 'Reading history', exact: true }),
      ).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(results.violations.map((violation) => violation.id)).toEqual([]);
    } else await expect(page.getByRole('navigation', { name: 'Desktop navigation' })).toBeVisible();
  });
}
test('onboarding keeps sign-in limitations honest and starts the existing demo', async ({
  page,
}) => {
  await page.goto('/welcome');
  await expect(
    page.getByRole('heading', { name: 'A more wonderful way to read together.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'I already have an account' }).click();
  await expect(page.getByRole('status')).toContainText('Sign-in is coming later');
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(
    page.getByRole('heading', { name: 'Good books. Closer than you think.' }),
  ).toBeVisible();
});
test('real cover failures have an editorial fallback and uploaded photos preview locally', async ({
  page,
}) => {
  await page.route('https://covers.openlibrary.org/**', (route) => route.abort());
  await page.goto('/books/copy-1');
  await expect(page.locator('.book-cover .cover-placeholder')).toBeVisible();
  await page.goto('/scan');
  await page.getByLabel('Shelf photo').setInputFiles('public/icon-192.png');
  const photo = page.getByRole('img', { name: 'Your selected bookshelf photo' });
  await expect(photo).toBeVisible();
  expect(await photo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(192);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
});
