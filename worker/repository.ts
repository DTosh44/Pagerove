import type {
  Candidate,
  Household,
  LibraryBook,
  LibraryState,
  ManualBook,
  Member,
  ReadingRecord,
} from '../src/domain/types';
import type { z } from 'zod';
import type { historyInput } from '../src/domain/validation';

export const id = () => crypto.randomUUID();
export class Repository {
  constructor(
    readonly db: D1Database,
    readonly userId: string,
  ) {}
  async household(): Promise<Household | null> {
    return this.db
      .prepare(
        'SELECT h.id,h.name FROM households h JOIN user_households u ON u.household_id=h.id WHERE u.user_id=? ORDER BY h.created_at,h.id LIMIT 1',
      )
      .bind(this.userId)
      .first<Household>();
  }
  async createHousehold(name: string, displayName: string) {
    if (await this.household()) throw new ApiError(409, 'Your account already has a household.');
    const householdId = id();
    // The initial account is a local demo identity, never a production authentication shortcut.
    await this.db.batch([
      this.db.prepare('INSERT OR IGNORE INTO users(id) VALUES (?)').bind(this.userId),
      this.db.prepare('INSERT INTO households(id,name) VALUES (?,?)').bind(householdId, name),
      this.db
        .prepare('INSERT INTO user_households(user_id,household_id) VALUES (?,?)')
        .bind(this.userId, householdId),
      this.db
        .prepare(
          "INSERT INTO household_members(id,household_id,user_id,display_name,type) VALUES (?,?,?,?,'adult')",
        )
        .bind(id(), householdId, this.userId, displayName),
    ]);
    return { id: householdId, name };
  }
  async state(household: Household | null): Promise<LibraryState> {
    if (!household) return { household, members: [], books: [], mode: 'demo' };
    const members = await this.db
      .prepare(
        'SELECT id,display_name AS displayName,type,preferences FROM household_members WHERE household_id=? ORDER BY rowid',
      )
      .bind(household.id)
      .all<Omit<Member, 'preferences'> & { preferences: string }>();
    const books = await this.db
      .prepare(
        `SELECT hb.id,b.id AS workId,b.title,b.author,b.categories,b.description,e.format,e.isbn,e.cover_url AS coverUrl,e.page_count AS pageCount,l.name AS location FROM household_books hb JOIN book_editions e ON e.id=hb.edition_id JOIN books b ON b.id=e.book_id LEFT JOIN book_locations l ON l.id=hb.location_id WHERE hb.household_id=? ORDER BY hb.created_at DESC,hb.rowid DESC`,
      )
      .bind(household.id)
      .all<Omit<LibraryBook, 'categories' | 'records'> & { categories: string }>();
    const records = await this.db
      .prepare(
        `SELECT r.member_id AS memberId,r.household_book_id AS householdBookId,r.status,r.started_date AS startedDate,r.finished_date AS finishedDate,br.rating FROM reading_records r LEFT JOIN book_ratings br ON br.member_id=r.member_id AND br.household_book_id=r.household_book_id WHERE r.household_id=?`,
      )
      .bind(household.id)
      .all<ReadingRecord>();
    return {
      household,
      mode: 'demo',
      members: members.results.map((member) => ({
        ...member,
        preferences: JSON.parse(member.preferences),
      })),
      books: books.results.map((book) => ({
        ...book,
        categories: JSON.parse(book.categories),
        records: records.results.filter((record) => record.householdBookId === book.id),
      })),
    };
  }
  async requireMember(householdId: string, memberId: string) {
    const member = await this.db
      .prepare('SELECT id FROM household_members WHERE household_id=? AND id=?')
      .bind(householdId, memberId)
      .first();
    if (!member) throw new ApiError(404, 'Reading profile not found.');
  }
  async addMember(
    householdId: string,
    input: { displayName: string; type: string; preferences: string[] },
  ) {
    const memberId = id();
    await this.db
      .prepare(
        'INSERT INTO household_members(id,household_id,display_name,type,preferences) VALUES (?,?,?,?,?)',
      )
      .bind(memberId, householdId, input.displayName, input.type, JSON.stringify(input.preferences))
      .run();
    return { id: memberId };
  }
  bookStatements(householdId: string, input: ManualBook, ownedId = id(), candidateId?: string) {
    const workId = id(),
      editionId = id();
    const guard = candidateId
      ? " WHERE EXISTS (SELECT 1 FROM recognition_candidates WHERE id=? AND household_id=? AND confirmation_state='pending')"
      : '';
    const params = candidateId ? [candidateId, householdId] : [];
    return {
      ownedId,
      statements: [
        this.db
          .prepare('INSERT INTO books(id,title,author,categories) SELECT ?,?,?,?' + guard)
          .bind(
            workId,
            input.title,
            input.author,
            JSON.stringify(input.categories ?? []),
            ...params,
          ),
        this.db
          .prepare('INSERT INTO book_editions(id,book_id,isbn,format) SELECT ?,?,?,?' + guard)
          .bind(editionId, workId, input.isbn || null, input.format, ...params),
        this.db
          .prepare('INSERT INTO household_books(id,household_id,edition_id) SELECT ?,?,?' + guard)
          .bind(ownedId, householdId, editionId, ...params),
      ],
    };
  }
  async addBook(householdId: string, input: ManualBook) {
    const { ownedId, statements } = this.bookStatements(householdId, input);
    await this.db.batch(statements);
    return { id: ownedId };
  }
  async saveHistory(householdId: string, input: z.infer<typeof historyInput>) {
    await this.requireMember(householdId, input.memberId);
    const bookIds = [...new Set(input.bookIds)];
    const owned = await this.db
      .prepare(
        `SELECT id FROM household_books WHERE household_id=? AND id IN (${bookIds.map(() => '?').join(',')})`,
      )
      .bind(householdId, ...bookIds)
      .all<{ id: string }>();
    if (owned.results.length !== bookIds.length)
      throw new ApiError(404, 'One or more books are not in your household.');
    if (input.startedDate !== undefined || input.finishedDate !== undefined) {
      const existing = await this.db
        .prepare(
          `SELECT household_book_id AS bookId,started_date AS startedDate,finished_date AS finishedDate FROM reading_records WHERE household_id=? AND member_id=? AND household_book_id IN (${bookIds.map(() => '?').join(',')})`,
        )
        .bind(householdId, input.memberId, ...bookIds)
        .all<{ bookId: string; startedDate: string | null; finishedDate: string | null }>();
      for (const bookId of bookIds) {
        const record = existing.results.find((record) => record.bookId === bookId);
        const started = input.startedDate === undefined ? record?.startedDate : input.startedDate;
        const finished =
          input.finishedDate === undefined ? record?.finishedDate : input.finishedDate;
        if (started && finished && started > finished)
          throw new ApiError(400, 'Finish date must be on or after start date.');
      }
    }
    const statements = bookIds.flatMap((bookId) => {
      const updates = [
        this.db
          .prepare(
            `INSERT INTO reading_records(id,household_id,member_id,household_book_id,status,started_date,finished_date) VALUES (?,?,?,?,?,?,?) ON CONFLICT(member_id,household_book_id) DO UPDATE SET status=excluded.status,started_date=CASE WHEN ? THEN excluded.started_date ELSE reading_records.started_date END,finished_date=CASE WHEN ? THEN excluded.finished_date ELSE reading_records.finished_date END,updated_at=CURRENT_TIMESTAMP`,
          )
          .bind(
            id(),
            householdId,
            input.memberId,
            bookId,
            input.status,
            input.startedDate ?? null,
            input.finishedDate ?? null,
            input.startedDate !== undefined ? 1 : 0,
            input.finishedDate !== undefined ? 1 : 0,
          ),
      ];
      if (input.rating === null)
        updates.push(
          this.db
            .prepare(
              'DELETE FROM book_ratings WHERE household_id=? AND member_id=? AND household_book_id=?',
            )
            .bind(householdId, input.memberId, bookId),
        );
      else if (input.rating !== undefined)
        updates.push(
          this.db
            .prepare(
              'INSERT INTO book_ratings(id,household_id,member_id,household_book_id,rating) VALUES (?,?,?,?,?) ON CONFLICT(member_id,household_book_id) DO UPDATE SET rating=excluded.rating',
            )
            .bind(id(), householdId, input.memberId, bookId, input.rating),
        );
      return updates;
    });
    await this.db.batch(statements);
  }
  async scan(householdId: string, scanId: string) {
    const session = await this.db
      .prepare('SELECT id FROM scan_sessions WHERE household_id=? AND id=?')
      .bind(householdId, scanId)
      .first<{ id: string }>();
    if (!session) throw new ApiError(404, 'Scan not found.');
    const candidates = await this.db
      .prepare(
        'SELECT id,probable_title AS probableTitle,probable_author AS probableAuthor,probable_isbn AS probableIsbn,confidence,source_image_id AS sourceImageId,confirmation_state AS confirmationState,household_book_id AS householdBookId FROM recognition_candidates WHERE household_id=? AND scan_session_id=? ORDER BY rowid',
      )
      .bind(householdId, scanId)
      .all<Candidate>();
    return { ...session, candidates: candidates.results };
  }
  async confirmCandidate(
    householdId: string,
    scanId: string,
    candidateId: string,
    action: 'accept' | 'reject',
    title?: string,
    author?: string,
  ) {
    const scan = await this.scan(householdId, scanId);
    const candidate = scan.candidates.find((item) => item.id === candidateId);
    if (!candidate) throw new ApiError(404, 'Candidate not found.');
    if (candidate.confirmationState !== 'pending') return scan; // Idempotent repeated clicks/retries.
    if (action === 'reject')
      await this.db
        .prepare(
          "UPDATE recognition_candidates SET confirmation_state='rejected' WHERE id=? AND household_id=? AND confirmation_state='pending'",
        )
        .bind(candidateId, householdId)
        .run();
    else {
      const book = {
        title: title ?? candidate.probableTitle,
        author: author ?? candidate.probableAuthor,
        isbn: candidate.probableIsbn ?? undefined,
        format: 'unknown' as const,
      };
      const { ownedId, statements } = this.bookStatements(householdId, book, id(), candidateId);
      // Guard every insert and claim atomically: concurrent retries become no-ops.
      await this.db.batch([
        ...statements,
        this.db
          .prepare(
            "UPDATE recognition_candidates SET household_book_id=?,confirmation_state='accepted',probable_title=?,probable_author=? WHERE id=? AND household_id=? AND confirmation_state='pending'",
          )
          .bind(ownedId, book.title, book.author, candidateId, householdId),
      ]);
    }
    await this.db
      .prepare(
        "UPDATE scan_sessions SET status='completed' WHERE id=? AND household_id=? AND NOT EXISTS (SELECT 1 FROM recognition_candidates WHERE scan_session_id=? AND confirmation_state='pending')",
      )
      .bind(scanId, householdId, scanId)
      .run();
    return this.scan(householdId, scanId);
  }
}
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
