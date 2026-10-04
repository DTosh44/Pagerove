import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, BookOpen, ChevronRight } from 'lucide-react';
import { formats } from '../../domain/types';
import { useLibrary, useAction } from '../context';
import { PageHeading, ErrorMessage, Button } from '../components';
import type { MetadataMatch } from '../../domain/ingestion';
import { MetadataOptions, MetadataSource } from '../metadata';
import { api } from '../api';
export function AddBookPage() {
  const { refresh, notify } = useLibrary(),
    navigate = useNavigate(),
    { busy, error, run } = useAction();
  const [matches, setMatches] = useState<MetadataMatch[]>([]),
    [selected, setSelected] = useState<string>(),
    [values, setValues] = useState({ title: '', author: '', isbn: '', format: 'paperback' });
  const [lookupError, setLookupError] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    setLookupError('');
    setLookupBusy(true);
    try {
      const result = await api<{ matches: MetadataMatch[] }>('/metadata/lookup', 'POST', {
        title: String(input.get('queryTitle') || '') || undefined,
        author: String(input.get('queryAuthor') || '') || undefined,
        isbn: String(input.get('queryIsbn') || '') || undefined,
      });
      setMatches(result.matches);
      if (!result.matches.length)
        setLookupError('No metadata found. Enter the title and author below.');
    } catch (error) {
      setLookupError(
        error instanceof Error ? error.message : 'Metadata unavailable. Enter details below.',
      );
    } finally {
      setLookupBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void run(async () => {
      const result = await api<{ id: string }>('/books', 'POST', {
        title: values.get('title'),
        author: values.get('author'),
        format: values.get('format'),
        isbn: values.get('isbn'),
        metadataId: selected,
        additionalCopy: values.get('additionalCopy') === 'on',
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
      <section className="panel lookup-panel">
        <h2>Find book details</h2>
        <p>
          Look up an ISBN, or search by title and author. Choose a match, then confirm your copy
          below.
        </p>
        <form onSubmit={lookup}>
          <label>
            Lookup ISBN
            <input name="queryIsbn" maxLength={20} placeholder="ISBN-10 or ISBN-13" />
          </label>
          <label>
            Search title
            <input name="queryTitle" maxLength={200} />
          </label>
          <label>
            Search author <span className="optional">optional</span>
            <input name="queryAuthor" maxLength={200} />
          </label>
          <ErrorMessage message={lookupError} />
          <Button busy={lookupBusy}>Look up book</Button>
        </form>
        <MetadataOptions
          matches={matches}
          selected={selected}
          onSelect={(book) => {
            setSelected(book.id);
            setValues({
              title: book.title,
              author: book.authors.join(', '),
              isbn: book.isbn13 ?? book.isbn10 ?? '',
              format: book.format,
            });
          }}
        />
        <MetadataSource
          book={matches.find((match) => match.metadata.id === selected)?.metadata ?? null}
        />
      </section>
      <div className="split-layout">
        <form className="panel form-panel" onSubmit={submit}>
          <label>
            Title
            <input
              name="title"
              value={values.title}
              onChange={(event) => {
                setSelected(undefined);
                setValues({ ...values, title: event.target.value });
              }}
              required
              maxLength={200}
              placeholder="e.g. The Thursday Murder Club"
            />
          </label>
          <label>
            Author
            <input
              name="author"
              value={values.author}
              onChange={(event) => {
                setSelected(undefined);
                setValues({ ...values, author: event.target.value });
              }}
              required
              maxLength={200}
              placeholder="e.g. Richard Osman"
            />
          </label>
          <label>
            Format
            <select
              name="format"
              value={values.format}
              onChange={(event) => setValues({ ...values, format: event.target.value })}
            >
              {formats.map((format) => (
                <option key={format}>{format}</option>
              ))}
            </select>
          </label>
          <label>
            ISBN <span className="optional">optional</span>
            <input
              name="isbn"
              value={values.isbn}
              onChange={(event) => {
                setSelected(undefined);
                setValues({ ...values, isbn: event.target.value });
              }}
              inputMode="numeric"
              maxLength={20}
              placeholder="ISBN-10 or ISBN-13"
            />
          </label>
          <label>
            Categories <span className="optional">optional</span>
            <input name="categories" maxLength={400} placeholder="Mystery, funny" />
          </label>
          <label className="copy-choice">
            <input name="additionalCopy" type="checkbox" />I own another copy of this edition
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
