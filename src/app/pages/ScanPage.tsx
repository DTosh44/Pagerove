import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Camera, Check, X } from 'lucide-react';
import type { Candidate, Scan } from '../../domain/types';
import { useLibrary, useAction } from '../context';
import { PageHeading, ErrorMessage, Button } from '../components';
import { api } from '../api';
function CandidateCard({
  candidate,
  scanId,
  onUpdate,
}: {
  candidate: Candidate;
  scanId: string;
  onUpdate: (scan: Scan) => void;
}) {
  const [title, setTitle] = useState(candidate.probableTitle),
    [author, setAuthor] = useState(candidate.probableAuthor),
    { busy, error, run } = useAction(),
    { refresh, notify } = useLibrary();
  async function act(action: 'accept' | 'reject') {
    await run(async () => {
      const scan = await api<Scan>(
        `/scans/${scanId}/candidates/${candidate.id}`,
        'PUT',
        action === 'accept' ? { action, title, author } : { action },
      );
      onUpdate(scan);
      await refresh();
      if (action === 'accept') notify('Confirmed book added to your library.');
    });
  }
  return (
    <article className="panel candidate">
      <p className={`confidence ${candidate.confidence >= 0.85 ? '' : 'check'}`}>
        {candidate.confidence >= 0.85 ? 'Confident match' : 'Needs checking'} ·{' '}
        {Math.round(candidate.confidence * 100)}%
      </p>
      <label>
        Title
        <input
          aria-label={`Candidate title ${candidate.probableTitle}`}
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          disabled={candidate.confirmationState !== 'pending'}
        />
      </label>
      <label>
        Author
        <input
          aria-label={`Candidate author ${candidate.probableTitle}`}
          value={author}
          maxLength={200}
          onChange={(e) => setAuthor(e.target.value)}
          disabled={candidate.confirmationState !== 'pending'}
        />
      </label>
      <ErrorMessage message={error} />
      {candidate.confirmationState === 'pending' ? (
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
    </article>
  );
}
export function ScanPage() {
  const { scanId } = useParams(),
    navigate = useNavigate(),
    [scan, setScan] = useState<Scan | null>(null),
    { busy, error, run } = useAction(),
    [loadError, setLoadError] = useState(''),
    [photo, setPhoto] = useState<File | null>(null),
    [preview, setPreview] = useState('');
  useEffect(() => {
    if (!photo) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  useEffect(() => {
    let active = true;
    setLoadError('');
    if (scanId)
      api<Scan>(`/scans/${scanId}`)
        .then((result) => {
          if (active) setScan(result);
        })
        .catch((e) => {
          if (active) setLoadError(e.message);
        });
    else {
      setScan(null);
      setPhoto(null);
    }
    return () => {
      active = false;
    };
  }, [scanId]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get('photo') as File;
    void run(async () => {
      const result = await api<Scan>('/scans', 'POST', {
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      setScan(result);
      navigate(`/scan/${result.id}`);
    });
  }
  return (
    <>
      <PageHeading
        eyebrow="From your shelf to your library"
        title="Scan your books"
        description="Take a photo of your bookshelf and we’ll find the books for you."
      />
      <div className="notice">
        <strong>A little preview of what’s coming.</strong> You’ll see three sample matches, rather
        than books identified from your photo. Your photo stays on this device; only its name, size
        and type are saved.
      </div>
      <ErrorMessage message={loadError || error} />
      {!scan ? (
        <form className="panel upload-panel" onSubmit={submit}>
          <div className={`shelf-preview ${preview ? 'has-photo' : ''}`}>
            {preview ? (
              <img src={preview} alt="Your selected bookshelf photo" />
            ) : (
              <div className="shelf-illustration" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            )}
            <span className="scan-corners" aria-hidden="true" />
            <label className="file-label">
              <Camera size={21} />
              {photo ? 'Choose another photo' : 'Take or choose a photo'}
              <input
                aria-label="Shelf photo"
                name="photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
                onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <h2>A shelf full of possibilities</h2>
          <p>One photo. So many stories to rediscover.</p>
          <small>JPEG, PNG or WebP · up to 10 MB</small>
          <Button busy={busy}>
            Find sample books <ArrowRight size={18} />
          </Button>
        </form>
      ) : (
        <>
          {preview && (
            <div className="scan-result-photo">
              <img src={preview} alt="Your selected bookshelf photo" />
            </div>
          )}
          <div className="scan-summary">
            <h2>We found {scan.candidates.length} sample books</h2>
            <div className="scan-counts">
              <span className="confidence">
                <Check size={16} />
                {scan.candidates.filter((candidate) => candidate.confidence >= 0.85).length}{' '}
                confident
              </span>
              <span className="confidence check">
                {scan.candidates.filter((candidate) => candidate.confidence < 0.85).length} need
                checking
              </span>
            </div>
            <span>Edit any title or author, then accept or reject each match.</span>
            <a className="button primary" href="#scan-review">
              Review books <ArrowRight size={18} />
            </a>
          </div>
          <section id="scan-review" aria-label="Review book matches" className="candidate-grid">
            {scan.candidates.map((candidate) => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                scanId={scan.id}
                onUpdate={setScan}
              />
            ))}
          </section>
          <div className="scan-next">
            <Link className="button primary" to="/library">
              Back to your library <ArrowRight size={18} />
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
