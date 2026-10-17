import { type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import type { LibraryBook } from '../../domain/types';
import { statuses } from '../../domain/types';
import { statusLabels } from '../../domain/library';
import { useLibrary, useAction } from '../context';
import { Avatar, StatusBadge, Cover, ErrorMessage, Button } from '../components';
import { MetadataSource } from '../metadata';
import { api } from '../api';
function HistoryForm({ book }: { book: LibraryBook }) {
  const { memberId, refresh, notify } = useLibrary(),
    { busy, error, run } = useAction();
  const record = book.records.find((item) => item.memberId === memberId);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void run(async () => {
      await api('/history', 'PUT', {
        memberId,
        bookIds: [book.id],
        status: values.get('status'),
        rating: values.get('rating') ? Number(values.get('rating')) : null,
        startedDate: values.get('startedDate') || null,
        finishedDate: values.get('finishedDate') || null,
      });
      await refresh();
      notify('Reading history saved.');
    });
  }
  return (
    <form
      key={memberId + (record?.status ?? '') + (record?.rating ?? '')}
      onSubmit={submit}
      className="panel form-panel"
    >
      <h2>Your reading journey</h2>
      <label>
        Reading status
        <select name="status" defaultValue={record?.status ?? 'unread'}>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {statusLabels[status]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Your rating
        <select name="rating" defaultValue={record?.rating ?? ''}>
          <option value="">No rating</option>
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              {'★'.repeat(value)} · {value} of 5
            </option>
          ))}
        </select>
      </label>
      <div className="form-row">
        <label>
          Date started
          <input type="date" name="startedDate" defaultValue={record?.startedDate ?? ''} />
        </label>
        <label>
          Date finished
          <input type="date" name="finishedDate" defaultValue={record?.finishedDate ?? ''} />
        </label>
      </div>
      <ErrorMessage message={error} />
      <Button busy={busy}>
        Save reading history <Check size={18} />
      </Button>
    </form>
  );
}
export function BookDetailsPage() {
  const { bookId } = useParams(),
    { data } = useLibrary();
  const book = data.books.find((item) => item.id === bookId);
  if (!book)
    return (
      <div className="empty">
        <h1>Book not found</h1>
        <Link to="/library">Back to your library</Link>
      </div>
    );
  return (
    <>
      <Link className="back-link" to="/library">
        ← Back to your library
      </Link>
      <div className="book-detail">
        <Cover book={book} large />
        <div>
          <p className="eyebrow">Already on your shelf</p>
          <h1>{book.title}</h1>
          <p className="detail-author">by {book.author}</p>
          <div className="tags">
            {book.categories.map((category) => (
              <span key={category}>{category}</span>
            ))}
          </div>
          <p className="description">
            {book.description ||
              'A new addition to your shared library. Its next chapter is yours.'}
          </p>
          <dl>
            <div>
              <dt>Format</dt>
              <dd>{book.format}</dd>
            </div>
            {book.pageCount && (
              <div>
                <dt>Pages</dt>
                <dd>{book.pageCount}</dd>
              </div>
            )}
            {book.location && (
              <div>
                <dt>At home</dt>
                <dd>{book.location}</dd>
              </div>
            )}
            {book.isbn && (
              <div>
                <dt>ISBN</dt>
                <dd>{book.isbn}</dd>
              </div>
            )}
            {book.metadata?.publisher && (
              <div>
                <dt>Publisher</dt>
                <dd>{book.metadata.publisher}</dd>
              </div>
            )}
            {book.metadata?.year && (
              <div>
                <dt>Published</dt>
                <dd>{book.metadata.year}</dd>
              </div>
            )}
          </dl>
          <MetadataSource book={book.metadata ?? null} />
        </div>
      </div>
      <div className="split-layout">
        <HistoryForm book={book} />
        <section className="panel household-reading">
          <h2>Around the household</h2>
          {data.members.map((member, index) => {
            const record = book.records.find((item) => item.memberId === member.id);
            return (
              <div className="reader-row" key={member.id}>
                <Avatar member={member} index={index} small />
                <strong>{member.displayName}</strong>
                <StatusBadge status={record?.status ?? 'unread'} />
                {record?.rating && (
                  <span className="rating" aria-label={`${record.rating} out of 5 stars`}>
                    {'★'.repeat(record.rating)}
                  </span>
                )}
              </div>
            );
          })}
        </section>
      </div>
    </>
  );
}
