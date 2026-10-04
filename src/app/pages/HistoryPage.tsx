import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { statuses } from '../../domain/types';
import { filterLibrary, readingStatus, statusLabels } from '../../domain/library';
import { useLibrary, useAction } from '../context';
import { PageHeading, ErrorMessage } from '../components';
import { api } from '../api';
export function HistoryPage() {
  const { data, memberId, refresh, notify } = useLibrary(),
    [selected, setSelected] = useState<string[]>([]),
    [query, setQuery] = useState(''),
    { busy, error, run } = useAction();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void run(async () => {
      await api('/history', 'PUT', {
        memberId,
        bookIds: selected,
        status: values.get('status'),
        ...(values.get('rating') ? { rating: Number(values.get('rating')) } : {}),
      });
      await refresh();
      setSelected([]);
      notify('Reading history updated for the selected books.');
    });
  }
  const books = filterLibrary(data.books, memberId, 'all', query);
  return (
    <>
      <PageHeading
        eyebrow="Every reader, every chapter"
        title="Reading history"
        description="Select a few books and update your reading history in one go."
      />
      <form className="bulk-bar panel" onSubmit={submit}>
        <strong>{selected.length} selected</strong>
        <label>
          Status
          <select name="status">
            {statuses.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rating
          <select name="rating">
            <option value="">Keep existing</option>
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value} stars
              </option>
            ))}
          </select>
        </label>
        <button className="button primary" disabled={busy || !selected.length}>
          {busy ? 'Saving…' : 'Apply to selected'}
        </button>
        <ErrorMessage message={error} />
      </form>
      <label className="search history-search">
        <Search size={18} />
        <input
          aria-label="Search history"
          placeholder="Find a book"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="panel history-list">
        <div className="history-list-heading">
          <label>
            <input
              type="checkbox"
              checked={books.length > 0 && books.every((book) => selected.includes(book.id))}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...new Set([...selected, ...books.map((book) => book.id)])]
                    : selected.filter((id) => !books.some((book) => book.id === id)),
                )
              }
            />
            Select visible books
          </label>
          <span>Selected profile’s status</span>
        </div>
        {books.map((book) => (
          <div key={book.id} className="history-row">
            <input
              type="checkbox"
              aria-label={`Select ${book.title}`}
              checked={selected.includes(book.id)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, book.id]
                    : selected.filter((id) => id !== book.id),
                )
              }
            />
            <Link to={`/books/${book.id}`}>
              <strong>{book.title}</strong>
              <span>{book.author}</span>
            </Link>
            <span className={`status ${readingStatus(book, memberId)}`}>
              {statusLabels[readingStatus(book, memberId)]}
            </span>
          </div>
        ))}
        {!books.length && <p className="empty">No books to show.</p>}
      </div>
    </>
  );
}
