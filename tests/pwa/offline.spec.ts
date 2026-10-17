import { test, expect } from '@playwright/test';
test('production assets, install manifest and offline fallback work together', async ({
  page,
  context,
  request,
}) => {
  const manifest = (await (await request.get('/manifest.webmanifest')).json()) as {
    icons: { src: string }[];
  };
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Our Library', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Your stories are safe.' })).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(249, 246, 239)');
});
