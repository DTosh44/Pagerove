import type {
  BookRecognitionProvider,
  BookMetadataProvider,
  RecommendationProvider,
} from './interfaces';
const mockCatalog = [
  ['The Secret Garden', 'Frances Hodgson Burnett'],
  ['A Walk in the Woods', 'Bill Bryson'],
  ['The Little Prince', 'Antoine de Saint-Exupéry'],
].map(([title, author], index) => ({
  id: `mock:${index}`,
  provider: 'mock',
  sourceId: String(index),
  title,
  authors: [author],
  format: 'paperback' as const,
  categories: ['Fiction'],
  year: 2000 + index,
}));
export const mockMetadataProvider: BookMetadataProvider = {
  name: 'mock',
  async lookupByIsbn() {
    return [];
  },
  async search(query) {
    return mockCatalog.filter((book) => book.title.toLowerCase() === query.title?.toLowerCase());
  },
};
export const mockRecognitionProvider: BookRecognitionProvider = {
  name: 'mock',
  async recognize(image) {
    return [
      {
        probableTitle: 'The Secret Garden',
        probableAuthor: 'Frances Hodgson Burnett',
        probableIsbn: null,
        confidence: 0.96,
        sourceImageId: image.id,
      },
      {
        probableTitle: 'A Walk in the Woods',
        probableAuthor: 'Bill Bryson',
        probableIsbn: null,
        confidence: 0.92,
        sourceImageId: image.id,
      },
      {
        probableTitle: 'The Little Prince',
        probableAuthor: 'Antoine de Saint-Exupéry',
        probableIsbn: null,
        confidence: 0.63,
        sourceImageId: image.id,
      },
    ];
  },
};
export const deterministicRecommendations: RecommendationProvider = {
  name: 'deterministic-v1',
  async recommend({ books, member, request }) {
    const words = `${request} ${member.preferences.join(' ')}`
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 2);
    const short = /short|easy/.test(request.toLowerCase());
    return books
      .map((book) => {
        const text = `${book.title} ${book.categories.join(' ')} ${book.description}`.toLowerCase();
        const matches = words.filter((word) => text.includes(word));
        const score =
          matches.length * 10 + (short && book.pageCount && book.pageCount < 250 ? 5 : 0);
        return { book, matches, score };
      })
      .sort((a, b) => b.score - a.score || a.book.title.localeCompare(b.book.title))
      .slice(0, 3)
      .map(({ book, matches }) => ({
        bookId: book.id,
        explanation: matches.length
          ? `A match for “${matches[0]}”, waiting on your shelf. You haven't read this one yet.`
          : short && book.pageCount && book.pageCount < 250
            ? `At ${book.pageCount} pages, this is a shorter read you already own.`
            : `An unread ${book.categories[0]?.toLowerCase() || 'book'} from your own library. A good place to discover something new.`,
      }));
  },
};
