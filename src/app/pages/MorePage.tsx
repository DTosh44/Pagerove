import { Link } from 'react-router-dom';
import { Camera, BookOpen, Plus, ArrowRight } from 'lucide-react';
import { PageHeading } from '../components';
export function MorePage() {
  return (
    <>
      <PageHeading
        title="A little further"
        description="More ways to make the most of your shelves."
      />
      <div className="more-links">
        {[
          {
            to: '/scan',
            icon: Camera,
            title: 'Scan your books',
            description: 'From your bookshelf to your library.',
          },
          {
            to: '/books/new',
            icon: Plus,
            title: 'Add a book',
            description: 'Make room for another story.',
          },
          {
            to: '/history',
            icon: BookOpen,
            title: 'Reading history',
            description: 'Catch up on the books you’ve enjoyed.',
          },
        ].map(({ to, icon: Icon, title, description }) => (
          <Link className="panel more-link" key={to} to={to}>
            <span className="round-icon">
              <Icon size={25} />
            </span>
            <div>
              <h2>{title}</h2>
              <p>{description}</p>
            </div>
            <ArrowRight size={21} />
          </Link>
        ))}
      </div>
      <Link className="welcome-link" to="/welcome">
        Meet PageRove →
      </Link>
      <div className="quote-card">
        <p>
          Same books. New stories.
          <br />
          Further together.
        </p>
        <span>YOUR FAMILY’S INTELLIGENT LIBRARY.</span>
      </div>
    </>
  );
}
