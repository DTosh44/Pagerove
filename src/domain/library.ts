import type { LibraryBook, ReadingStatus, Recommendation } from './types';

export function readingStatus(book: LibraryBook, memberId: string): ReadingStatus {
  return book.records.find((record) => record.memberId === memberId)?.status ?? 'unread';
}
export function filterLibrary(
  books: LibraryBook[],
  memberId: string,
  status: ReadingStatus | 'all',
  query = '',
) {
  const search = query.trim().toLocaleLowerCase();
  return books.filter(
    (book) =>
      (status === 'all' || readingStatus(book, memberId) === status) &&
      `${book.title} ${book.author}`.toLocaleLowerCase().includes(search),
  );
}
export function eligibleBooks(books: LibraryBook[], memberId: string) {
  return books.filter((book) => readingStatus(book, memberId) === 'unread');
}
// Treat provider output as untrusted. Ownership/unread constraints live outside adapters.
export function guardRecommendations(
  results: Recommendation[],
  eligible: LibraryBook[],
): Recommendation[] {
  const allowed = new Set(eligible.map((book) => book.id));
  const seen = new Set<string>();
  return results
    .filter((result) => {
      if (!allowed.has(result.bookId) || seen.has(result.bookId)) return false;
      seen.add(result.bookId);
      return true;
    })
    .slice(0, 3);
}
export const statusLabels: Record<ReadingStatus, string> = {
  unread: 'Unread',
  reading: 'Reading',
  read: 'Read',
  want_to_read: 'Want to read',
};
