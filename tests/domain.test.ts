import { describe, expect, it } from 'vitest';
import {
  eligibleBooks,
  filterLibrary,
  guardRecommendations,
  readingStatus,
} from '../src/domain/library';
import { historyInput, memberInput } from '../src/domain/validation';
import { deterministicRecommendations } from '../src/providers/mock';
import type { LibraryBook, Member } from '../src/domain/types';
const member: Member = {
  id: 'reader',
  displayName: 'Alex',
  type: 'adult',
  preferences: ['Mystery'],
};
function book(id: string, status?: 'reading' | 'read' | 'want_to_read'): LibraryBook {
  return {
    id,
    workId: id,
    title: `Story ${id}`,
    author: 'An Author',
    format: 'paperback',
    isbn: null,
    coverUrl: null,
    pageCount: 100,
    categories: ['Mystery'],
    description: 'A gripping mystery',
    location: null,
    records: status
      ? [
          {
            memberId: 'reader',
            householdBookId: id,
            status,
            rating: null,
            startedDate: null,
            finishedDate: null,
          },
        ]
      : [],
  };
}
describe('personal reading rules', () => {
  it('defaults missing history to unread without affecting another reader', () => {
    expect(readingStatus(book('one', 'read'), 'someone-else')).toBe('unread');
  });
  it('only admits unread books, excluding reading, read and want to read', () => {
    expect(
      eligibleBooks(
        [book('yes'), book('a', 'reading'), book('b', 'read'), book('c', 'want_to_read')],
        'reader',
      ).map((item) => item.id),
    ).toEqual(['yes']);
  });
  it('filters title and author case-insensitively for the selected reader', () => {
    expect(
      filterLibrary([book('one'), book('two', 'read')], 'reader', 'unread', 'AUTHOR'),
    ).toHaveLength(1);
  });
  it('rejects provider hallucinations and duplicates and caps results at three', () => {
    const eligible = [book('a'), book('b'), book('c'), book('d')];
    expect(
      guardRecommendations(
        ['foreign', 'a', 'a', 'b', 'c', 'd'].map((bookId) => ({ bookId, explanation: 'test' })),
        eligible,
      ).map((item) => item.bookId),
    ).toEqual(['a', 'b', 'c']);
  });
  it('is deterministic and handles an empty library', async () => {
    const input = { books: [book('b'), book('a')], member, request: 'Short' };
    expect(await deterministicRecommendations.recommend(input)).toEqual(
      await deterministicRecommendations.recommend(input),
    );
    expect(await deterministicRecommendations.recommend({ ...input, books: [] })).toEqual([]);
  });
});
describe('input validation', () => {
  it('rejects invalid ratings, dates and inverted date ranges', () => {
    const base = { memberId: 'reader', bookIds: ['one'], status: 'read' };
    for (const extra of [
      { rating: 6 },
      { rating: 1.5 },
      { startedDate: '2026-02-30' },
      { startedDate: '2026-10-01', finishedDate: '2026-09-01' },
    ])
      expect(historyInput.safeParse({ ...base, ...extra }).success).toBe(false);
  });
  it('needs no sensitive child data', () => {
    expect(memberInput.parse({ displayName: 'Ella', type: 'child' })).toEqual({
      displayName: 'Ella',
      type: 'child',
      preferences: [],
    });
  });
});
