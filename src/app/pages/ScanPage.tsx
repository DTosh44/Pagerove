import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Camera, Check, X, Search } from 'lucide-react';
import type { Candidate, Scan } from '../../domain/types';
import { formats } from '../../domain/types';
import { useLibrary, useAction } from '../context';
import { PageHeading, ErrorMessage, Button } from '../components';
import { MetadataCover, MetadataOptions, MetadataSource } from '../metadata';
import { api } from '../api';
function CandidateCard({
  candidate,
  scanId,
  onUpdate,
  onDirty,
  dirty,
  locked,
}: {
  candidate: Candidate;
  scanId: string;
  onUpdate: (scan: Scan) => void;
  onDirty: (id: string, dirty: boolean) => void;
  dirty: boolean;
  locked: boolean;
}) {
  const [title, setTitle] = useState(candidate.metadata?.title ?? candidate.probableTitle),
    [author, setAuthor] = useState(
      candidate.metadata?.authors.join(', ') ?? candidate.probableAuthor,
    ),
    [isbn, setIsbn] = useState(candidate.metadata?.isbn13 ?? candidate.probableIsbn ?? ''),
    [format, setFormat] = useState(candidate.metadata?.format ?? 'unknown'),
    [selected, setSelected] = useState<string>(),
    [additionalCopy, setAdditionalCopy] = useState(false),
    { busy, error, run } = useAction(),
    { refresh, notify } = useLibrary();
  const pending = candidate.confirmationState === 'pending';
  const chosen =
    candidate.alternatives.find((match) => match.metadata.id === selected)?.metadata ??
    candidate.metadata;
  const preview =
    chosen && title === chosen.title && author === chosen.authors.join(', ') ? chosen : null;
  async function act(action: 'accept' | 'reject') {
    await run(async () => {
      const scan = await api<Scan>(
        `/scans/${scanId}/candidates/${candidate.id}`,
        'PUT',
        action === 'accept'
          ? { action, title, author, isbn, format, metadataId: selected, additionalCopy }
          : { action },
      );
      onUpdate(scan);
      onDirty(candidate.id, false);
      await refresh();
      if (action === 'accept') notify('Confirmed book saved in your library.');
    });
  }
  function search() {
    void run(async () => {
      const scan = await api<Scan>(`/scans/${scanId}/candidates/${candidate.id}/search`, 'POST', {
        title,
        author,
        isbn,
      });
      onUpdate(scan);
      setSelected(undefined);
    });
  }
  return (
    <article className="panel candidate">
      <fieldset
        className="candidate-fields"
        aria-label={`Review ${title}`}
        disabled={locked || busy}
      >
        <p className={`confidence ${candidate.band === 'HIGH' && !dirty ? '' : 'check'}`}>
          {dirty ? (
            'Edited details · review before accepting'
          ) : (
            <>
              {candidate.band === 'HIGH' ? 'Confident match' : 'Needs checking'} ·{' '}
              {Math.round(candidate.confidence * 100)}%
            </>
          )}
        </p>
        <div className="candidate-book">
          {preview && <MetadataCover book={preview} />}
          <div>
            <h3>{title}</h3>
            <p>{author}</p>
            <small>{format === 'unknown' ? 'Format unknown' : format}</small>
          </div>
        </div>
        {candidate.warning && <p>{candidate.warning}</p>}
        {pending && candidate.alternatives.length > 0 && (
          <details>
            <summary>
              {candidate.alternatives.length} possible{' '}
              {candidate.alternatives.length === 1 ? 'match' : 'matches'} · choose an edition
            </summary>
            <MetadataOptions
              matches={candidate.alternatives}
              selected={selected}
              onSelect={(book) => {
                onDirty(candidate.id, true);
                setSelected(book.id);
                setTitle(book.title);
                setAuthor(book.authors.join(', '));
                setIsbn(book.isbn13 ?? book.isbn10 ?? '');
                setFormat(book.format);
              }}
            />
          </details>
        )}
        <MetadataSource book={preview} />
        <label>
          Title
          <input
            aria-label={`Candidate title ${candidate.probableTitle}`}
            value={title}
            maxLength={200}
            onChange={(event) => {
              onDirty(candidate.id, true);
              setTitle(event.target.value);
              setSelected(undefined);
              setIsbn('');
            }}
            disabled={!pending}
          />
        </label>
        <label>
          Author
          <input
            aria-label={`Candidate author ${candidate.probableTitle}`}
            value={author}
            maxLength={200}
            onChange={(event) => {
              onDirty(candidate.id, true);
              setAuthor(event.target.value);
              setSelected(undefined);
              setIsbn('');
            }}
            disabled={!pending}
          />
        </label>
        {pending && (
          <details>
            <summary>Edit ISBN and format</summary>
            <label>
              ISBN
              <input
                aria-label={`Candidate ISBN ${candidate.probableTitle}`}
                value={isbn}
                maxLength={20}
                onChange={(event) => {
                  onDirty(candidate.id, true);
                  setIsbn(event.target.value);
                  setSelected(undefined);
                }}
              />
            </label>
            <label>
              Format
              <select
                value={format}
                onChange={(event) => {
                  onDirty(candidate.id, true);
                  setFormat(event.target.value as typeof format);
                }}
              >
                {formats.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </details>
        )}
        {pending && (
          <>
            <button
              type="button"
              className="button secondary"
              disabled={busy || (!title.trim() && !isbn)}
              onClick={search}
            >
              <Search size={16} />
              Search metadata
            </button>
            <label className="copy-choice">
              <input
                type="checkbox"
                checked={additionalCopy}
                onChange={(event) => {
                  onDirty(candidate.id, true);
                  setAdditionalCopy(event.target.checked);
                }}
              />
              I own another copy of this edition
            </label>
          </>
        )}
        <ErrorMessage message={error} />
        {pending ? (
          <div className="candidate-actions">
            <button
              className="button primary"
              disabled={busy || !title.trim() || !author.trim()}
              onClick={() => void act('accept')}
            >
              <Check size={17} />
              Accept
            </button>
            <button className="button secondary" disabled={busy} onClick={() => void act('reject')}>
              <X size={17} />
              Reject
            </button>
          </div>
        ) : (
          <p className="confirmed">
            <Check size={16} />
            {candidate.confirmationState === 'accepted' ? 'Added to your library' : 'Rejected'}
          </p>
        )}
      </fieldset>
    </article>
  );
}
export function ScanPage() {
  const { scanId } = useParams(),
    navigate = useNavigate(),
    [scan, setScan] = useState<Scan | null>(null),
    { busy, error, run } = useAction(),
    { refresh, notify } = useLibrary(),
    [loadError, setLoadError] = useState(''),
    [photos, setPhotos] = useState<File[]>([]),
    [previews, setPreviews] = useState<string[]>([]),
    [config, setConfig] = useState<{
      recognition: string;
      metadata: string;
      externalImages: boolean;
    } | null>(null),
    [uncertainOnly, setUncertainOnly] = useState(false),
    [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set()),
    [recent, setRecent] = useState<{ id: string; status: string }[]>([]);
  useEffect(() => {
    api<typeof config>('/ingestion/config')
      .then(setConfig)
      .catch((error) => setLoadError(error.message));
    api<typeof recent>('/scans')
      .then(setRecent)
      .catch(() => {});
  }, []);
  useEffect(() => {
    const urls = photos.map((photo) => URL.createObjectURL(photo));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [photos]);
  useEffect(() => {
    let active = true;
    setLoadError('');
    if (scanId)
      api<Scan>(`/scans/${scanId}`)
        .then((result) => {
          if (active) setScan(result);
        })
        .catch((error) => {
          if (active) setLoadError(error.message);
        });
    else {
      setScan(null);
      setPhotos([]);
      setUncertainOnly(false);
      setDirtyIds(new Set());
    }
    return () => {
      active = false;
    };
  }, [scanId]);
  useEffect(() => {
    if (scan?.status !== 'processing') return;
    let active = true;
    const timer = setInterval(() => {
      api<Scan>(`/scans/${scan.id}`)
        .then((result) => {
          if (active) setScan(result);
        })
        .catch((error) => {
          if (active) setLoadError(error.message);
        });
    }, 1500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [scan?.id, scan?.status]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      const data = new FormData();
      photos.forEach((photo) => data.append('photos', photo));
      const result = await api<Scan>('/scans', 'POST', data);
      setScan(result);
      navigate(`/scan/${result.id}`);
    });
  }
  function retry(imageId: string) {
    void run(async () => {
      if (photos.length !== 1) throw new Error('Choose exactly one photo to retry.');
      const data = new FormData();
      data.append('photos', photos[0]);
      setScan(await api<Scan>(`/scans/${scan!.id}/images/${imageId}/retry`, 'POST', data));
    });
  }
  const pending =
      scan?.candidates.filter((candidate) => candidate.confirmationState === 'pending') ?? [],
    confident = pending.filter(
      (candidate) => candidate.band === 'HIGH' && !dirtyIds.has(candidate.id),
    ).length;
  function markDirty(id: string, dirty: boolean) {
    setDirtyIds((current) => {
      const next = new Set(current);
      if (dirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function choosePhotos(files: FileList | null, append = false) {
    const incoming = Array.from(files ?? []);
    const next = append ? [...photos, ...incoming] : incoming;
    if (next.length > 3) {
      setLoadError('Choose no more than three photos.');
      return;
    }
    if (next.some((photo) => photo.size > 8 * 1024 * 1024)) {
      setLoadError('Each photo must be at most 8 MB.');
      return;
    }
    setLoadError('');
    setPhotos(next);
  }
  const photoInput = (
    <label className="file-label">
      <Camera size={21} />
      {photos.length ? 'Choose other photos' : 'Take or choose photos'}
      <input
        aria-label="Shelf photo"
        name="photos"
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        required
        onChange={(event) => choosePhotos(event.target.files)}
      />
    </label>
  );
  return (
    <>
      <PageHeading
        eyebrow="From your shelf to your library"
        title="Scan your books"
        description="Take a photo of your bookshelf and we’ll find the books for you."
      />
      <div className="notice">
        {config?.externalImages ? (
          <>
            <strong>Photos are sent to OpenAI for recognition.</strong> PageRove does not store the
            photos. OpenAI may retain inputs for abuse monitoring, generally up to 30 days.{' '}
            {config.metadata === 'google-books' && <>Book text is sent to Google Books. </>}
            Crop out people and private details before uploading.
          </>
        ) : (
          <>
            <strong>A little preview of what’s coming.</strong> Mock mode returns three sample
            matches. Photos reach the PageRove backend but are discarded after processing; they are
            not sent to an external vision service.{' '}
            {config?.metadata === 'google-books' && (
              <>Book titles, authors and ISBN searches are sent to Google Books.</>
            )}
          </>
        )}
      </div>
      <ErrorMessage message={loadError || error} />
      {!scan ? (
        <>
          <form className="panel upload-panel" onSubmit={submit}>
            <div className={`shelf-preview ${previews.length ? 'has-photo' : ''}`}>
              {previews[0] ? (
                <img src={previews[0]} alt="Your selected bookshelf photo" />
              ) : (
                <div className="shelf-illustration" aria-hidden="true">
                  {Array.from({ length: 9 }, (_, i) => (
                    <span key={i} />
                  ))}
                </div>
              )}
              <span className="scan-corners" aria-hidden="true" />
              {photoInput}
            </div>
            {photos.length > 0 && (
              <div className="selected-photos">
                {previews.map((url, index) => (
                  <figure key={url}>
                    <img src={url} alt={`Selected shelf photo ${index + 1}`} />
                    <button
                      type="button"
                      className="button secondary"
                      aria-label={`Remove photo ${index + 1}`}
                      onClick={() => setPhotos(photos.filter((_, i) => i !== index))}
                    >
                      <X size={16} />
                    </button>
                  </figure>
                ))}
              </div>
            )}
            {photos.length > 0 && photos.length < 3 && (
              <label className="file-label add-photo">
                <Camera size={18} />
                Add another photo
                <input
                  aria-label="Additional shelf photo"
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => choosePhotos(event.target.files, true)}
                />
              </label>
            )}
            <h2>A shelf full of possibilities</h2>
            <p>
              {photos.length
                ? `${photos.length} photos selected. Overlapping books are combined.`
                : 'Capture a shelf, a stack, or a few stories at a time.'}
            </p>
            <small>1–3 JPEG, PNG or WebP photos · up to 8 MB each</small>
            <Button busy={busy || !config}>
              {config?.recognition === 'mock' ? 'Find sample books' : 'Find my books'}
              <ArrowRight size={18} />
            </Button>
          </form>
          {recent.length > 0 && (
            <section className="panel">
              <h2>Resume a recent scan</h2>
              {recent.map((item, index) => (
                <p key={item.id}>
                  <Link to={`/scan/${item.id}`}>
                    Scan {index + 1} · {item.status}
                  </Link>
                </p>
              ))}
            </section>
          )}
        </>
      ) : (
        <>
          {previews[0] && (
            <div className="scan-result-photo">
              <img src={previews[0]} alt="Your selected bookshelf photo" />
            </div>
          )}
          <div className="scan-summary">
            <h2>
              {scan.status === 'processing'
                ? 'Finding the stories on your shelf…'
                : `We found ${scan.candidates.length}${config?.recognition === 'mock' ? ' sample' : ''} books`}
            </h2>
            {scan.status === 'processing' && (
              <p role="status">
                Your scan is saved. You can return to this page while we process the photos.
              </p>
            )}
            <div className="scan-counts">
              <span className="confidence">
                <Check size={16} />
                {confident} confident
              </span>
              <span className="confidence check">{pending.length - confident} need checking</span>
              <span>{scan.candidates.length - pending.length} reviewed</span>
            </div>
            <p>Edit any title or author, then accept or reject each match.</p>
            {confident > 0 && (
              <button
                className="button primary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await api<Scan & { failures: string[] }>(
                      `/scans/${scan.id}/accept-confident`,
                      'POST',
                      { excludeIds: [...dirtyIds] },
                    );
                    setScan(result);
                    setUncertainOnly(true);
                    await refresh();
                    notify(
                      result.failures.length
                        ? 'Some books still need checking. Your other choices are saved.'
                        : 'Confident books saved. Review the remaining matches.',
                    );
                  })
                }
              >
                Accept all confident books <Check size={18} />
              </button>
            )}
            <a className="button secondary" href="#scan-review">
              Review books <ArrowRight size={18} />
            </a>
          </div>
          {scan.warnings.map((warning, index) => (
            <p className="notice" role="status" key={index}>
              {warning}
            </p>
          ))}
          {scan.images.some((image) => ['failed', 'pending', 'processing'].includes(image.state)) &&
            scan.status !== 'processing' && (
              <div className="panel retry-photo">
                <h2>Retry a photo</h2>
                <p>
                  Photos are not retained. Choose the original photo again; reviewed books stay
                  saved.
                </p>
                {photoInput}
                {scan.images
                  .filter((image) => image.state !== 'completed')
                  .map((image) => (
                    <button
                      key={image.id}
                      className="button secondary"
                      disabled={busy}
                      onClick={() => retry(image.id)}
                    >
                      Retry photo {scan.images.indexOf(image) + 1}
                    </button>
                  ))}
              </div>
            )}
          <label className="copy-choice">
            <input
              type="checkbox"
              checked={uncertainOnly}
              onChange={(event) => setUncertainOnly(event.target.checked)}
            />
            Show only books still needing review
          </label>
          <section id="scan-review" aria-label="Review book matches" className="candidate-grid">
            {scan.candidates
              .filter((candidate) => !uncertainOnly || candidate.confirmationState === 'pending')
              .map((candidate) => (
                <CandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  scanId={scan.id}
                  onUpdate={setScan}
                  dirty={dirtyIds.has(candidate.id)}
                  locked={busy}
                  onDirty={markDirty}
                />
              ))}
          </section>
          {!pending.length && scan.candidates.length > 0 && (
            <p role="status">All books reviewed. Your choices are saved.</p>
          )}
          <div className="scan-next">
            <Link className="button primary" to="/library">
              Back to your library <ArrowRight size={18} />
            </Link>
            <Link className="button secondary" to="/books/new">
              Add a book manually
            </Link>
            <Link className="button secondary" to="/scan">
              Try another photo
            </Link>
          </div>
        </>
      )}
    </>
  );
}
