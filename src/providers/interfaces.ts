import type { LibraryBook, Member, Recommendation } from '../domain/types';
import type { BookMetadata, BookQuery, RecognizedBook } from '../domain/ingestion';
export interface RecognitionImage {
  id: string;
  mimeType: string;
  bytes: Uint8Array;
}
export interface BookRecognitionProvider {
  readonly name: string;
  recognize(image: RecognitionImage): Promise<RecognizedBook[]>;
}
export interface BookMetadataProvider {
  readonly name: string;
  lookupByIsbn(isbn: string): Promise<BookMetadata[]>;
  search(query: BookQuery): Promise<BookMetadata[]>;
}
export interface RecommendationProvider {
  readonly name: string;
  recommend(input: {
    books: LibraryBook[];
    member: Member;
    request: string;
  }): Promise<Recommendation[]>;
}
