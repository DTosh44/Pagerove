import type { LibraryBook } from '../domain/types';
// Curated artwork for the existing fictional demo only, not a metadata adapter.
// The owned edition's coverUrl always takes precedence. Network failures use placeholders.
const covers: Record<string, string> = {
  'work-1': 'https://covers.openlibrary.org/b/id/13011432-L.jpg',
  'work-2': 'https://covers.openlibrary.org/b/id/15164860-L.jpg',
  'work-3': 'https://covers.openlibrary.org/b/id/8314262-L.jpg',
  'work-4': 'https://covers.openlibrary.org/b/id/12003329-L.jpg',
  'work-5': 'https://covers.openlibrary.org/b/id/11392318-L.jpg',
  'work-6': 'https://covers.openlibrary.org/b/id/7443270-L.jpg',
  'work-7': 'https://covers.openlibrary.org/b/id/15095672-L.jpg',
  'work-9': 'https://covers.openlibrary.org/b/id/14369194-L.jpg',
  'work-10': 'https://covers.openlibrary.org/b/id/14589690-L.jpg',
  'work-11': 'https://covers.openlibrary.org/b/id/12812484-L.jpg',
  'work-12': 'https://covers.openlibrary.org/b/id/8561762-L.jpg',
  'work-13': 'https://covers.openlibrary.org/b/id/45888-L.jpg',
  'work-14': 'https://covers.openlibrary.org/b/id/9312772-L.jpg',
  'work-16': 'https://covers.openlibrary.org/b/id/12455001-L.jpg',
  'work-17': 'https://covers.openlibrary.org/b/id/6690293-L.jpg',
  'work-18': 'https://covers.openlibrary.org/b/id/7268667-L.jpg',
  'work-19': 'https://covers.openlibrary.org/b/id/8577803-L.jpg',
  'work-20': 'https://covers.openlibrary.org/b/id/7355968-L.jpg',
  'work-21': 'https://covers.openlibrary.org/b/id/14614846-L.jpg',
  'work-22': 'https://covers.openlibrary.org/b/id/6574169-L.jpg',
  'work-24': 'https://covers.openlibrary.org/b/id/15166823-L.jpg',
};
export function demoCover(book: LibraryBook): string | null {
  return book.workId.startsWith('work-') ? (covers[book.workId] ?? null) : null;
}
