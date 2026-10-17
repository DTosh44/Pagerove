import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useLibrary, useAction } from '../context';
import { BookStack, ErrorMessage, Button } from '../components';
import { api } from '../api';
export function Onboarding({ preview = false }: { preview?: boolean }) {
  const { data, refresh, notify } = useLibrary(),
    navigate = useNavigate(),
    { busy, error, run } = useAction(),
    [started, setStarted] = useState(false),
    [accountNote, setAccountNote] = useState(false);
  if (data.household && !preview) return <Navigate to="/home" replace />;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void run(async () => {
      await api('/households', 'POST', {
        name: values.get('name'),
        displayName: values.get('displayName'),
      });
      await refresh();
      notify('Your household is ready. Add your people and your books.');
      navigate('/members');
    });
  }
  return (
    <div className="onboarding">
      <section className="onboarding-copy">
        <p className="eyebrow">Your family’s intelligent library.</p>
        <h1>{started ? 'A home for your stories.' : 'A more wonderful way to read together.'}</h1>
        <p className="onboarding-description">
          Scan your books, track what you’ve read, get personalised recommendations and make more of
          the books you already own.
        </p>
        {started ? (
          <form onSubmit={submit} className="form-panel onboarding-form">
            <label>
              Household name
              <input name="name" placeholder="The Willow household" required maxLength={100} />
            </label>
            <label>
              Your display name
              <input name="displayName" placeholder="Alex" required maxLength={100} />
            </label>
            <p className="demo-note">You’re trying a shared demo. Use fictional names for now.</p>
            <ErrorMessage message={error} />
            <Button busy={busy}>
              Create your household <ArrowRight size={18} />
            </Button>
          </form>
        ) : (
          <>
            <button
              className="button primary"
              onClick={() => (data.household ? navigate('/home') : setStarted(true))}
            >
              Get started <ArrowRight size={20} />
            </button>
            <button className="account-link" onClick={() => setAccountNote(true)}>
              I already have an account
            </button>
            {accountNote && (
              <p className="notice" role="status">
                Sign-in is coming later. For now, use Get started to explore the shared demo.
              </p>
            )}
          </>
        )}
      </section>
      <div className="onboarding-visual">
        <span className="visual-caption">
          Same books.
          <br />
          New stories.
          <br />
          Further together.
        </span>
        <BookStack />
        <span className="onboarding-footnote">Books take you places.</span>
      </div>
    </div>
  );
}
