import { describe, expect, it, vi } from 'vitest';
import { database } from './database';
import app from '../worker/index';
import { Repository } from '../worker/repository';
import { mockMetadataProvider } from '../src/providers/mock';
import {
  confidenceBand,
  deduplicateEnriched,
  deduplicateRecognition,
  enrich,
  matchBook,
  normalizeAuthor,
  normalizeIsbn,
  normalizeTitle,
  rankMatches,
  sameWork,
} from '../worker/ingestion/matching';
import {
  GoogleBooksMetadataProvider,
  normalizeGoogleVolume,
  OpenAIRecognitionProvider,
  ProviderError,
  providerJson,
  providers,
} from '../worker/ingestion/providers';
import { uploadImages, processScan, createScan } from '../worker/ingestion/scans';
import type { BookMetadata, RecognizedBook } from '../src/domain/ingestion';
import type { Scan } from '../src/domain/types';
import { readFileSync } from 'node:fs';
const metadata: BookMetadata = {
  id: 'test:atomic',
  provider: 'test',
  sourceId: 'atomic',
  title: 'Atomic Habits',
  authors: ['James Clear'],
  isbn10: '0735211299',
  isbn13: '9780735211292',
  format: 'hardback',
  categories: ['Self-help'],
  year: 2018,
  language: 'en',
};
const recognized: RecognizedBook = {
  probableTitle: 'Atomic Habits',
  probableAuthor: 'James Clear',
  probableIsbn: null,
  confidence: 0.96,
  sourceImageId: 'photo1',
};
async function call(db: D1Database, path: string, method = 'GET', data?: unknown) {
  return app.fetch(
    new Request(`https://pagerove.test/api${path}`, {
      method,
      headers: data ? { 'Content-Type': 'application/json' } : {},
      body: data ? JSON.stringify(data) : undefined,
    }),
    { DB: db, APP_MODE: 'demo' },
  );
}
const repoState = async (db: D1Database) =>
  new Repository(db, 'user-demo').state(await new Repository(db, 'user-demo').household());
