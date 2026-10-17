import { type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, BookOpen, ChevronRight } from 'lucide-react';
import { formats } from '../../domain/types';
import { useLibrary, useAction } from '../context';
import { PageHeading, ErrorMessage, Button } from '../components';
import { api } from '../api';
export function AddBookPage() {
  const { refresh, notify } = useLibrary(),
    navigate = useNavigate(),
    { busy, error, run } = useAction();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void run(async () => {
      const result = await api<{ id: string }>('/books', 'POST', {
        title: values.get('title'),
        author: values.get('author'),
        format: values.get('format'),
        isbn: values.get('isbn'),
        categories: String(values.get('categories') || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      });
      await refresh();
      notify('Book added to your household library.');
      navigate(`/books/${result.id}`);
    });
  }
  return (
    <>
      <PageHeading
        eyebrow="Make room for another story"
        title="Add a book"
        description="Start with the title and author. The rest can wait."
      />
      <div className="split-layout">
        <form className="panel form-panel" onSubmit={submit}>
          <label>
            Title
            <input
              name="title"
              required
              maxLength={200}
              placeholder="e.g. The Thursday Murder Club"
            />
          </label>
          <label>
            Author
            <input name="author" required maxLength={200} placeholder="e.g. Richard Osman" />
          </label>
          <label>
            Format
            <select name="format" defaultValue="paperback">
              {formats.map((format) => (
                <option key={format}>{format}</option>
              ))}
            </select>
          </label>
          <label>
            ISBN <span className="optional">optional</span>
            <input
              name="isbn"
              inputMode="numeric"
              maxLength={20}
              placeholder="Saved for future metadata lookup"
            />
          </label>
          <label>
            Categories <span className="optional">optional</span>
            <input name="categories" maxLength={400} placeholder="Mystery, funny" />
          </label>
          <ErrorMessage message={error} />
          <Button busy={busy}>
            Add to your library <Plus size={18} />
          </Button>
        </form>
        <div className="aside-story">
          <BookOpen size={50} strokeWidth={1} />
          <h2>
            One book.
            <br />
            Many reading journeys.
          </h2>
          <p>
            Add the copy you own once. Everyone in your household can keep their own reading history
            and rating.
          </p>
          <Link to="/scan">
            Have a whole shelf to add? <ChevronRight size={16} />
          </Link>
        </div>
      </div>
    </>
  );
}
