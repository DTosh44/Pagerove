import type { LibraryBook, ManualBook, Member, Recommendation } from '../domain/types';
export interface BookRecognitionProvider {
  readonly name: string;
  recognize(image: { id: string; filename: string }): Promise<
    Array<{
      probableTitle: string;
      probableAuthor: string;
      probableIsbn: string | null;
      confidence: number;
      sourceImageId: string;
    }>
  >;
}
export interface BookMetadataProvider {
  lookup(
    isbn: string,
  ): Promise<(ManualBook & { description?: string; coverUrl?: string; pageCount?: number }) | null>;
}
export interface RecommendationProvider {
  readonly name: string;
  recommend(input: {
    books: LibraryBook[];
    member: Member;
    request: string;
  }): Promise<Recommendation[]>;
}