const fakeFetch = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>(async () => Response.json(body, { status }));
describe('matching and normalization', () => {
  it('normalizes punctuation, accents, subtitles and author order while preserving different works', () => {
    expect(normalizeTitle(' ATOMIC Habits: A proven way! ')).toBe('atomic habits');
    expect(normalizeAuthor('Clear, James')).toBe(normalizeAuthor('James Clear'));
    expect(normalizeAuthor('J. R. R. Tolkien')).toBe(normalizeAuthor('J.R.R. Tolkien'));
    expect(
      sameWork(
        { title: 'Atomic Habits: A proven way', author: 'Clear, James' },
        { title: 'Atomic Habits', author: 'James Clear' },
      ),
    ).toBe(true);
    expect(
      sameWork(
        { title: 'Dune Messiah', author: 'Frank Herbert' },
        { title: 'Dune', author: 'Frank Herbert' },
      ),
    ).toBe(false);
    expect(
      sameWork(
        { title: 'The Garden', author: 'A Writer' },
        { title: 'The Garden', author: 'Different Writer' },
      ),
    ).toBe(false);
    expect(
      sameWork(
        { title: 'The Saga: Volume One', author: 'Writer' },
        { title: 'The Saga: Volume Two', author: 'Writer' },
      ),
    ).toBe(false);
  });
  it('validates both ISBN checksums and equates ISBN-10/13', () => {
    expect(normalizeIsbn('ISBN-10: 0-7352-1129-9')).toBe('9780735211292');
    expect(normalizeIsbn('978-0-7352-1129-2')).toBe('9780735211292');
    expect(normalizeIsbn('9780735211293')).toBeNull();
    expect(normalizeIsbn('123')).toBeNull();
    expect(normalizeIsbn('080442957X')).toBe('9780804429573');
  });
  it('ranks exact ISBN over text, fuzzy titles/authors, title-only and mismatched editions', () => {
    expect(rankMatches({ isbn: '0735211299' }, [metadata])[0].band).toBe('HIGH');
    expect(
      rankMatches({ title: 'Atomic Habit', author: 'James Clear' }, [metadata])[0].score,
    ).toBeGreaterThan(0.9);
    expect(rankMatches({ title: 'Atomic Habits' }, [metadata])[0].band).toBe('MEDIUM');
    expect(
      rankMatches(
        {
          title: 'Atomic Habits',
          author: 'James Clear',
          language: 'fr',
          year: 2020,
          format: 'ebook',
        },
        [metadata],
      )[0].band,
    ).toBe('LOW');
    expect(confidenceBand(0.9)).toBe('HIGH');
    expect(confidenceBand(0.65)).toBe('MEDIUM');
    expect(confidenceBand(0.64)).toBe('LOW');
  });
  it('does not let raw recognition confidence invent a confident catalog match', async () => {
    const result = await enrich(
      { ...recognized, probableTitle: 'Unknown novel', confidence: 1 },
      mockMetadataProvider,
    );
    expect(result.band).toBe('LOW');
    expect(result.rawConfidence).toBe(1);
    expect(result.metadata).toBeNull();
    const weak = await enrich(
      { ...recognized, confidence: 0.5 },
      { name: 'test', lookupByIsbn: async () => [], search: async () => [metadata] },
    );
    expect(weak.band).toBe('MEDIUM');
  });
  it('falls back from ISBN to title/author and then title-only; lookup failure leaves a manual candidate', async () => {
    const provider = {
      name: 'stub',
      lookupByIsbn: vi.fn(async () => []),
      search: vi.fn(async (query: { author?: string }) => (query.author ? [] : [metadata])),
    };
    expect(
      await matchBook(
        { title: 'Atomic Habits', author: 'James Clear', isbn: '0735211299' },
        provider,
      ),
    ).toHaveLength(1);
    expect(provider.lookupByIsbn).toHaveBeenCalledWith('9780735211292');
    expect(provider.search).toHaveBeenCalledTimes(2);
    const failed = await enrich(recognized, {
      name: 'bad',
      lookupByIsbn: async () => [],
      search: async () => {
        throw new ProviderError('rate_limit');
      },
    });
    expect(failed.band).toBe('LOW');
    expect(failed.warning).toContain('unavailable');
  });
  it('combines overlapping images without merging different ISBN editions or mutating inputs', async () => {
    const a = { ...recognized },
      b = { ...recognized, sourceImageId: 'photo2', confidence: 0.99 };
    expect(deduplicateRecognition([a, b])).toHaveLength(1);
    expect(a.sourceImageId).toBe('photo1');
    expect(deduplicateRecognition([{ ...a, probableAuthor: '' }, b])).toHaveLength(1);
    expect(
      deduplicateRecognition([
        { ...a, probableIsbn: '9780735211292' },
        { ...b, probableIsbn: '9780140328721' },
      ]),
    ).toHaveLength(2);
    const enriched = await enrich(a, {
      name: 'stub',
      search: async () => [metadata],
      lookupByIsbn: async () => [],
    });
    expect(
      deduplicateEnriched([
        { ...enriched, probableIsbn: '9780735211292' },
        { ...enriched, probableIsbn: '9780140328721' },
      ]),
    ).toHaveLength(2);
    expect(
      deduplicateEnriched([
        enriched,
        { ...enriched, sourceImageId: 'photo2', sourceImageIds: ['photo2'] },
      ])[0].sourceImageIds,
    ).toEqual(['photo1', 'photo2']);
  });
});
describe('external provider contracts (stubbed HTTP only)', () => {
  const volume = {
    id: 'volume1',
    volumeInfo: {
      title: ' Atomic Habits ',
      subtitle: 'A proven way',
      authors: ['James Clear'],
      publisher: 'Avery',
      publishedDate: '2018-10-16',
      industryIdentifiers: [{ type: 'ISBN_10', identifier: '0735211299' }],
      pageCount: 320,
      language: 'en',
      categories: ['Self-help'],
      description: '<p>Build better habits.</p>',
      imageLinks: { thumbnail: 'http://books.google.com/cover?id=volume1' },
    },
  };
  it('normalizes catalog metadata, nullable partial fields and safe covers', () => {
    expect(normalizeGoogleVolume(volume)).toMatchObject({
      ...metadata,
      id: 'google-books:volume1',
      provider: 'google-books',
      sourceId: 'volume1',
      format: 'unknown',
      subtitle: 'A proven way',
      publicationDate: '2018-10-16',
      publisher: 'Avery',
      pageCount: 320,
      coverUrl: 'https://books.google.com/cover?id=volume1',
      description: 'Build better habits.',
    });
    expect(
      normalizeGoogleVolume({ id: 'partial', volumeInfo: { title: 'Only a title', pageCount: 0 } }),
    ).toMatchObject({ authors: [], categories: [], format: 'unknown' });
    expect(
      normalizeGoogleVolume({
        id: 'bad',
        volumeInfo: { title: 'Book', imageLinks: { thumbnail: 'javascript:alert(1)' } },
      })?.coverUrl,
    ).toBeUndefined();
    expect(normalizeGoogleVolume({ volumeInfo: { title: 'Book' } })).toBeNull();
  });
  it('uses encoded ISBN/title/author queries, normalizes results and reports malformed responses', async () => {
    const fetcher = fakeFetch({ items: [volume], totalItems: 1 }),
      provider = new GoogleBooksMetadataProvider('test-key', fetcher);
    expect(await provider.lookupByIsbn('0735211299')).toHaveLength(1);
    expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get('q')).toBe(
      'isbn:9780735211292',
    );
    await provider.search({ title: 'Atomic Habits', author: 'James Clear' });
    expect(new URL(String(fetcher.mock.calls[1][0])).searchParams.get('q')).toContain('inauthor:');
    await expect(
      new GoogleBooksMetadataProvider(undefined, fakeFetch({ oops: true })).search({
        title: 'Book',
      }),
    ).rejects.toMatchObject({ code: 'malformed' });
  });
  it('sends actual image bytes server-side with store:false, strict schema and normalized output', async () => {
    const fetcher = fakeFetch({
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                books: [
                  {
                    title: 'Atomic Habits',
                    author: 'James Clear',
                    isbn: '0735211299',
                    confidence: 0.95,
                    region: { x: 0.1, y: 0.1, width: 0.2, height: 0.8 },
                  },
                ],
              }),
            },
          ],
        },
      ],
    });
    const output = await new OpenAIRecognitionProvider(
      'server-secret',
      'vision-model',
      fetcher,
    ).recognize({ id: 'image1', mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]) });
    expect(output[0]).toMatchObject({
      probableTitle: 'Atomic Habits',
      probableIsbn: '9780735211292',
      sourceImageId: 'image1',
    });
    const request = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
    expect(request.store).toBe(false);
    expect(request.text.format.strict).toBe(true);
    expect(request.input[0].content[1].image_url).toBe('data:image/png;base64,AQID');
    await expect(
      new OpenAIRecognitionProvider(
        'key',
        'model',
        fakeFetch({ status: 'incomplete', output: [] }),
      ).recognize({ id: 'image1', mimeType: 'image/png', bytes: new Uint8Array() }),
    ).rejects.toMatchObject({ code: 'malformed' });
  });
  it('bounds timeouts, sanitizes failures, reports rate limits and rejects configuration typos', async () => {
    await expect(
      providerJson(
        'https://provider.test',
        {},
        vi.fn<typeof fetch>(() => new Promise<Response>(() => {})),
        5,
      ),
    ).rejects.toMatchObject({ code: 'timeout' });
    await expect(
      providerJson('https://provider.test', {}, fakeFetch({ secret: 'never displayed' }, 429)),
    ).rejects.toMatchObject({ code: 'rate_limit' });
    await expect(
      providerJson(
        'https://provider.test',
        {},
        vi.fn(async () => {
          throw new Error('secret url');
        }),
      ),
    ).rejects.toThrow('Book provider unavailable.');
    expect(() => providers({ BOOK_RECOGNITION_PROVIDER: 'typo' })).toThrow();
    expect(() =>
      providers({ BOOK_RECOGNITION_PROVIDER: 'openai', OPENAI_API_KEY: 'key' }),
    ).toThrow();
    expect(providers({}).recognition.name).toContain('mock');
  });
});
describe('ingestion persistence and household API boundaries', () => {
  it('reuses works/editions/copies across formatted ISBNs, fuzzy work titles and concurrent retries; additional copy is explicit', async () => {
    const { db, sqlite } = database(),
      repo = new Repository(db, 'user-demo');
    const a = await repo.addBook(
      'household-demo',
      { title: 'Atomic Habits', author: 'James Clear', format: 'hardback', isbn: '0735211299' },
      metadata,
    );
    const b = await repo.addBook(
      'household-demo',
      {
        title: 'ATOMIC HABITS: A proven way',
        author: 'Clear, James',
        format: 'hardback',
        isbn: '978-0-7352-1129-2',
      },
      metadata,
    );
    expect(b.id).toBe(a.id);
    expect(b.reused).toBe(true);
    const saga1 = await repo.addBook('household-demo', {
      title: 'The Saga: Volume One',
      author: 'Writer',
      format: 'unknown',
    });
    const saga2 = await repo.addBook('household-demo', {
      title: 'The Saga: Volume Two',
      author: 'Writer',
      format: 'unknown',
    });
    expect(saga1.id).not.toBe(saga2.id);
    const [c, d] = await Promise.all([
      repo.addBook('household-demo', {
        title: 'New Concurrent Book',
        author: 'Writer',
        format: 'unknown',
      }),
      repo.addBook('household-demo', {
        title: 'New Concurrent Book',
        author: 'Writer',
        format: 'unknown',
      }),
    ]);
    expect(c.id).toBe(d.id);
    const noIsbn = await repo.addBook('household-demo', {
      title: 'New Concurrent Book: A subtitle',
      author: 'Writer',
      format: 'unknown',
    });
    expect(noIsbn.id).toBe(c.id);
    const another = await repo.addBook(
      'household-demo',
      {
        title: 'Atomic Habits',
        author: 'James Clear',
        format: 'hardback',
        isbn: '0735211299',
        additionalCopy: true,
      },
      metadata,
    );
    expect(another.id).not.toBe(a.id);
    expect(
      sqlite.prepare("SELECT count(*) AS n FROM books WHERE title='New Concurrent Book'").get()?.n,
    ).toBe(1);
    const secondEdition = await repo.addBook('household-demo', {
      title: 'Atomic Habits',
      author: 'James Clear',
      format: 'paperback',
      isbn: '9780140328721',
    });
    expect(secondEdition.id).not.toBe(a.id);
    const unknown = await repo.addBook('household-demo', {
      title: 'A newly identified edition',
      author: 'Writer',
      format: 'unknown',
      isbn: '9780804429573',
    });
    const confirmed = await repo.addBook('household-demo', {
      title: 'A newly identified edition',
      author: 'Writer',
      format: 'paperback',
      isbn: '9780804429573',
    });
    expect(confirmed.id).toBe(unknown.id);
    expect((await repoState(db)).books.find((book) => book.id === unknown.id)?.format).toBe(
      'paperback',
    );
    const other = new Repository(db, 'other-user');
    await other.createHousehold('Other', 'Parent');
    const household = await other.household();
    const otherCopy = await other.addBook(
      household!.id,
      { title: 'Atomic Habits', author: 'James Clear', format: 'hardback', isbn: '0735211299' },
      metadata,
    );
    expect(otherCopy.id).not.toBe(a.id);
    expect(
      sqlite.prepare("SELECT count(*) AS n FROM book_editions WHERE isbn='9780735211292'").get()?.n,
    ).toBe(1);
  });
  it('bulk accepts high-confidence only, remains idempotent, deduplicates multiple images and keeps progress after failures', async () => {
    const { db, sqlite } = database(),
      repo = new Repository(db, 'user-demo');
    const images = [
      { id: 'image1', mimeType: 'image/png', bytes: new Uint8Array([1]) },
      { id: 'image2', mimeType: 'image/png', bytes: new Uint8Array([1]) },
    ];
    const scanId = await createScan(repo, 'household-demo', images, {});
    await processScan(repo, 'household-demo', scanId, images, {});
    const scan = await repo.scan('household-demo', scanId);
    expect(scan.candidates).toHaveLength(3);
    expect(scan.candidates[0].sourceImageIds).toEqual(['image1', 'image2']);
    const excluded = (await (
      await call(db, `/scans/${scanId}/accept-confident`, 'POST', {
        excludeIds: [scan.candidates[0].id],
      })
    ).json()) as Scan;
    expect(excluded.candidates[0].confirmationState).toBe('pending');
    expect(excluded.candidates[1].confirmationState).toBe('accepted');
    const accepted = (await (
      await call(db, `/scans/${scanId}/accept-confident`, 'POST', {})
    ).json()) as Scan;
    expect(
      accepted.candidates.filter((candidate) => candidate.confirmationState === 'accepted'),
    ).toHaveLength(2);
    await call(db, `/scans/${scanId}/accept-confident`, 'POST', {});
    expect(sqlite.prepare('SELECT count(*) AS n FROM household_books').get()?.n).toBe(25);
    expect(accepted.candidates[0].householdBookId).toMatch(/^copy-/); // Existing seeded work is reused.
    await repo.confirmCandidate('household-demo', scanId, scan.candidates[2].id, 'reject');
    vi.stubGlobal('fetch', fakeFetch({}, 503));
    await processScan(repo, 'household-demo', scanId, [images[1]], {
      BOOK_RECOGNITION_PROVIDER: 'openai',
      INGESTION_ALLOW_EXTERNAL: 'true',
      OPENAI_API_KEY: 'stub',
    });
    vi.unstubAllGlobals();
    const resumed = await repo.scan('household-demo', scanId);
    expect(
      resumed.candidates.filter((candidate) => candidate.confirmationState === 'accepted'),
    ).toHaveLength(2);
    expect(resumed.images[1].state).toBe('failed');
  });
  it('selects a persisted alternative and strips stale metadata from edited text', async () => {
    const { db, sqlite } = database();
    const scan = (await (
      await call(db, '/scans', 'POST', {
        filename: 'shelf.png',
        mimeType: 'image/png',
        sizeBytes: 20,
      })
    ).json()) as Scan;
    const candidate = scan.candidates[2];
    await db
      .prepare('UPDATE recognition_candidates SET enrichment_json=? WHERE id=?')
      .bind(
        JSON.stringify({
          band: 'MEDIUM',
          metadata: null,
          alternatives: [{ metadata, score: 0.7, band: 'MEDIUM', reasons: [] }],
          sourceImageIds: [candidate.sourceImageId],
        }),
        candidate.id,
      )
      .run();
    const result = await call(db, `/scans/${scan.id}/candidates/${candidate.id}`, 'PUT', {
      action: 'accept',
      metadataId: metadata.id,
    });
    expect(result.status).toBe(200);
    const edition = sqlite
      .prepare("SELECT metadata_json FROM book_editions WHERE isbn='9780735211292'")
      .get();
    expect(JSON.parse(edition?.metadata_json as string)).toMatchObject({
      id: metadata.id,
      title: metadata.title,
      isbn13: metadata.isbn13,
    });
    expect(
      (await repoState(db)).books.find((book) => book.isbn === metadata.isbn13)?.metadata?.id,
    ).toBe(metadata.id);
    const edited = scan.candidates[0];
    await call(db, `/scans/${scan.id}/candidates/${edited.id}`, 'PUT', {
      action: 'accept',
      title: 'An entirely different book',
      author: 'Someone else',
    });
    expect(
      sqlite.prepare("SELECT description FROM books WHERE title='An entirely different book'").get()
        ?.description,
    ).toBe('');
    const correction = await call(
      db,
      `/scans/${scan.id}/candidates/${scan.candidates[1].id}`,
      'PUT',
      { action: 'accept', title: 'The Secret Garden', author: 'Frances Hodgson Burnett' },
    );
    const corrected = (await correction.json()) as Scan;
    expect(corrected.candidates[1].metadata?.id).toBe('mock:0');
    expect(corrected.candidates[1].householdBookId).toMatch(/^copy-/);
  });
  it('scopes scans, bulk accept, alternate search, uploads and retry to the household; production stays locked', async () => {
    const { db } = database(),
      repo = new Repository(db, 'other-user');
    await repo.createHousehold('Other', 'Parent');
    const household = (await repo.household())!;
    const scanId = await createScan(
      repo,
      household.id,
      [{ id: 'other-photo', mimeType: 'image/png', bytes: new Uint8Array([1]) }],
      {},
    );
    expect((await call(db, `/scans/${scanId}`)).status).toBe(404);
    expect((await call(db, `/scans/${scanId}/accept-confident`, 'POST', {})).status).toBe(404);
    expect((await call(db, `/scans/${scanId}/images/other-photo/retry`, 'POST', {})).status).toBe(
      404,
    );
    expect(
      (await call(db, `/scans/${scanId}/candidates/fake/search`, 'POST', { title: 'Book' })).status,
    ).toBe(404);
    expect(
      (
        await app.fetch(new Request('https://pagerove.test/api/scans', { method: 'POST' }), {
          DB: db,
          APP_MODE: 'locked',
          BOOK_RECOGNITION_PROVIDER: 'openai',
          OPENAI_API_KEY: 'secret',
        })
      ).status,
    ).toBe(503);
  });
  it('rejects invalid image bytes/count/MIME, supports realistic shelf bytes, and applies a shared hourly limit', async () => {
    const request = (
      count: number,
      bytes: Uint8Array = new Uint8Array([1, 2, 3]),
      type = 'image/png',
    ) => {
      const form = new FormData();
      for (let i = 0; i < count; i++)
        form.append('photos', new Blob([new Uint8Array(bytes)], { type }), 'shelf.png');
      return new Request('https://pagerove.test/api/scans', { method: 'POST', body: form });
    };
    await expect(uploadImages(request(4))).rejects.toMatchObject({ status: 400 });
    await expect(uploadImages(request(1))).rejects.toMatchObject({ status: 415 });
    await expect(
      uploadImages(request(1, new Uint8Array([1]), 'image/svg+xml')),
    ).rejects.toMatchObject({ status: 415 });
    const real = await uploadImages(
      request(1, new Uint8Array(readFileSync('tests/fixtures/synthetic-shelf.png'))),
    );
    expect(real[0].bytes.length).toBeGreaterThan(10000);
    const { db } = database();
    await db
      .prepare("INSERT INTO ingestion_rate_windows VALUES ('household-demo','scan',?,10)")
      .bind(Math.floor(Date.now() / 3600000))
      .run();
    expect(
      (
        await call(db, '/scans', 'POST', {
          filename: 'shelf.png',
          mimeType: 'image/png',
          sizeBytes: 20,
        })
      ).status,
    ).toBe(429);
  });
});

