import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Camera, Plus, Search } from 'lucide-react';
import type { ReadingStatus } from '../../domain/types';
import { statuses } from '../../domain/types';
import { filterLibrary, readingStatus, statusLabels } from '../../domain/library';
import { useLibrary } from '../context';
import { PageHeading, BookCard } from '../components';
export function LibraryPage() {
  const { data, memberId } = useLibrary(),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState<ReadingStatus | 'all'>('all');
  const books = filterLibrary(data.books, memberId, filter, query),
    member = data.members.find((item) => item.id === memberId);
  const reading = data.books.filter((book) => readingStatus(book, memberId) === 'reading').length;
  const unread = data.books.filter((book) => readingStatus(book, memberId) === 'unread').length;
  return (
    <>
      <PageHeading
        eyebrow="A home for your stories"
        title="Your library"
        description="Old favourites. New discoveries. All on your own shelves."
        action={
          <Link className="button primary" to="/books/new">
            <Plus size={18} />
            Add a book
          </Link>
        }
      />
      <div className="library-intro">
        <div className="welcome-panel">
          <p className="eyebrow">THE NEXT CHAPTER</p>
          <h2>
            Something wonderful
            <br />
            is already on your shelf.
          </h2>
          <p>
            You don’t always need a new book.
            <br />
            Sometimes you just need a fresh pair of eyes.
          </p>
          <Link to="/recommendations">
            Find your next read <ArrowRight size={17} />
          </Link>
          <div className="shelf-art" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="stats-panel">
          <p>{member?.displayName}’s reading corner</p>
          <div>
            <strong>{data.books.length}</strong>
            <span>books at home</span>
          </div>
          <div>
            <strong>{unread}</strong>
            <span>yet to discover</span>
          </div>
          <div>
            <strong>{reading}</strong>
            <span>being enjoyed</span>
          </div>
        </div>
      </div>
      <div className="collection-heading">
        <h2>
          On your shelves <span>{data.books.length}</span>
        </h2>
        <Link to="/scan">
          <Camera size={17} />
          Scan a shelf
        </Link>
      </div>
      <div className="library-tools">
        <div className="filter-tabs" aria-label="Filter by reading status">
          {(['all', ...statuses] as const).map((status) => (
            <button
              key={status}
              aria-pressed={filter === status}
              className={filter === status ? 'active' : ''}
              onClick={() => setFilter(status)}
            >
              {status === 'all' ? 'All books' : statusLabels[status]}
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={18} />
          <input
            aria-label="Search title or author"
            placeholder="Search title or author"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <p className="results-label">
        {books.length} {books.length === 1 ? 'book' : 'books'} · Reading history for{' '}
        {member?.displayName}
      </p>
      {books.length ? (
        <div className="book-grid">
          {books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <BookOpen />
          <h2>
            {data.books.length ? 'No books match this view' : 'Your first chapter starts here'}
          </h2>
          <p>
            {data.books.length
              ? 'Try another search or reading status.'
              : 'Add a book you own to start your household library.'}
          </p>
          <Link to="/books/new" className="button secondary">
            Add a book
          </Link>
        </div>
      )}
    </>
  );
}
