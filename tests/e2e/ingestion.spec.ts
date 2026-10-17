import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('multiple shelf photos, bulk accept, uncertain review and resume remain accessible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/scan');
  await page
    .getByLabel('Shelf photo', { exact: true })
    .setInputFiles('tests/fixtures/synthetic-shelf.png');
  await page
    .getByLabel('Additional shelf photo', { exact: true })
    .setInputFiles('public/icon-192.png');
  await expect(page.getByText('2 photos selected. Overlapping books are combined.')).toBeVisible();
  await page.getByRole('button', { name: 'Find sample books' }).click();
  await expect(page.getByRole('heading', { name: 'We found 3 sample books' })).toBeVisible();
  await expect(page.getByText('2 confident', { exact: true })).toBeVisible();
  const scanUrl = page.url();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations.map((violation) => violation.id)).toEqual([]);
  const correctedTitle = `Edited shelf book ${Date.now()}`;
  await page.getByLabel('Candidate title The Secret Garden').fill(correctedTitle);
  await expect(page.getByText('1 confident', { exact: true })).toBeVisible();
  let releaseBulk!: () => void;
  const bulkGate = new Promise<void>((resolve) => {
    releaseBulk = resolve;
  });
  await page.route('**/api/scans/*/accept-confident', async (route) => {
    await bulkGate;
    await route.continue();
  });
  await page.getByRole('button', { name: 'Accept all confident books' }).click();
  try {
    await expect(page.getByLabel('Candidate title The Secret Garden')).toBeDisabled();
  } finally {
    releaseBulk();
  }

  await expect(page.locator('.candidate')).toHaveCount(2);
  await expect(page.getByLabel('Candidate title The Secret Garden')).toHaveValue(correctedTitle);
  await page.getByRole('button', { name: 'Accept', exact: true }).first().click();
  await expect(page.locator('.candidate')).toHaveCount(1);
  await expect(page.getByText('1 need checking', { exact: true })).toBeVisible();
  await page.locator('.candidate summary').first().click();
  await page.locator('.metadata-option').click();
  await expect(page.getByLabel('Candidate title The Little Prince')).toHaveValue(
    'The Little Prince',
  );
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'All books reviewed.' })).toBeVisible();
  await page.goto('/scan');
  await page.locator(`a[href="${new URL(scanUrl).pathname}"]`).click();
  await expect(page.locator('.candidate .confirmed')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('manual title metadata search fills the same confirmation form; unavailable lookup preserves manual entry', async ({
  page,
}) => {
  await page.goto('/books/new');
  await page.getByLabel('Search title', { exact: true }).fill('The Secret Garden');
  await page.getByLabel('Search author', { exact: false }).fill('Frances Hodgson Burnett');
  await page.getByRole('button', { name: 'Look up book' }).click();
  await page.locator('.metadata-option').click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('The Secret Garden');
  await expect(page.getByLabel('Author', { exact: true })).toHaveValue('Frances Hodgson Burnett');
  await page.route('**/api/metadata/lookup', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":"Book provider unavailable."}',
    }),
  );
  await page.getByRole('button', { name: 'Look up book' }).click();
  await expect(page.getByRole('alert')).toContainText('Book provider unavailable');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('The Secret Garden');
});