describe('synthetic shelf pipeline and recovery', () => {
  it('processes the 24-book shelf through stubbed real adapters, including uncertain partial text and image failure', async () => {
    const { db } = database(),
      repo = new Repository(db, 'user-demo');
    const fixture = JSON.parse(
      readFileSync('tests/fixtures/synthetic-shelf.expected.json', 'utf8'),
    ) as { books: { title: string; author: string; partial: boolean }[] };
    let recognitionCalls = 0;
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.hostname === 'api.openai.com') {
        if (++recognitionCalls === 2) return Response.json({}, { status: 429 });
        return Response.json({
          status: 'completed',
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    books: fixture.books.map((book) => ({
                      title: book.title,
                      author: book.partial ? '' : book.author,
                      isbn: null,
                      confidence: book.partial ? 0.5 : 0.95,
                      region: null,
                    })),
                  }),
                },
              ],
            },
          ],
        });
      }
      const q = url.searchParams.get('q') ?? '';
      const book = fixture.books.find((book) => q.includes(`intitle:"${book.title}"`));
      return Response.json(
        book
          ? {
              items: [
                {
                  id: book.title,
                  volumeInfo: {
                    title: book.title,
                    authors: [book.author],
                    publishedDate: '2000',
                    language: 'en',
                  },
                },
              ],
              totalItems: 1,
            }
          : { totalItems: 0 },
      );
    });
    vi.stubGlobal('fetch', fetcher);
    try {
      const config = {
        BOOK_RECOGNITION_PROVIDER: 'openai',
        BOOK_METADATA_PROVIDER: 'google-books',
        INGESTION_ALLOW_EXTERNAL: 'true',
        OPENAI_API_KEY: 'stub',
      };
      const images = [
        {
          id: 'shelf1',
          mimeType: 'image/png',
          bytes: new Uint8Array(readFileSync('tests/fixtures/synthetic-shelf.png')),
        },
        { id: 'shelf2', mimeType: 'image/png', bytes: new Uint8Array([1]) },
      ];
      const scanId = await createScan(repo, 'household-demo', images, config);
      await processScan(repo, 'household-demo', scanId, images, config);
      const result = await repo.scan('household-demo', scanId);
      expect(result.candidates).toHaveLength(24);
      expect(result.candidates.filter((candidate) => candidate.band === 'HIGH')).toHaveLength(22);
      expect(result.images[1].state).toBe('failed');
      expect(result.warnings).toHaveLength(1);
      await repo.bulkAccept('household-demo', scanId);
      const after = await repo.scan('household-demo', scanId);
      expect(
        after.candidates.filter((candidate) => candidate.confirmationState === 'accepted'),
      ).toHaveLength(22);
      await processScan(repo, 'household-demo', scanId, [images[1]], config);
      const resumed = await repo.scan('household-demo', scanId);
      expect(resumed.candidates).toHaveLength(24);
      expect(
        resumed.candidates.filter((candidate) => candidate.confirmationState === 'accepted'),
      ).toHaveLength(22);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('returns an empty recoverable review for no books and recovers stale processing sessions', async () => {
    const { db } = database(),
      repo = new Repository(db, 'user-demo'),
      config = {
        BOOK_RECOGNITION_PROVIDER: 'openai',
        INGESTION_ALLOW_EXTERNAL: 'true',
        OPENAI_API_KEY: 'stub',
      };
    const images = [{ id: 'empty', mimeType: 'image/png', bytes: new Uint8Array([1]) }];
    const scanId = await createScan(repo, 'household-demo', images, config);
    vi.stubGlobal(
      'fetch',
      fakeFetch({
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text: '{"books":[]}' }] }],
      }),
    );
    try {
      await processScan(repo, 'household-demo', scanId, images, config);
    } finally {
      vi.unstubAllGlobals();
    }
    const scan = await repo.scan('household-demo', scanId);
    expect(scan.status).toBe('review');
    expect(scan.warnings[0]).toContain('No readable books');
    await db
      .prepare(
        "UPDATE scan_sessions SET processing_state='processing',processing_started_at='2000-01-01 00:00:00' WHERE id=?",
      )
      .bind(scanId)
      .run();
    expect((await repo.scan('household-demo', scanId)).status).toBe('failed');
  });
});
