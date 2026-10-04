import { NavLink, Link, useLocation } from 'react-router-dom';
import {
  Home,
  Library,
  Sparkles,
  Users,
  Menu,
  Camera,
  Plus,
  BookOpen,
  ArrowUpRight,
} from 'lucide-react';
import { Brand } from './components';
import { useLibrary } from './context';
const primary = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/recommendations', label: 'Recommend', icon: Sparkles },
  { to: '/members', label: 'Family', icon: Users },
  { to: '/more', label: 'More', icon: Menu },
];
export function Sidebar() {
  const { data } = useLibrary();
  return (
    <aside className="sidebar">
      <Link to="/home" aria-label="PageRove home">
        <Brand />
      </Link>
      <p className="brand-line">Your family’s intelligent library.</p>
      <nav aria-label="Desktop navigation">
        {primary
          .filter((item) => item.to !== '/more')
          .map(({ to, label, icon: Icon }) => (
            <NavLink to={to} key={to}>
              <Icon size={21} />
              {label}
            </NavLink>
          ))}
        <div className="nav-divider" />
        <NavLink to="/scan">
          <Camera size={21} />
          Scan your books
        </NavLink>
        <NavLink to="/books/new">
          <Plus size={21} />
          Add a book
        </NavLink>
        <NavLink to="/history">
          <BookOpen size={21} />
          Reading history
        </NavLink>
      </nav>
      <div className="sidebar-story">
        <span>
          Books take
          <br />
          you places.
        </span>
        <ArrowUpRight size={24} />
        <p>Start with your own shelves.</p>
      </div>
      <div className="household-label">
        <span className="household-dot" />
        <div>
          <strong>{data.household?.name ?? 'Your household'}</strong>
          <span>Shared demo · fictional data</span>
        </div>
      </div>
    </aside>
  );
}
export function BottomNavigation() {
  const { pathname } = useLocation();
  return (
    <nav className="bottom-nav" aria-label="Mobile navigation">
      {primary.map(({ to, label, icon: Icon }) => {
        const active =
          pathname === to ||
          (to === '/library' && pathname.startsWith('/books/') && pathname !== '/books/new') ||
          (to === '/more' &&
            ['/scan', '/history', '/books/new'].some((path) => pathname.startsWith(path)));
        return (
          <Link
            to={to}
            key={to}
            className={active ? 'active' : ''}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={22} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
