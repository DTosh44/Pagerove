import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import type { LibraryBook } from '../domain/types';
import { readingStatus, statusLabels } from '../domain/library';
import { useLibrary } from './context';
export function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;
}
export function Button({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button className="button primary" disabled={busy}>
      {busy ? <LoaderCircle className="spin" size={18} /> : null}
      {children}
    </button>
  );
}
export function MemberSelector() {
  const { data, memberId, setMemberId } = useLibrary();
  return (
    <label className="member-selector">
      <span>Reading as</span>
      <select
        aria-label="Reading profile"
        value={memberId}
        onChange={(e) => setMemberId(e.target.value)}
      >
        {data.members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
const coverColors = ['clay', 'forest', 'gold', 'blue', 'berry', 'sage'];
export function Cover({ book, large = false }: { book: LibraryBook; large?: boolean }) {
  const hash = [...book.title].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return (
    <div
      className={`book-cover ${coverColors[hash % coverColors.length]} ${large ? 'large' : ''}`}
      aria-hidden="true"
    >
      {book.coverUrl ? (
        <img src={book.coverUrl} alt="" loading="lazy" />
      ) : (
        <>
          <span className="cover-frame" />
          <span className="cover-author">{book.author}</span>
          <span className="cover-title">{book.title}</span>
          <span className="cover-art">
            <span />
            <span />
            <span />
          </span>
          <span className="cover-bottom">A story waiting for you</span>
        </>
      )}
    </div>
  );
}
export function BookCard({ book }: { book: LibraryBook }) {
  const { memberId, data } = useLibrary();
  const status = readingStatus(book, memberId),
    rating = book.records.find((record) => record.memberId === memberId)?.rating;
  const readers = data.members.filter((member) => readingStatus(book, member.id) === 'read');
  return (
    <article className="book-card">
      <Link to={`/books/${book.id}`} className="book-card-link">
        <Cover book={book} />
        <div className="book-card-content">
          <p className="book-category">
            {book.categories[0] ?? 'Your collection'}
            <span>{book.format}</span>
          </p>
          <h3>{book.title}</h3>
          <p className="book-author">{book.author}</p>
        </div>
      </Link>
      <div className="book-meta">
        <span className={`status ${status}`}>
          <span />
          {statusLabels[status]}
        </span>
        {rating ? (
          <span className="rating" aria-label={`${rating} out of 5 stars`}>
            {'★'.repeat(rating)}
          </span>
        ) : readers.length ? (
          <span
            className="readers"
            title={`Read by ${readers.map((member) => member.displayName).join(', ')}`}
          >
            {readers.map((member) => member.displayName).join(', ')}
          </span>
        ) : null}
      </div>
    </article>
  );
}
