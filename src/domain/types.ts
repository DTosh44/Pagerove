export const statuses = ['unread', 'reading', 'read', 'want_to_read'] as const;
export type ReadingStatus = (typeof statuses)[number];
export const formats = ['hardback', 'paperback', 'ebook', 'audiobook', 'unknown'] as const;
export type BookFormat = (typeof formats)[number];
export interface Member {
  id: string;
  displayName: string;
  type: 'adult' | 'child';
  preferences: string[];
}
export interface ReadingRecord {
  memberId: string;
  householdBookId: string;
  status: ReadingStatus;
  rating: number | null;
  startedDate: string | null;
  finishedDate: string | null;
}
export interface LibraryBook {
  id: string;
  workId: string;
  title: string;
  author: string;
  format: BookFormat;
  isbn: string | null;
  coverUrl: string | null;
  pageCount: number | null;
  categories: string[];
  description: string;
  location: string | null;
  records: ReadingRecord[];
}
export interface Household {
  id: string;
  name: string;
}
export interface LibraryState {
  household: Household | null;
  members: Member[];
  books: LibraryBook[];
  mode: 'demo';
}
export interface ManualBook {
  title: string;
  author: string;
  format: BookFormat;
  isbn?: string;
  categories?: string[];
}
export interface Recommendation {
  bookId: string;
  explanation: string;
}
export interface Candidate {
  id: string;
  probableTitle: string;
  probableAuthor: string;
  probableIsbn: string | null;
  confidence: number;
  sourceImageId: string;
  confirmationState: 'pending' | 'accepted' | 'rejected';
  householdBookId: string | null;
}
export interface Scan {
  id: string;
  candidates: Candidate[];
}
