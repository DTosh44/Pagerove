import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
for (const route of [
  '/library',
  '/members',
  '/books/new',
  '/history',
  '/recommendations',
  '/scan',
  '/books/copy-1',
]) {
  test(`accessible controls and contrast on ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.map((violation) => ({
        id: violation.id,
        nodes: violation.nodes.map((node) => ({
          target: node.target,
          summary: node.failureSummary,
        })),
      })),
    ).toEqual([]);
  });
}
