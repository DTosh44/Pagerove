import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('docs/ingestion/screenshots', { recursive: true });
const browser = await chromium.launch();
for (const [name, width] of [
  ['mobile', 390],
  ['desktop', 1440],
]) {
  const page = await browser.newPage({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 });
  const candidates = [
    ['The Secret Garden', 'Frances Hodgson Burnett', 0.98],
    ['A Walk in the Woods', 'Bill Bryson', 0.98],
    ['The Little Prince', 'Antoine de Saint-Exupéry', 0.84],
  ].map(([title, author, confidence], index) => {
    const metadata = {
      id: `mock:${index}`,
      provider: 'mock',
      sourceId: String(index),
      title,
      authors: [author],
      format: 'paperback',
      year: 2000 + index,
      categories: ['Fiction'],
    };
    return {
      id: String(index),
      probableTitle: title,
      probableAuthor: author,
      probableIsbn: null,
      confidence,
      rawConfidence: index === 2 ? 0.63 : 0.96,
      band: index === 2 ? 'MEDIUM' : 'HIGH',
      metadata,
      alternatives: [
        { metadata, score: 0.98, band: 'HIGH', reasons: ['Title agrees', 'Author agrees'] },
      ],
      sourceImageId: 'photo1',
      sourceImageIds: ['photo1'],
      confirmationState: 'pending',
      householdBookId: null,
    };
  });
  const scan = {
    id: 'design-preview',
    status: 'review',
    candidates,
    images: [{ id: 'photo1', state: 'completed', error: null }],
    warnings: [],
  };
  await page.route('**/api/scans/design-preview', (route) => route.fulfill({ json: scan }));
  await page.route('**/api/scans', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ json: scan })
      : route.fulfill({ json: [] }),
  );
  await page.goto('http://127.0.0.1:5173/scan');
  await page.getByLabel('Shelf photo').setInputFiles('tests/fixtures/synthetic-shelf.png');
  await page.locator('h1').click();
  await page.screenshot({ path: `docs/ingestion/screenshots/${name}-upload.png`, fullPage: true });
  await page.getByRole('button', { name: 'Find sample books' }).click();
  await page.getByRole('heading', { name: 'We found 3 sample books' }).waitFor();
  await page.locator('h1').click();
  await page.screenshot({ path: `docs/ingestion/screenshots/${name}-review.png`, fullPage: true });
  await page.close();
}
await browser.close();
