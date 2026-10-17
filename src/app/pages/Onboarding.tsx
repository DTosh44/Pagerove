import { type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen } from 'lucide-react';
import { useLibrary, useAction } from '../context';
import { ErrorMessage, Button } from '../components';
import { api } from '../api';
export function Onboarding() {
  const { data, refresh, notify } = useLibrary(),
    navigate = useNavigate(),
    { busy, error, run } = useAction();
  if (data.household) return <Navigate to="/library" replace />;
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
      <div className="round-icon">
        <BookOpen size={36} />
      </div>
      <p className="eyebrow">Welcome to PageRove</p>
      <h1>
        Every shelf has
        <br />a story to tell.
      </h1>
      <p className="muted">Make a home for the books you own and the people who read them.</p>
      <div className="notice">
        This foundation uses a shared demo account. Use fictional information while authentication
        is being prepared.
      </div>
      <form onSubmit={submit} className="panel form-panel">
        <label>
          Household name
          <input name="name" placeholder="The Willow household" required maxLength={100} />
        </label>
        <label>
          Your display name
          <input name="displayName" placeholder="Alex" required maxLength={100} />
        </label>
        <ErrorMessage message={error} />
        <Button busy={busy}>
          Create your household <ArrowRight size={18} />
        </Button>
      </form>
    </div>
  );
}
