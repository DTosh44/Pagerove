import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
const titles = [
  'The Secret Garden',
  'A Walk in the Woods',
  'The Little Prince',
  'Atomic Habits',
  'The Hobbit',
  'Dune',
  'Dune Messiah',
  'Pride and Prejudice',
  'Jane Eyre',
  'Little Women',
  'The Wind in the Willows',
  'Treasure Island',
  'Dracula',
  'Frankenstein',
  'The Odyssey',
  'The Time Machine',
  'The Adventures of Sherlock Holmes',
  'A Room of One’s Own',
  'The Great Gatsby',
  'Persuasion',
  'The Call of the Wild',
  'The Railway Children',
  'The Jungle Book',
  'Anne of Green Gables',
];
const authors = [
  'Frances Hodgson Burnett',
  'Bill Bryson',
  'Antoine de Saint-Exupéry',
  'James Clear',
  'J. R. R. Tolkien',
  'Frank Herbert',
  'Frank Herbert',
  'Jane Austen',
  'Charlotte Brontë',
  'Louisa May Alcott',
  'Kenneth Grahame',
  'Robert Louis Stevenson',
  'Bram Stoker',
  'Mary Shelley',
  'Homer',
  'H. G. Wells',
  'Arthur Conan Doyle',
  'Virginia Woolf',
  'F. Scott Fitzgerald',
  'Jane Austen',
  'Jack London',
  'E. Nesbit',
  'Rudyard Kipling',
  'L. M. Montgomery',
];
const colors = ['#193e51', '#da6b51', '#809d89', '#e7cf9d', '#243245', '#ecb671'];
const expected = titles.map((title, index) => ({
  title,
  author: authors[index],
  orientation: index === 7 || index === 18 ? 'upside-down' : index >= 20 ? 'stacked' : 'vertical',
  partial: index === 11 || index === 23,
}));
let content = '';
for (let i = 0; i < 20; i++) {
  const row = i < 12 ? 0 : 1,
    col = row === 0 ? i : i - 12,
    x = 60 + col * 88,
    y = row === 0 ? 66 : 500,
    h = 320 + (i % 3) * 15;
  const upside = i === 7 || i === 18;
  content += `<g transform="translate(${x} ${y}) rotate(${i % 5 === 0 ? -3 : 1})"><rect width="76" height="${h}" rx="3" fill="${colors[i % colors.length]}" stroke="#302719" stroke-width="2"/><path d="M7 4v${h - 8}" stroke="#ffffff" opacity=".2"/><g transform="${upside ? `translate(38 12) rotate(90)` : `translate(38 ${h - 12}) rotate(-90)`}"><text x="0" y="-6" font-family="${i % 3 === 0 ? 'Georgia' : 'Arial'}" font-size="${titles[i].length > 25 ? 16 : 21}" fill="${i % 6 === 3 || i % 6 === 5 ? '#29211b' : '#fff7dc'}">${titles[i].replaceAll('&', '&amp;')}</text><text x="2" y="17" font-family="Arial" font-size="11" fill="${i % 6 === 3 || i % 6 === 5 ? '#29211b' : '#fff7dc'}">${authors[i]}</text></g></g>`;
}
for (let i = 20; i < 24; i++) {
  const y = 520 + (i - 20) * 68;
  content += `<g transform="translate(800 ${y}) rotate(${i === 22 ? -4 : 1})"><rect width="390" height="60" rx="4" fill="${colors[i % 6]}" stroke="#302719" stroke-width="2"/><text x="18" y="25" fill="#fff7dc" font-family="Georgia" font-size="21">${titles[i]}</text><text x="18" y="46" fill="#fff7dc" font-family="Arial" font-size="12">${authors[i]}</text></g>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="960"><defs><linearGradient id="wood" x2="0" y2="1"><stop stop-color="#654737"/><stop offset="1" stop-color="#b99265"/></linearGradient><radialGradient id="light"><stop stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity=".22"/></radialGradient></defs><rect width="1280" height="960" fill="url(#wood)"/><path d="M0 55h1280M0 465h1280M0 900h1280" stroke="#36251d" stroke-width="42"/>${content}<rect x="1090" y="50" width="120" height="390" fill="#795b41"/><rect x="1130" y="734" width="150" height="155" fill="#795b41"/><rect width="1280" height="960" fill="url(#light)"/></svg>`;
await mkdir('tests/fixtures', { recursive: true });
await writeFile('tests/fixtures/synthetic-shelf.svg', svg);
await writeFile(
  'tests/fixtures/synthetic-shelf.expected.json',
  JSON.stringify({ synthetic: true, books: expected }, null, 2) + '\n',
);
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 960 },
  deviceScaleFactor: 1,
});
await page.setContent(`<style>body{margin:0}</style>${svg}`);
await page.screenshot({ path: 'tests/fixtures/synthetic-shelf.png' });
await browser.close();
