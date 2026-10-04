import { useRef, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { readingStatus } from '../../domain/library';
import { useLibrary, useAction } from '../context';
import { PageHeading, ErrorMessage, Button } from '../components';
import { api } from '../api';
export function MembersPage() {
  const { data, refresh, notify } = useLibrary(),
    { busy, error, run } = useAction(),
    formRef = useRef<HTMLFormElement>(null);
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
        eyebrow="Everyone has their own story"
        title="Your people"
        description="One shared library. A reading journey for each of you."
      />
      <div className="split-layout">
        <div className="people-grid">
          {data.members.map((member, index) => (
            <article className="panel person" key={member.id}>
              <span className={`avatar avatar-${index % 4}`}>{member.displayName[0]}</span>
              <h2>{member.displayName}</h2>
              <p>{member.type === 'adult' ? 'Adult reader' : 'Young reader'}</p>
              <div className="person-stats">
                <strong>
                  {data.books.filter((book) => readingStatus(book, member.id) === 'read').length}
                </strong>
                <span>books read</span>
              </div>
              <div className="tags">
                {member.preferences.map((pref) => (
                  <span key={pref}>{pref}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
        <form ref={formRef} onSubmit={submit} className="panel form-panel">
          <h2>Add a reader</h2>
          <p className="muted">
            Children have profiles, with no separate login or date of birth needed.
          </p>
          <label>
            Display name
            <input name="displayName" required maxLength={100} />
          </label>
          <label>
            Profile type
            <select name="type">
              <option value="adult">Adult</option>
              <option value="child">Child</option>
            </select>
          </label>
          <label>
            Favourite genres <span className="optional">optional</span>
            <input name="preferences" placeholder="Fantasy, funny, adventure" maxLength={400} />
            <small>Separate preferences with commas. Up to 10.</small>
          </label>
          <ErrorMessage message={error} />
          <Button busy={busy}>
            Add reader <Plus size={18} />
          </Button>
        </form>
      </div>
    </>
  );
}
