import { Link } from 'react-router-dom';
import { ArrowRight, Camera, Sparkles, Plus } from 'lucide-react';
import { useLibrary } from '../context';
import { readingStatus } from '../../domain/library';
import { Avatar, BookCard, BookRow, BookStack, SectionHeading } from '../components';
export function HomePage() {
  const { data, memberId } = useLibrary();
  const member = data.members.find((person) => person.id === memberId);
  const reading = data.books
    .filter((book) => readingStatus(book, memberId) === 'reading')
    .slice(0, 3);
  const activity = data.members
    .map((person) => ({
      person,
      book: data.books.find((book) => readingStatus(book, person.id) === 'read'),
    }))
    .filter((item) => item.book);
  return (
    <>
      <section className="home-hero">
        <div>
          <p className="eyebrow">A little discovery, every day</p>
          <h1>
            Good books.
            <br />
            Closer than you think.
          </h1>
          <p>Your next adventure might already be on the shelf.</p>
          <Link to="/recommendations" className="button primary">
            Find your next read <ArrowRight size={19} />
          </Link>
        </div>
        <BookStack />
      </section>
      <SectionHeading
        title={`${member?.displayName ?? 'Your'}’s next chapter`}
        link="/history"
        label="Reading history"
      />
      <div className="home-middle">
        <section className="panel continue-reading">
          <h3>Continue reading</h3>
          {reading.length ? (
            reading.map((book) => (
              <BookRow key={book.id} book={book} detail="A story in progress" />
            ))
          ) : (
            <div className="empty compact">
              <p>A new chapter is waiting.</p>
              <Link to="/library">Choose a book from your library →</Link>
            </div>
          )}
        </section>
        <Link to="/recommendations" className="discovery-card">
          <Sparkles size={28} />
          <span className="eyebrow">Made for your mood</span>
          <h2>
            A page-turner?
            <br />A little escape?
          </h2>
          <p>
            Let’s find something you’ll love,
            <br />
            from the books you already own.
          </p>
          <span className="text-link">
            What should I read next? <ArrowRight size={18} />
          </span>
        </Link>
      </div>
      <SectionHeading title="Recently added" link="/library" label="Our Library" />
      <div className="book-grid home-books">
        {data.books.slice(0, 5).map((book) => (
          <BookCard key={book.id} book={book} />
        ))}
      </div>
      {!data.books.length && (
        <Link className="button primary" to="/books/new">
          <Plus size={18} />
          Add your first book
        </Link>
      )}
      <div className="home-bottom">
        <section className="household-activity">
          <SectionHeading title="Stories we’ve enjoyed" link="/members" label="Our People" />
          {activity.map(({ person, book }, index) => (
            <div className="activity-row" key={person.id}>
              <Avatar member={person} index={index} small />
              <p>
                <strong>{person.displayName}</strong> has read{' '}
                <Link to={`/books/${book!.id}`}>{book!.title}</Link>
              </p>
            </div>
          ))}
          {!activity.length && <p className="muted">Shared stories start with your first book.</p>}
        </section>
        <Link to="/scan" className="scan-shortcut">
          <Camera size={27} />
          <h2>A whole shelf to discover?</h2>
          <p>Bring your books into PageRove.</p>
          <span className="text-link">
            Scan your books <ArrowRight size={18} />
          </span>
        </Link>
      </div>
    </>
  );
}
