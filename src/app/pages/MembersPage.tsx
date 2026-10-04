import { useRef, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Plus } from 'lucide-react';
import { readingStatus } from '../../domain/library';
import { useLibrary, useAction } from '../context';
import { Avatar, BookCard, PageHeading, ErrorMessage, Button, SectionHeading } from '../components';
import { api } from '../api';
export function MembersPage() {
  const { data, memberId, setMemberId, refresh, notify } = useLibrary(),
    { busy, error, run } = useAction(),
    formRef = useRef<HTMLFormElement>(null);
  const selected = data.members.find((person) => person.id === memberId),
    index = data.members.findIndex((person) => person.id === memberId);
  const books = data.books
    .filter((book) => readingStatus(book, memberId) !== 'unread')
    .sort((a, b) => {
      const date = (book: typeof a) => {
        const record = book.records.find((record) => record.memberId === memberId);
        return record?.finishedDate || record?.startedDate || '';
      };
      return date(b).localeCompare(date(a));
    })
    .slice(0, 3);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void run(async () => {
      await api('/members', 'POST', {
        displayName: values.get('displayName'),
        type: values.get('type'),
        preferences: String(values.get('preferences') || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      });
      await refresh();
      formRef.current?.reset();
      notify('Reading profile added.');
    });
  }
  return (
    <>
      <PageHeading
        title="Our People"
        description="Different readers. A shared story."
        action={
          <a className="icon-button subtle" href="#add-reader" aria-label="Add a reader">
            <Plus size={23} />
          </a>
        }
      />
      <div className="people-strip" aria-label="Choose a reader">
        {data.members.map((member, i) => (
          <button
            key={member.id}
            className={member.id === memberId ? 'selected' : ''}
            aria-pressed={member.id === memberId}
            onClick={() => setMemberId(member.id)}
          >
            <Avatar member={member} index={i} />
            <strong>{member.displayName}</strong>
            <span>
              {data.books.filter((book) => readingStatus(book, member.id) === 'read').length} books
              read
            </span>
          </button>
        ))}
      </div>
      <div className="people-layout">
        {selected && (
          <section className={`panel profile-feature profile-${index % 4}`}>
            <div className="profile-heading">
              <Avatar member={selected} index={index} />
              <div>
                <h2>{selected.displayName}</h2>
                <p>
                  {data.books.filter((book) => readingStatus(book, memberId) === 'read').length}{' '}
                  books read <span>·</span>{' '}
                  {data.books.filter((book) => readingStatus(book, memberId) === 'reading').length}{' '}
                  being enjoyed
                </p>
              </div>
            </div>
            <SectionHeading title="My reading" link="/history" />
            {books.length ? (
              <div className="profile-books">
                {books.map((book) => (
                  <BookCard key={book.id} book={book} />
                ))}
              </div>
            ) : (
              <div className="empty compact">
                <p>Your next chapter starts here.</p>
                <Link to="/library">
                  Explore Our Library <ArrowRight size={15} />
                </Link>
              </div>
            )}
            <h3 className="genres-heading">Favourite genres</h3>
            <div className="tags">
              {selected.preferences.length ? (
                selected.preferences.map((pref) => <span key={pref}>{pref}</span>)
              ) : (
                <p className="muted">A curious mind. A world of possibilities.</p>
              )}
            </div>
            <div className="quote-card">
              <p>
                “Today a reader,
                <br />
                tomorrow a leader.”
              </p>
              <span>— MARGARET FULLER</span>
            </div>
          </section>
        )}
        <form id="add-reader" ref={formRef} onSubmit={submit} className="panel form-panel">
          <h2>A story for everyone</h2>
          <p className="muted">
            Add a reader to your household. Just a name and the kinds of stories they enjoy.
          </p>
          <label>
            Display name
            <input name="displayName" required maxLength={100} placeholder="e.g. Sam" />
          </label>
          <label>
            Reader
            <select name="type">
              <option value="adult">Adult</option>
              <option value="child">Child</option>
            </select>
          </label>
          <label>
            Favourite genres <span className="optional">optional</span>
            <input name="preferences" placeholder="Fantasy, funny, adventure" maxLength={400} />
            <small>Separate up to 10 favourites with commas.</small>
          </label>
          <p className="privacy-note">
            Young readers share your library. They don’t need their own account.
          </p>
          <ErrorMessage message={error} />
          <Button busy={busy}>
            Add reader <Plus size={18} />
          </Button>
        </form>
      </div>
    </>
  );
}
