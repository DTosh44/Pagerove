import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const mark = await readFile('public/brand/mark.svg', 'utf8');
const browser = await chromium.launch();
try {
  for (const size of [192, 512]) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<html><style>html,body{margin:0;width:100%;height:100%;background:#F9F6EF}body{display:grid;place-items:center}svg{width:64%;height:72%}</style>${mark}</html>`,
    );
    await page.screenshot({ path: `public/icon-${size}.png` });
    await page.close();
  }
} finally {
  await browser.close();
}
