import { useState, type FormEvent } from 'react';
import { Sparkles } from 'lucide-react';
import type { Recommendation } from '../../domain/types';
import { useLibrary, useAction } from '../context';
import { PageHeading, BookCard, ErrorMessage, Button } from '../components';
import { api } from '../api';
export function RecommendationsPage() {
  const { data, memberId } = useLibrary(),
    [request, setRequest] = useState(''),
    [result, setResult] = useState<{ memberId: string; recommendations: Recommendation[] } | null>(
      null,
    ),
    { busy, error, run } = useAction();
  const recommendations = result?.memberId === memberId ? result.recommendations : null;
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
    <>
      <PageHeading
        eyebrow="A fresh look at familiar shelves"
        title="What should I read?"
        description="Tell us what you’re in the mood for. Your next book may already be at home."
      />
      <section className="recommendation-prompt panel">
        <div className="round-icon">
          <Sparkles size={28} />
        </div>
        <h2>A little inspiration for your next chapter.</h2>
        <form onSubmit={submit}>
          <label htmlFor="mood">What are you in the mood for?</label>
          <textarea
            id="mood"
            maxLength={500}
            rows={3}
            placeholder="Something gripping for a rainy weekend…"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
          />
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
          <ErrorMessage message={error} />
          <Button busy={busy}>
            Find my next read <Sparkles size={18} />
          </Button>
        </form>
        <p className="recommendation-note">
          Only unread books you already own. Using simple preference matching for this demo.
        </p>
      </section>
      {recommendations && (
        <section className="recommendation-results">
          <h2>
            {recommendations.length
              ? 'Waiting for you at home'
              : 'You’ve explored every unread book'}
          </h2>
          {!recommendations.length && (
            <p>No unread books for this profile yet. Add a book or update reading history.</p>
          )}
          <div className="recommendation-grid">
            {recommendations.map((recommendation) => {
              const book = data.books.find((item) => item.id === recommendation.bookId);
              return book ? (
                <div key={book.id}>
                  <BookCard book={book} />
                  <p className="recommendation-reason">
                    <Sparkles size={16} />
                    {recommendation.explanation}
                  </p>
                </div>
              ) : null;
            })}
          </div>
        </section>
      )}
    </>
  );
}
