import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import {
  BookOpen,
  Camera,
  Check,
  Heart,
  Library as LibraryIcon,
  LoaderCircle,
  Plus,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import type { LibraryState } from '../domain/types';
import { api } from './api';
import { LibraryContext } from './context';
import { ErrorMessage, MemberSelector } from './components';
import { Onboarding } from './pages/Onboarding';
import { LibraryPage } from './pages/LibraryPage';
import { MembersPage } from './pages/MembersPage';
import { AddBookPage } from './pages/AddBookPage';
import { BookDetailsPage } from './pages/BookDetailsPage';
import { HistoryPage } from './pages/HistoryPage';
import { RecommendationsPage } from './pages/RecommendationsPage';
import { ScanPage } from './pages/ScanPage';
export function App() {
  const [data, setData] = useState<LibraryState | null>(null),
    [error, setError] = useState(''),
    [memberId, setMemberId] = useState(''),
    [message, setMessage] = useState('');
  const refresh = useCallback(async () => {
    const next = await api<LibraryState>('/state');
    setData(next);
    setMemberId((current) =>
      next.members.some((member) => member.id === current) ? current : (next.members[0]?.id ?? ''),
    );
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 5000);
    return () => clearTimeout(timer);
  }, [message]);
  if (error)
    return (
      <main className="initial">
        <BookOpen size={40} />
        <h1>Let’s get your library ready</h1>
        <ErrorMessage message={error} />
        <p>
          For local development, copy <code>.dev.vars.example</code> to <code>.dev.vars</code> and
          apply the D1 migrations.
        </p>
        <button
          className="button primary"
          onClick={() => {
            setError('');
            refresh().catch((e) => setError(e.message));
          }}
        >
          Try again
        </button>
      </main>
    );
  if (!data)
    return (
      <main className="initial" aria-live="polite">
        <LoaderCircle className="spin" />
        <p>Opening your library…</p>
      </main>
    );
  return (
    <LibraryContext.Provider value={{ data, memberId, setMemberId, refresh, notify: setMessage }}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="app-shell">
        <aside className="sidebar">
          <Link to="/library" className="wordmark">
            <BookOpen size={28} strokeWidth={1.5} />
            PageRove<span className="wordmark-dot">.</span>
          </Link>
          <p className="brand-line">A little closer to your next read.</p>
          <nav aria-label="Main navigation">
            <NavLink to="/library">
              <LibraryIcon size={20} />
              Your library
            </NavLink>
            <NavLink to="/recommendations">
              <Sparkles size={20} />
              What should I read?
            </NavLink>
            <NavLink to="/history">
              <BookOpen size={20} />
              Reading history
            </NavLink>
            <NavLink to="/members">
              <Users size={20} />
              Your people
            </NavLink>
            <div className="nav-divider" />
            <NavLink to="/books/new">
              <Plus size={20} />
              Add a book
            </NavLink>
            <NavLink to="/scan">
              <Camera size={20} />
              Scan your shelves
            </NavLink>
          </nav>
          <div className="sidebar-note">
            <Heart size={20} />
            <p>
              Good stories are already
              <br />
              closer than you think.
            </p>
            <span>Start with your own shelves.</span>
          </div>
          <div className="household-label">
            <span className="avatar small">W</span>
            <div>
              <strong>{data.household?.name ?? 'Your new household'}</strong>
              <span>Shared demo · fictional data</span>
            </div>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <span className="topbar-note">Your family’s intelligent library</span>
            <Link className="mobile-wordmark" to="/library">
              PageRove.
            </Link>
            {data.members.length > 0 && <MemberSelector />}
          </header>
          <main id="main" className="main-content">
            {message && (
              <div className="toast" role="status">
                <Check size={18} />
                {message}
                <button aria-label="Dismiss message" onClick={() => setMessage('')}>
                  <X size={16} />
                </button>
              </div>
            )}
            <Routes>
              <Route path="/onboarding" element={<Onboarding />} />
              <Route
                path="/*"
                element={
                  data.household ? <HouseholdRoutes /> : <Navigate to="/onboarding" replace />
                }
              />
            </Routes>
          </main>
          <footer>
            PageRove <span>Made for the books you already love.</span>
          </footer>
        </div>
      </div>
    </LibraryContext.Provider>
  );
}
function HouseholdRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/library" replace />} />
      <Route path="/library" element={<LibraryPage />} />
      <Route path="/members" element={<MembersPage />} />
      <Route path="/books/new" element={<AddBookPage />} />
      <Route path="/books/:bookId" element={<BookDetailsPage />} />
      <Route path="/history" element={<HistoryPage />} />
      <Route path="/recommendations" element={<RecommendationsPage />} />
      <Route path="/scan" element={<ScanPage />} />
      <Route path="/scan/:scanId" element={<ScanPage />} />
      <Route
        path="*"
        element={
          <div>
            <h1>That page wandered off</h1>
            <Link to="/library">Back to your library</Link>
          </div>
        }
      />
    </Routes>
  );
}
