import type { BookFormat } from './types';
export interface BookMetadata {
  id: string;
  provider: string;
  sourceId: string;
  sourceUrl?: string;
  title: string;
  subtitle?: string;
  authors: string[];
  isbn10?: string;
  isbn13?: string;
  publisher?: string;
  publicationDate?: string;
  year?: number;
  format: BookFormat;
  pageCount?: number;
  language?: string;
  categories: string[];
  description?: string;
  coverUrl?: string;
}
export interface BookQuery {
  title?: string;
  author?: string;
  isbn?: string;
  format?: BookFormat;
  year?: number;
  language?: string;
}
export interface RecognizedBook {
  probableTitle: string;
  probableAuthor: string;
  probableIsbn: string | null;
  confidence: number;
  sourceImageId: string;
  region?: { x: number; y: number; width: number; height: number };
}
export type ConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW';
export interface MetadataMatch {
  metadata: BookMetadata;
  score: number;
  band: ConfidenceBand;
  reasons: string[];
}
export interface EnrichedBook extends RecognizedBook {
  rawConfidence: number;
  band: ConfidenceBand;
  alternatives: MetadataMatch[];
  metadata: BookMetadata | null;
  sourceImageIds: string[];
  warning?: string;
}
