import { afterEach, describe, expect, it } from 'vitest';
import app from '../worker/index';
import { Repository } from '../worker/repository';
import { database } from './database';
import type { LibraryState, Scan } from '../src/domain/types';
const databases: ReturnType<typeof database>[] = [];
function setup(seed = true) {
  const instance = database(seed);
  databases.push(instance);
  return instance;
}
afterEach(() => databases.splice(0).forEach((instance) => instance.sqlite.close()));
async function call(
  db: D1Database,
  path: string,
  method = 'GET',
  data?: unknown,
  origin = 'https://pagerove.test',
) {
  return app.fetch(
    new Request(`https://pagerove.test/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: data ? JSON.stringify(data) : undefined,
    }),
    { DB: db, APP_MODE: 'demo' },
  );
}
describe('D1 API journey', () => {
  it('creates a household, adult and child profiles and a shared book on an empty database', async () => {
    const { db } = setup(false);
    expect(
      (await call(db, '/households', 'POST', { name: 'Our shelves', displayName: 'Parent' }))
        .status,
    ).toBe(201);
    expect(
      (await call(db, '/members', 'POST', { displayName: 'Young reader', type: 'child' })).status,
    ).toBe(201);
    expect(
      (await call(db, '/books', 'POST', { title: 'Shared book', author: 'Writer' })).status,
    ).toBe(201);
    const state = (await (await call(db, '/state')).json()) as LibraryState;
    expect(state.members).toHaveLength(2);
    expect(state.books).toHaveLength(1);
    expect(
      (await call(db, '/households', 'POST', { name: 'Duplicate', displayName: 'Me' })).status,
    ).toBe(409);
  });
  it('seeds 24 copies and independent records for four readers idempotently', async () => {
    const { db, sqlite } = setup();
    const state = (await (await call(db, '/state')).json()) as LibraryState;
    expect(state.members).toHaveLength(4);
    expect(state.books).toHaveLength(24);
    expect(state.books.every((book) => book.records.length === 4)).toBe(true);
    expect(() =>
      sqlite.exec("INSERT INTO book_ratings VALUES ('bad','household-demo','alex','copy-1',6)"),
    ).toThrow();
  });
  it('updates multiple books without changing other readers or duplicating copies', async () => {
    const { db } = setup();
    const before = (await (await call(db, '/state')).json()) as LibraryState;
    const samBefore = before.books
      .find((book) => book.id === 'copy-1')
      ?.records.find((record) => record.memberId === 'sam');
    expect(
      (
        await call(db, '/history', 'PUT', {
          memberId: 'alex',
          bookIds: ['copy-1', 'copy-2'],
          status: 'read',
          rating: 5,
        })
      ).status,
    ).toBe(200);
    const after = (await (await call(db, '/state')).json()) as LibraryState;
    expect(after.books).toHaveLength(24);
    expect(
      after.books
        .find((book) => book.id === 'copy-1')
        ?.records.find((record) => record.memberId === 'sam'),
    ).toEqual(samBefore);
    expect(
      after.books
        .find((book) => book.id === 'copy-2')
        ?.records.find((record) => record.memberId === 'alex')?.rating,
    ).toBe(5);
  });
  it('checks partial date edits against saved dates before writing', async () => {
    const { db } = setup();
    const first = {
      memberId: 'alex',
      bookIds: ['copy-1'],
      status: 'read',
      startedDate: '2026-09-01',
      finishedDate: '2026-09-20',
    };
    expect((await call(db, '/history', 'PUT', first)).status).toBe(200);
    expect(
      (
        await call(db, '/history', 'PUT', {
          memberId: 'alex',
          bookIds: ['copy-1'],
          status: 'reading',
          startedDate: '2026-10-01',
        })
      ).status,
    ).toBe(400);
    const state = (await (await call(db, '/state')).json()) as LibraryState;
    expect(
      state.books
        .find((book) => book.id === 'copy-1')
        ?.records.find((record) => record.memberId === 'alex')?.status,
    ).toBe('read');
  });
  it('rejects cross-household profile and book references, including mixed bulk writes', async () => {
    const { db, sqlite } = setup();
    const other = new Repository(db, 'other-user');
    await other.createHousehold('Other', 'Other reader');
    const otherState = await other.state(await other.household());
    expect(
      (
        await call(db, '/history', 'PUT', {
          memberId: otherState.members[0].id,
          bookIds: ['copy-1'],
          status: 'read',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call(db, '/history', 'PUT', {
          memberId: 'alex',
          bookIds: ['copy-1', 'foreign-book'],
          status: 'read',
        })
      ).status,
    ).toBe(404);
    expect(() =>
      sqlite.exec(
        `INSERT INTO reading_records(id,household_id,member_id,household_book_id,status) VALUES ('bad','${otherState.household!.id}','${otherState.members[0].id}','copy-1','read')`,
      ),
    ).toThrow();
  });
  it('returns and persists up to three owned unread recommendations', async () => {
    const { db, sqlite } = setup();
    const state = (await (await call(db, '/state')).json()) as LibraryState;
    const response = await call(db, '/recommendations', 'POST', {
      memberId: 'alex',
      request: 'Gripping mystery',
    });
    const result = (await response.json()) as { recommendations: { bookId: string }[] };
    expect(result.recommendations).toHaveLength(3);
    for (const rec of result.recommendations)
      expect(
        state.books
          .find((book) => book.id === rec.bookId)
          ?.records.find((record) => record.memberId === 'alex')?.status,
      ).toBe('unread');
    expect(sqlite.prepare('SELECT count(*) AS n FROM recommendations').get()?.n).toBe(3);
  });
  it('accepts edited scan results once and never adds rejected candidates', async () => {
    const { db, sqlite } = setup();
    const scan = (await (
      await call(db, '/scans', 'POST', {
        filename: 'shelf.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1234,
      })
    ).json()) as Scan;
    const url = `/scans/${scan.id}/candidates/${scan.candidates[0].id}`;
    const input = { action: 'accept', title: 'Corrected title', author: 'Corrected author' };
    const responses = await Promise.all([call(db, url, 'PUT', input), call(db, url, 'PUT', input)]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(
      (
        await call(db, `/scans/${scan.id}/candidates/${scan.candidates[1].id}`, 'PUT', {
          action: 'reject',
        })
      ).status,
    ).toBe(200);
    expect(sqlite.prepare('SELECT count(*) AS n FROM household_books').get()?.n).toBe(25);
    expect(
      sqlite.prepare("SELECT count(*) AS n FROM books WHERE title='Corrected title'").get()?.n,
    ).toBe(1);
    const resumed = (await (await call(db, `/scans/${scan.id}`)).json()) as Scan;
    expect(resumed.candidates[0].confirmationState).toBe('accepted');
  });
  it('fails closed outside demo mode and rejects cross-origin writes and invalid data', async () => {
    const { db } = setup();
    expect(
      (
        await app.fetch(new Request('https://pagerove.test/api/state'), {
          DB: db,
          APP_MODE: 'locked',
        })
      ).status,
    ).toBe(503);
    expect(
      (await call(db, '/books', 'POST', { title: 'Book', author: 'Author' }, 'https://evil.test'))
        .status,
    ).toBe(403);
    expect((await call(db, '/books', 'POST', { title: '', author: 'Author' })).status).toBe(400);
    expect(
      (await call(db, '/history', 'PUT', { memberId: 'alex', bookIds: [], status: 'read' })).status,
    ).toBe(400);
  });
});
