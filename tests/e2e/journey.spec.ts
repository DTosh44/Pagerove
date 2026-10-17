import { test, expect } from '@playwright/test';
test('library, manual addition, reading history, recommendations and scan review', async ({
  page,
}) => {
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Your library', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/library-desktop.png', fullPage: false });
  await page.getByRole('textbox', { name: 'Search title or author' }).fill('Hobbit');
  await expect(page.getByRole('heading', { name: 'The Hobbit', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Add a book', exact: true }).last().click();
  const title = `A story for testing ${Date.now()}`;
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Author', { exact: true }).fill('PageRove Reader');
  await page.getByRole('button', { name: 'Add to your library' }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.getByLabel('Reading status').selectOption('read');
  await page.getByLabel('Your rating').selectOption('5');
  await page.getByRole('button', { name: 'Save reading history' }).click();
  await expect(page.getByRole('status')).toContainText('Reading history saved');
  await page.reload();
  await expect(page.getByLabel('Reading status')).toHaveValue('read');
  await page.getByRole('link', { name: 'What should I read?', exact: true }).click();
  await page.getByRole('button', { name: 'Gripping', exact: true }).click();
  await page.getByRole('button', { name: 'Find my next read' }).click();
  await expect(page.getByRole('heading', { name: 'Waiting for you at home' })).toBeVisible();
  await expect(page.locator('.recommendation-grid .book-card')).toHaveCount(3);
  await expect(page.locator('.recommendation-grid')).not.toContainText(title);
  await page.getByRole('link', { name: 'Scan your shelves' }).click();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'shelf.png', mimeType: 'image/png', buffer: Buffer.from('sample') });
  await page.getByRole('button', { name: 'Preview sample recognition' }).click();
  await expect(page.getByRole('heading', { name: 'PageRove found 3 sample books' })).toBeVisible();
  await page.getByLabel('Candidate title The Secret Garden').fill('The edited garden');
  await page.getByRole('button', { name: 'Accept', exact: true }).first().click();
  await expect(page.getByText('Added to your library', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Added to your library', { exact: true })).toBeVisible();
});
test('mobile library has no horizontal overflow and supports profile filtering', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Your library', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/library-mobile.png', fullPage: false });
  await page.getByLabel('Reading profile').selectOption('ella');
  await page.getByRole('button', { name: 'Unread', exact: true }).click();
  await expect(page.locator('.results-label')).toContainText('Ella');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
