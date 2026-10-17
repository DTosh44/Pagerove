import type { BookMetadata, MetadataMatch } from '../domain/ingestion';
import { Cover } from './components';
export function MetadataCover({ book }: { book: BookMetadata }) {
  return (
    <Cover
      book={{
        id: book.id,
        workId: book.id,
        title: book.title,
        author: book.authors.join(', '),
        format: book.format,
        isbn: book.isbn13 ?? book.isbn10 ?? null,
        coverUrl: book.coverUrl ?? null,
        pageCount: book.pageCount ?? null,
        categories: book.categories,
        description: book.description ?? '',
        location: null,
        records: [],
      }}
    />
  );
}
export function MetadataOptions({
  matches,
  selected,
  onSelect,
}: {
  matches: MetadataMatch[];
  selected?: string;
  onSelect: (metadata: BookMetadata) => void;
}) {
  return (
    <div className="metadata-options">
      {matches.map(({ metadata }) => (
        <button
          type="button"
          className={`metadata-option ${selected === metadata.id ? 'selected' : ''}`}
          aria-pressed={selected === metadata.id}
          key={metadata.id}
          onClick={() => onSelect(metadata)}
        >
          <MetadataCover book={metadata} />
          <span>
            <strong>{metadata.title}</strong>
            <span>{metadata.authors.join(', ') || 'Author not supplied'}</span>
            <small>
              {[
                metadata.year,
                metadata.publisher,
                metadata.format !== 'unknown' ? metadata.format : '',
                metadata.isbn13 ?? metadata.isbn10,
              ]
                .filter(Boolean)
                .join(' · ')}
            </small>
          </span>
        </button>
      ))}
    </div>
  );
}
export function MetadataSource({ book }: { book: BookMetadata | null }) {
  return book?.sourceUrl ? (
    <small>
      Metadata from{' '}
      <a href={book.sourceUrl} target="_blank" rel="noreferrer">
        Google Books
      </a>
    </small>
  ) : null;
}
