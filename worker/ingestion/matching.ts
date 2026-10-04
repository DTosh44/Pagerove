import type {
  BookMetadata,
  BookQuery,
  ConfidenceBand,
  EnrichedBook,
  MetadataMatch,
  RecognizedBook,
} from '../../src/domain/ingestion';
import type { BookMetadataProvider } from '../../src/providers/interfaces';
export const normalizeText = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
export const normalizeTitle = (value: string) => normalizeText(value.split(/[:：]/)[0]);
export const normalizeAuthor = (value: string) => normalizeText(value).split(' ').sort().join(' ');
export function normalizeIsbn(value?: string | null): string | null {
  const isbn = (value ?? '')
    .replace(/^ISBN(?:-1[03])?:?\s*/i, '')
    .replace(/[\s-]/g, '')
    .toUpperCase();
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const sum = [...isbn].reduce(
      (n, digit, i) => n + (digit === 'X' ? 10 : Number(digit)) * (10 - i),
      0,
    );
    if (sum % 11) return null;
    const stem = '978' + isbn.slice(0, 9);
    return (
      stem +
      ((10 - ([...stem].reduce((n, digit, i) => n + Number(digit) * (i % 2 ? 3 : 1), 0) % 10)) % 10)
    );
  }
  if (
    /^97[89]\d{10}$/.test(isbn) &&
    [...isbn].reduce((n, digit, i) => n + Number(digit) * (i % 2 ? 3 : 1), 0) % 10 === 0
  )
    return isbn;
  return null;
}
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = old;
    }
  }
  return 1 - row[b.length] / Math.max(a.length, b.length);
}
function titleSimilarity(a: string, b: string) {
  const suffix = (value: string) => value.match(/[:：](.+)/)?.[1];
  const aSuffix = suffix(a),
    bSuffix = suffix(b);
  // A common series prefix must not turn two different subtitles/volumes into one work.
  if (aSuffix && bSuffix && normalizeText(aSuffix) !== normalizeText(bSuffix))
    return Math.min(0.78, similarity(normalizeText(a), normalizeText(b)));
  return similarity(normalizeTitle(a), normalizeTitle(b));
}
export function sameWork(
  a: { title: string; author: string },
  b: { title: string; author: string },
) {
  return (
    titleSimilarity(a.title, b.title) >= 0.94 &&
    similarity(normalizeAuthor(a.author), normalizeAuthor(b.author)) >= 0.88
  );
}
export const confidenceBand = (score: number): ConfidenceBand =>
  score >= 0.9 ? 'HIGH' : score >= 0.65 ? 'MEDIUM' : 'LOW';
