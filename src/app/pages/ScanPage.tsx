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
    [loadError, setLoadError] = useState('');
  useEffect(() => {
    let active = true;
    if (scanId)
      api<Scan>(`/scans/${scanId}`)
        .then((result) => {
          if (active) setScan(result);
        })
        .catch((e) => {
          if (active) setLoadError(e.message);
        });
    else setScan(null);
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
        description="A future shortcut for bringing a whole bookshelf into PageRove."
      />
      <div className="notice">
        <strong>Sample recognition preview.</strong> This mock returns three sample titles
        regardless of the selected photo. Only filename, type and size are saved; your photo stays
        on your device.
      </div>
      <ErrorMessage message={loadError || error} />
      {!scan ? (
        <form className="panel upload-panel" onSubmit={submit}>
          <div className="round-icon">
            <Camera size={34} />
          </div>
          <h2>A shelf full of possibilities</h2>
          <p>Choose a photo to try the review and confirmation journey.</p>
          <label className="file-label">
            Shelf photo
            <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required />
          </label>
          <small>JPEG, PNG or WebP · up to 10 MB</small>
          <Button busy={busy}>
            Preview sample recognition <ArrowRight size={18} />
          </Button>
        </form>
      ) : (
        <>
          <div className="scan-summary">
            <h2>PageRove found {scan.candidates.length} sample books</h2>
            <p>
              {scan.candidates.filter((candidate) => candidate.confidence >= 0.85).length} confident
              · {scan.candidates.filter((candidate) => candidate.confidence < 0.85).length} need
              checking
            </p>
            <span>Edit any title or author, then accept or reject each match.</span>
          </div>
          <div className="candidate-grid">
            {scan.candidates.map((candidate) => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                scanId={scan.id}
                onUpdate={setScan}
              />
            ))}
          </div>
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
