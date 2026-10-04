import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Camera, Plus, Search } from 'lucide-react';
import type { ReadingStatus } from '../../domain/types';
import { statuses } from '../../domain/types';
import { filterLibrary, statusLabels } from '../../domain/library';
import { useLibrary } from '../context';
import { PageHeading, BookCard } from '../components';
export function LibraryPage() {
  const { data, memberId } = useLibrary(),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState<ReadingStatus | 'all'>('all');
  const books = [...filterLibrary(data.books, memberId, filter, query)].sort((a, b) =>
      a.title.localeCompare(b.title),
    ),
    member = data.members.find((person) => person.id === memberId);
  return (
    <>
      <PageHeading
        title="Our Library"
        description="Your books. New possibilities."
        action={
          <div className="heading-actions">
            <Link className="icon-button subtle" to="/scan" aria-label="Scan your books">
              <Camera size={22} />
            </Link>
            <Link className="icon-button filled" to="/books/new" aria-label="Add a book">
              <Plus size={22} />
            </Link>
          </div>
        }
      />
      <div className="library-tools">
        <div className="filter-tabs" aria-label="Filter by reading status">
          {(['all', ...statuses] as const).map((status) => (
            <button
              key={status}
              className={filter === status ? 'active' : ''}
              aria-pressed={filter === status}
              onClick={() => setFilter(status)}
            >
              {status === 'all' ? 'All' : statusLabels[status]}
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={20} />
          <input
            aria-label="Search title or author"
            placeholder="Find a title or author"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <p className="results-label">
        {books.length} {books.length === 1 ? 'book' : 'books'} on your shelves{' '}
        <span>· {member?.displayName}’s reading journey</span>
      </p>
      {books.length ? (
        <div className="book-grid">
          {books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <BookOpen size={34} />
          <h2>
            {data.books.length ? 'A different chapter, perhaps?' : 'Your first chapter starts here'}
          </h2>
          <p>
            {data.books.length
              ? 'Try another search or reading status.'
              : 'Add a book you own to start your household library.'}
          </p>
          <Link to="/books/new" className="button primary">
            Add a book
          </Link>
        </div>
      )}
      <div className="library-end">
        <span>Books take you places.</span>
        <Link to="/scan">
          A whole shelf to add? <Camera size={18} />
        </Link>
      </div>
    </>
  );
}