export function rankMatches(query: BookQuery, metadata: BookMetadata[]): MetadataMatch[] {
  const isbn = normalizeIsbn(query.isbn);
  const ranked = metadata
    .map((item): MetadataMatch => {
      const exact =
        !!isbn && [item.isbn13, item.isbn10].some((value) => normalizeIsbn(value) === isbn);
      const title = titleSimilarity(query.title ?? '', item.title);
      const author = Math.max(
        0,
        ...item.authors.map((value) =>
          similarity(normalizeAuthor(query.author ?? ''), normalizeAuthor(value)),
        ),
      );
      const reasons = [
        exact ? 'Exact ISBN' : `Title ${Math.round(title * 100)}%`,
        ...(query.author ? [`Author ${Math.round(author * 100)}%`] : []),
      ];
      let score = exact ? 0.99 : title * 0.68 + author * 0.3;
      if (!exact && (!query.author || !item.authors.length)) score = Math.min(score, 0.78);
      if (!exact && title < 0.8) score = Math.min(score, 0.6);
      for (const field of ['format', 'year', 'language'] as const) {
        if (query[field] && item[field] && item[field] !== 'unknown') {
          if (query[field] === item[field]) {
            score += 0.005;
            reasons.push(`${field} agrees`);
          } else {
            score -= 0.15;
            reasons.push(`${field} differs`);
          }
        }
      }
      if (exact && ((query.title && title < 0.8) || (query.author && author < 0.65))) {
        score = Math.min(score, 0.84);
        reasons.push('ISBN and visible text disagree');
      }
      score = Math.max(0, Math.min(0.99, score));
      return { metadata: item, score, band: confidenceBand(score), reasons };
    })
    .sort((a, b) => b.score - a.score || a.metadata.id.localeCompare(b.metadata.id));
  // Different plausible works must be checked; editions of the same work remain visible.
  if (
    ranked[0] &&
    ranked[1] &&
    ranked[0].score - ranked[1].score < 0.08 &&
    !sameWork(
      { title: ranked[0].metadata.title, author: ranked[0].metadata.authors.join(' ') },
      { title: ranked[1].metadata.title, author: ranked[1].metadata.authors.join(' ') },
    )
  ) {
    ranked[0].score = Math.min(ranked[0].score, 0.84);
    ranked[0].band = 'MEDIUM';
    ranked[0].reasons.push('Ambiguous work');
  }
  return ranked.slice(0, 3);
}
export async function matchBook(
  query: BookQuery,
  provider: BookMetadataProvider,
): Promise<MetadataMatch[]> {
  let result: BookMetadata[] = [];
  const isbn = normalizeIsbn(query.isbn);
  if (query.isbn && !isbn) throw new Error('Enter a valid ISBN-10 or ISBN-13.');
  if (isbn) result = await provider.lookupByIsbn(isbn);
  if (!result.length && query.title) result = await provider.search({ ...query, isbn: undefined });
  if (!result.length && query.title && query.author)
    result = await provider.search({ title: query.title });
  return rankMatches(query, result);
}
export async function enrich(
  book: RecognizedBook,
  provider: BookMetadataProvider,
): Promise<EnrichedBook> {
  let alternatives: MetadataMatch[] = [],
    warning: string | undefined;
  try {
    alternatives = await matchBook(
      {
        title: book.probableTitle,
        author: book.probableAuthor,
        isbn: normalizeIsbn(book.probableIsbn) ?? undefined,
      },
      provider,
    );
  } catch {
    warning = 'Metadata is unavailable. Search again or enter the book details.';
  }
  const best = alternatives[0];
  // Weak OCR is still uncertain even when its proposed text has a catalog match.
  const confidence = Math.min(
    best?.score ?? 0.35,
    book.confidence < 0.75 ||
      best?.metadata.format === 'ebook' ||
      best?.metadata.format === 'audiobook'
      ? 0.84
      : 0.99,
  );
  return {
    ...book,
    rawConfidence: book.confidence,
    confidence,
    band: confidenceBand(confidence),
    alternatives,
    metadata: best && best.score >= 0.65 ? best.metadata : null,
    sourceImageIds: [book.sourceImageId],
    warning,
  };
}
export function deduplicateRecognition(books: RecognizedBook[]): RecognizedBook[] {
  const result: RecognizedBook[] = [];
  for (const book of books) {
    const existing = result.find((item) => {
      const a = normalizeIsbn(item.probableIsbn),
        b = normalizeIsbn(book.probableIsbn);
      if (a && b) return a === b;
      if (!item.probableAuthor || !book.probableAuthor)
        return titleSimilarity(item.probableTitle, book.probableTitle) === 1;
      return sameWork(
        { title: item.probableTitle, author: item.probableAuthor },
        { title: book.probableTitle, author: book.probableAuthor },
      );
    });
    if (!existing) result.push(book);
    else if (book.confidence > existing.confidence) result[result.indexOf(existing)] = book;
  }
  return result;
}
export function deduplicateEnriched(books: EnrichedBook[]): EnrichedBook[] {
  const result: EnrichedBook[] = [];
  for (const book of books) {
    const existing = result.find((item) => {
      const a = normalizeIsbn(item.probableIsbn ?? item.metadata?.isbn13 ?? item.metadata?.isbn10),
        b = normalizeIsbn(book.probableIsbn ?? book.metadata?.isbn13 ?? book.metadata?.isbn10);
      if (a && b && a !== b) return false;
      return (
        deduplicateRecognition([item, book]).length === 1 ||
        (item.metadata && book.metadata && item.metadata.id === book.metadata.id)
      );
    });
    if (existing)
      existing.sourceImageIds = [...new Set([...existing.sourceImageIds, ...book.sourceImageIds])];
    else result.push(book);
  }
  return result;
}
