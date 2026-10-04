import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import type { LibraryBook, Member, ReadingStatus } from '../domain/types';
import { readingStatus, statusLabels } from '../domain/library';
import { useLibrary } from './context';
import { demoCover } from './demo-covers';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand ${compact ? 'compact' : ''}`}>
      <img src="/brand/mark.svg" alt="" />
      <span>PageRove</span>
    </span>
  );
}
export function Avatar({
  member,
  small = false,
  index = 0,
}: {
  member: Pick<Member, 'displayName'>;
  small?: boolean;
  index?: number;
}) {
  return (
    <span className={`avatar avatar-${index % 4} ${small ? 'small' : ''}`} aria-hidden="true">
      {member.displayName.trim().slice(0, 1)}
    </span>
  );
}
export function StatusBadge({ status }: { status: ReadingStatus }) {
  return <span className={`status ${status}`}>{statusLabels[status]}</span>;
}
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
      {busy && <LoaderCircle className="spin" size={18} />} {children}
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
export function Cover({ book, large = false }: { book: LibraryBook; large?: boolean }) {
  const source = book.coverUrl || demoCover(book);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const hash = [...book.title].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return (
    <div className={`book-cover tone-${hash % 4} ${large ? 'large' : ''}`} aria-hidden="true">
      {source && source !== failedSource ? (
        <img
          src={source}
          alt=""
          loading={large ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailedSource(source)}
        />
      ) : (
        <div className="cover-placeholder">
          <span className="cover-author">{book.author}</span>
          <span className="cover-title">{book.title}</span>
          <span className="cover-orbit" />
          <span className="cover-imprint">PAGEROVE COLLECTION</span>
        </div>
      )}
    </div>
  );
}
export function BookCard({ book }: { book: LibraryBook }) {
  const { memberId } = useLibrary();
  return (
    <article className="book-card">
      <Link to={`/books/${book.id}`} className="book-card-link">
        <Cover book={book} />
        <h3>{book.title}</h3>
        <p className="book-author">{book.author}</p>
      </Link>
      <StatusBadge status={readingStatus(book, memberId)} />
    </article>
  );
}
export function BookRow({
  book,
  detail,
  action,
}: {
  book: LibraryBook;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <article className="book-row">
      <Link to={`/books/${book.id}`} className="book-row-link">
        <Cover book={book} />
        <div>
          <h3>{book.title}</h3>
          <p className="book-author">{book.author}</p>
          {detail && <p className="row-detail">{detail}</p>}
        </div>
      </Link>
      {action}
    </article>
  );
}
export function SectionHeading({
  title,
  link,
  label = 'See all',
}: {
  title: string;
  link?: string;
  label?: string;
}) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {link && (
        <Link to={link}>
          {label}
          <span aria-hidden="true"> →</span>
        </Link>
      )}
    </div>
  );
}
export function BookStack() {
  return (
    <div className="book-stack" aria-hidden="true">
      <span className="stack-book coral-book">Same books.</span>
      <span className="stack-book sage-book">New stories.</span>
      <span className="stack-book navy-book">Further together.</span>
      <span className="stack-book sand-book">Books take you places.</span>
      <span className="stack-leaf leaf-one" />
      <span className="stack-leaf leaf-two" />
    </div>
  );
}
