import type {
  Candidate,
  Household,
  LibraryBook,
  LibraryState,
  ManualBook,
  Member,
  ReadingRecord,
  Scan,
} from '../src/domain/types';
import type { z } from 'zod';
import type { candidateInput, historyInput } from '../src/domain/validation';

import type { BookMetadata } from '../src/domain/ingestion';
import { normalizeAuthor, normalizeIsbn, normalizeText, sameWork } from './ingestion/matching';

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
        `SELECT hb.id,b.id AS workId,b.title,b.author,b.categories,b.description,e.format,e.isbn,e.cover_url AS coverUrl,e.page_count AS pageCount,e.metadata_json AS editionMetadata,l.name AS location FROM household_books hb JOIN book_editions e ON e.id=hb.edition_id JOIN books b ON b.id=e.book_id LEFT JOIN book_locations l ON l.id=hb.location_id WHERE hb.household_id=? ORDER BY hb.created_at DESC,hb.rowid DESC`,
      )
      .bind(household.id)
      .all<
        Omit<LibraryBook, 'categories' | 'records' | 'metadata'> & {
          categories: string;
          editionMetadata: string;
        }
      >();
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
      books: books.results.map(({ editionMetadata, ...book }) => ({
        ...book,
        metadata: JSON.parse(editionMetadata).id ? JSON.parse(editionMetadata) : null,
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
  async bookStatements(
    householdId: string,
    input: ManualBook,
    metadata?: BookMetadata | null,
    candidateId?: string,
  ) {
    const isbn = normalizeIsbn(input.isbn);
    if (input.isbn && !isbn) throw new ApiError(400, 'Enter a valid ISBN-10 or ISBN-13.');
    const editions = await this.db
      .prepare(
        'SELECT e.id,e.book_id AS workId,e.isbn,e.format,e.metadata_json AS metadata FROM book_editions e',
      )
      .all<{ id: string; workId: string; isbn: string | null; format: string; metadata: string }>();
    const exact = isbn
      ? editions.results.find((edition) => normalizeIsbn(edition.isbn) === isbn)
      : undefined;
    const works = await this.db
      .prepare('SELECT id,title,author FROM books')
      .all<{ id: string; title: string; author: string }>();
    const work = exact
      ? works.results.find((work) => work.id === exact.workId)
      : works.results.find((work) => sameWork(work, input));
    const hash = async (value: string) =>
      [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    const workKey = `${normalizeText(input.title)}|${normalizeAuthor(input.author)}`;
    const workId = work?.id ?? `work-${await hash(workKey)}`;
    const existing =
      exact ??
      editions.results.find((edition) => {
        if (
          edition.workId !== workId ||
          (isbn && normalizeIsbn(edition.isbn) && normalizeIsbn(edition.isbn) !== isbn)
        )
          return false;
        const formatAgrees =
          edition.format === input.format ||
          edition.format === 'unknown' ||
          (input.format === 'unknown' && !['ebook', 'audiobook'].includes(edition.format));
        if (!formatAgrees) return false;
        const saved = JSON.parse(edition.metadata) as Partial<BookMetadata>;
        return (
          (!metadata?.year || !saved.year || saved.year === metadata.year) &&
          (!metadata?.language || !saved.language || saved.language === metadata.language) &&
          (!metadata?.publisher || !saved.publisher || saved.publisher === metadata.publisher)
        );
      });
    const editionKey = isbn
      ? `isbn:${isbn}`
      : `${workId}|${input.format}|${metadata?.year ?? ''}|${metadata?.language ?? ''}|${metadata?.publisher ?? ''}`;
    const editionId = existing?.id ?? `edition-${await hash(editionKey)}`;
    const ownedId = id();
    const guard = candidateId
      ? " AND EXISTS (SELECT 1 FROM recognition_candidates WHERE id=? AND household_id=? AND confirmation_state='pending')"
      : '';
    const params = candidateId ? [candidateId, householdId] : [];
    const statements = [
      this.db
        .prepare(
          'INSERT OR IGNORE INTO books(id,title,author,categories,description,identity_key) SELECT ?,?,?,?,?,? WHERE 1=1' +
            guard,
        )
        .bind(
          workId,
          input.title,
          input.author,
          JSON.stringify(
            input.categories?.length ? input.categories : (metadata?.categories ?? []),
          ),
          metadata?.description ?? '',
          work ? null : workKey,
          ...params,
        ),
      this.db
        .prepare(
          'INSERT OR IGNORE INTO book_editions(id,book_id,isbn,format,cover_url,page_count,identity_key,metadata_json) SELECT ?,?,?,?,?,?,?,? WHERE 1=1' +
            guard,
        )
        .bind(
          editionId,
          workId,
          isbn,
          input.format,
          metadata?.coverUrl ?? null,
          metadata?.pageCount ?? null,
          existing ? null : editionKey,
          JSON.stringify(metadata ?? {}),
          ...params,
        ),
      this.db
        .prepare(
          'INSERT INTO household_books(id,household_id,edition_id) SELECT ?,?,? WHERE (?=1 OR NOT EXISTS (SELECT 1 FROM household_books WHERE household_id=? AND edition_id=?))' +
            guard,
        )
        .bind(
          ownedId,
          householdId,
          editionId,
          input.additionalCopy ? 1 : 0,
          householdId,
          editionId,
          ...params,
        ),
    ];
    return { ownedId, editionId, statements };
  }
  async addBook(householdId: string, input: ManualBook, metadata?: BookMetadata | null) {
    const { ownedId, editionId, statements } = await this.bookStatements(
      householdId,
      input,
      metadata,
    );
    await this.db.batch(statements);
    const saved = await this.db
      .prepare(
        'SELECT id FROM household_books WHERE household_id=? AND edition_id=? ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END,rowid LIMIT 1',
      )
      .bind(householdId, editionId, ownedId)
      .first<{ id: string }>();
    return { id: saved!.id, reused: saved!.id !== ownedId };
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
  async scan(householdId: string, scanId: string): Promise<Scan> {
    const session = await this.db
      .prepare(
        'SELECT id,processing_state AS status,warnings_json AS warnings,processing_started_at AS startedAt FROM scan_sessions WHERE household_id=? AND id=?',
      )
      .bind(householdId, scanId)
      .first<{ id: string; status: string; warnings: string; startedAt: string | null }>();
    if (!session) throw new ApiError(404, 'Scan not found.');
    if (
      session.status === 'processing' &&
      session.startedAt &&
      Date.now() - Date.parse(session.startedAt.replace(' ', 'T') + 'Z') > 300000
    ) {
      session.status = 'failed';
      session.warnings = JSON.stringify([
        'Processing was interrupted. Re-upload unfinished photos to resume.',
      ]);
      await this.db
        .prepare(
          "UPDATE scan_sessions SET processing_state='failed',warnings_json=? WHERE id=? AND household_id=? AND processing_state='processing'",
        )
        .bind(session.warnings, scanId, householdId)
        .run();
    }
    const candidates = await this.db
      .prepare(
        'SELECT id,probable_title AS probableTitle,probable_author AS probableAuthor,probable_isbn AS probableIsbn,confidence,raw_confidence AS rawConfidence,source_image_id AS sourceImageId,confirmation_state AS confirmationState,household_book_id AS householdBookId,enrichment_json AS enrichment FROM recognition_candidates WHERE household_id=? AND scan_session_id=? ORDER BY rowid',
      )
      .bind(householdId, scanId)
      .all<
        Omit<Candidate, 'band' | 'metadata' | 'alternatives' | 'sourceImageIds'> & {
          enrichment: string;
        }
      >();
    const images = await this.db
      .prepare(
        'SELECT id,processing_state AS state,error FROM scan_images WHERE household_id=? AND scan_session_id=? ORDER BY rowid',
      )
      .bind(householdId, scanId)
      .all<Scan['images'][number]>();
    return {
      ...session,
      warnings: JSON.parse(session.warnings),
      images: images.results,
      candidates: candidates.results.map(({ enrichment, ...candidate }) => ({
        band:
          candidate.confidence >= 0.9 ? 'HIGH' : candidate.confidence >= 0.65 ? 'MEDIUM' : 'LOW',
        metadata: null,
        alternatives: [],
        sourceImageIds: [candidate.sourceImageId],
        ...candidate,
        ...JSON.parse(enrichment),
      })),
    };
  }
  async confirmCandidate(
    householdId: string,
    scanId: string,
    candidateId: string,
    action: 'accept' | 'reject',
    title?: string,
    author?: string,
    options: Partial<z.infer<typeof candidateInput>> = {},
  ) {
    const scan = await this.scan(householdId, scanId);
    const candidate = scan.candidates.find((item) => item.id === candidateId);
    if (!candidate) throw new ApiError(404, 'Candidate not found.');
    if (candidate.confirmationState !== 'pending') return scan;
    if (action === 'reject')
      await this.db
        .prepare(
          "UPDATE recognition_candidates SET confirmation_state='rejected' WHERE id=? AND household_id=? AND confirmation_state='pending'",
        )
        .bind(candidateId, householdId)
        .run();
    else {
      let metadata = options.metadataId
        ? candidate.alternatives.find((match) => match.metadata.id === options.metadataId)?.metadata
        : candidate.metadata;
      if (options.metadataId && !metadata)
        throw new ApiError(400, 'Choose a match from this candidate.');
      if (
        metadata &&
        options.isbn &&
        normalizeIsbn(options.isbn) !== normalizeIsbn(metadata.isbn13 ?? metadata.isbn10)
      )
        metadata = null;
      // Edited text must not retain another book's ISBN, cover or description.
      if (
        !options.metadataId &&
        ((title && title !== (metadata?.title ?? candidate.probableTitle)) ||
          (author && author !== (metadata?.authors.join(', ') ?? candidate.probableAuthor)))
      )
        metadata = null;
      const book: ManualBook = {
        title: options.metadataId
          ? metadata!.title
          : (title ?? metadata?.title ?? candidate.probableTitle),
        author: options.metadataId
          ? metadata!.authors.join(', ')
          : (author ?? metadata?.authors.join(', ') ?? candidate.probableAuthor),
        isbn:
          options.isbn ??
          metadata?.isbn13 ??
          metadata?.isbn10 ??
          (title || author ? undefined : (candidate.probableIsbn ?? undefined)),
        format: options.format ?? metadata?.format ?? 'unknown',
        additionalCopy: options.additionalCopy,
      };
      if (!book.title.trim() || !book.author.trim())
        throw new ApiError(400, 'Enter a title and author before accepting.');
      const { ownedId, editionId, statements } = await this.bookStatements(
        householdId,
        book,
        metadata,
        candidateId,
      );
      await this.db.batch([
        ...statements,
        this.db
          .prepare(
            "UPDATE recognition_candidates SET household_book_id=(SELECT id FROM household_books WHERE household_id=? AND edition_id=? ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END,rowid LIMIT 1),confirmation_state='accepted',probable_title=?,probable_author=? WHERE id=? AND household_id=? AND confirmation_state='pending'",
          )
          .bind(householdId, editionId, ownedId, book.title, book.author, candidateId, householdId),
      ]);
    }
    await this.db
      .prepare(
        "UPDATE scan_sessions SET status='completed',processing_state='completed' WHERE id=? AND household_id=? AND processing_state!='processing' AND NOT EXISTS (SELECT 1 FROM recognition_candidates WHERE scan_session_id=? AND confirmation_state='pending')",
      )
      .bind(scanId, householdId, scanId)
      .run();
    return this.scan(householdId, scanId);
  }
  async bulkAccept(householdId: string, scanId: string) {
    const scan = await this.scan(householdId, scanId);
    const failures: string[] = [];
    for (const candidate of scan.candidates.filter(
      (item) => item.band === 'HIGH' && item.confirmationState === 'pending',
    )) {
      try {
        await this.confirmCandidate(householdId, scanId, candidate.id, 'accept');
      } catch {
        failures.push(candidate.id);
      }
    }
    return { ...(await this.scan(householdId, scanId)), failures };
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
