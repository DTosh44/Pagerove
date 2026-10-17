import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Check, LoaderCircle, X } from 'lucide-react';
import type { LibraryState } from '../domain/types';
import { api } from './api';
import { LibraryContext } from './context';
import { Brand, ErrorMessage, MemberSelector } from './components';
import { Onboarding } from './pages/Onboarding';
import { LibraryPage } from './pages/LibraryPage';
import { MembersPage } from './pages/MembersPage';
import { AddBookPage } from './pages/AddBookPage';
import { BookDetailsPage } from './pages/BookDetailsPage';
import { HistoryPage } from './pages/HistoryPage';
import { RecommendationsPage } from './pages/RecommendationsPage';
import { Sidebar, BottomNavigation } from './navigation';
import { HomePage } from './pages/HomePage';
import { MorePage } from './pages/MorePage';
import { ScanPage } from './pages/ScanPage';
export function App() {
  const { pathname } = useLocation();
  const welcome = pathname === '/onboarding' || pathname === '/welcome';
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
        <Brand />
        <h1>Let’s get your library ready</h1>
        <ErrorMessage message="We couldn’t open your library right now. Please try again soon." />
        <p>Your stories will be here when you’re ready to try again.</p>
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
      <div className={`app-shell ${welcome ? 'welcome-shell' : ''}`}>
        {!welcome && <Sidebar />}
        <div className="workspace">
          <header className="topbar">
            <Link className="header-brand" to="/home" aria-label="PageRove home">
              <Brand compact />
            </Link>
            <span className="topbar-note">Same books. New possibilities.</span>
            {!welcome && data.members.length > 0 && <MemberSelector />}
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
              <Route path="/welcome" element={<Onboarding preview />} />
              <Route
                path="/*"
                element={
                  data.household ? <HouseholdRoutes /> : <Navigate to="/onboarding" replace />
                }
              />
            </Routes>
          </main>
          <footer>
            <span>Books take you places.</span>
            <a href="https://openlibrary.org" target="_blank" rel="noreferrer">
              Demo cover art · Open Library
            </a>
          </footer>
        </div>
        {data.household && !welcome && <BottomNavigation />}
      </div>
    </LibraryContext.Provider>
  );
}
function HouseholdRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="/home" element={<HomePage />} />
      <Route path="/more" element={<MorePage />} />
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
