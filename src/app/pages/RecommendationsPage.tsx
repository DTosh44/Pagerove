import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Plus, Sparkles } from 'lucide-react';
import type { LibraryBook, Recommendation } from '../../domain/types';
import { readingStatus } from '../../domain/library';
import { useLibrary, useAction } from '../context';
import { PageHeading, Cover, BookRow, ErrorMessage, Button } from '../components';
import { api } from '../api';
function ReadingListButton({ book, memberId }: { book: LibraryBook; memberId: string }) {
  const { refresh, notify } = useLibrary(),
    { busy, error, run } = useAction();
  const saved = readingStatus(book, memberId) === 'want_to_read';
  return (
    <div className="reading-list-action">
      <button
        type="button"
        className="button coral"
        disabled={busy || saved}
        onClick={() =>
          void run(async () => {
            await api('/history', 'PUT', { memberId, bookIds: [book.id], status: 'want_to_read' });
            await refresh();
            notify('Added to your reading list.');
          })
        }
      >
        {saved ? <Check size={19} /> : <Plus size={19} />}{' '}
        {saved ? 'On your reading list' : busy ? 'Adding…' : 'Add to my reading list'}
      </button>
      <ErrorMessage message={error} />
    </div>
  );
}
export function RecommendationsPage() {
  const { data, memberId } = useLibrary(),
    [request, setRequest] = useState(''),
    [result, setResult] = useState<{ memberId: string; recommendations: Recommendation[] } | null>(
      null,
    ),
    { busy, error, run } = useAction();
  const recommendations = result?.memberId === memberId ? result.recommendations : null;
  const primary = recommendations?.[0],
    book = data.books.find((book) => book.id === primary?.bookId);
  function submit(event: FormEvent) {
    event.preventDefault();
    const selectedMember = memberId;
    void run(async () => {
      const response = await api<{ recommendations: Recommendation[] }>(
        '/recommendations',
        'POST',
        { memberId: selectedMember, request },
      );
      setResult({ memberId: selectedMember, recommendations: response.recommendations });
    });
  }
  return (
    <div className="recommendations-page">
      <PageHeading
        title="What are you in the mood for?"
        description="A little escape. A big idea. Something you can’t put down."
      />
      <section className="mood-picker">
        <form onSubmit={submit}>
          <div className="quick-prompts">
            {['Gripping', 'Easy', 'Funny', 'Learn something', 'Short', 'Surprise me'].map(
              (prompt) => (
                <button
                  type="button"
                  key={prompt}
                  aria-pressed={request === prompt}
                  onClick={() => setRequest(prompt)}
                >
                  {prompt}
                </button>
              ),
            )}
          </div>
          <label className="mood-input" htmlFor="mood">
            <Sparkles size={21} />
            <input
              id="mood"
              aria-label="What would you like to read?"
              maxLength={500}
              placeholder="Or tell us what you’re looking for…"
              value={request}
              onChange={(e) => setRequest(e.target.value)}
            />
          </label>
          <div className="mood-submit">
            <p>
              Only books you already own,
              <br className="mobile-break" /> and haven’t read yet.
            </p>
            <Button busy={busy}>
              Find my next read <ArrowRight size={18} />
            </Button>
          </div>
          <ErrorMessage message={error} />
        </form>
      </section>
      {book && primary ? (
        <>
          <section className="recommendation-feature" aria-label="Primary recommendation">
            <Link
              to={`/books/${book.id}`}
              aria-label={`Explore ${book.title}`}
              className="feature-cover"
            >
              <Cover book={book} large />
            </Link>
            <div className="feature-content">
              <span className="recommend-label">
                <Sparkles size={15} />
                Read this next
              </span>
              <Link to={`/books/${book.id}`}>
                <h2>{book.title}</h2>
              </Link>
              <p className="feature-author">{book.author}</p>
              {book.records.find((record) => record.memberId === memberId)?.rating && (
                <span className="rating">
                  ★ {book.records.find((record) => record.memberId === memberId)?.rating} / 5
                </span>
              )}
              <p className="feature-reason">{primary.explanation}</p>
            </div>
            <ReadingListButton book={book} memberId={memberId} />
          </section>
          {recommendations && recommendations.length > 1 && (
            <section className="more-recommendations">
              <h2>More for you</h2>
              {recommendations.slice(1).map((rec) => {
                const book = data.books.find((book) => book.id === rec.bookId);
                return book ? (
                  <BookRow
                    key={book.id}
                    book={book}
                    detail={rec.explanation}
                    action={
                      <Link
                        className="icon-button subtle"
                        to={`/books/${book.id}`}
                        aria-label={`Explore ${book.title}`}
                      >
                        <ArrowRight size={20} />
                      </Link>
                    }
                  />
                ) : null;
              })}
            </section>
          )}
        </>
      ) : recommendations ? (
        <div className="empty">
          <h2>You’ve explored every unread book</h2>
          <p>Add a book or update your reading history to discover something new.</p>
          <Link to="/library" className="button secondary">
            Our Library
          </Link>
        </div>
      ) : (
        <div className="recommendation-invitation">
          <div className="orbit-symbol" aria-hidden="true">
            <Sparkles size={34} />
          </div>
          <h2>
            A great story.
            <br />
            Already close to home.
          </h2>
          <p>Choose your mood. We’ll take a fresh look at your shelves.</p>
        </div>
      )}
      <p className="demo-note">
        A little preview: suggestions currently use simple preference matching.
      </p>
    </div>
  );
}
