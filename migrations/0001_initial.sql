-- Household-scoped relationships use composite foreign keys to prevent cross-household references.
-- Works, editions and owned copies stay distinct; histories/ratings belong to profiles.
PRAGMA foreign_keys = ON;
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_households (
  user_id TEXT NOT NULL REFERENCES users(id),
  household_id TEXT NOT NULL REFERENCES households(id),
  role TEXT NOT NULL DEFAULT 'owner' CHECK(role IN ('owner','adult')),
  PRIMARY KEY(user_id, household_id)
);

CREATE TABLE household_members (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  user_id TEXT REFERENCES users(id),
  display_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('adult','child')),
  preferences TEXT NOT NULL DEFAULT '[]',
  UNIQUE(household_id,id),
  CHECK(type = 'adult' OR user_id IS NULL)
);

CREATE TABLE books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  categories TEXT NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE book_editions (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id),
  isbn TEXT,
  format TEXT NOT NULL CHECK(format IN ('hardback','paperback','ebook','audiobook','unknown')),
  cover_url TEXT,
  page_count INTEGER CHECK(page_count > 0),
  UNIQUE(book_id,id)
);

CREATE INDEX editions_isbn ON book_editions(isbn);
CREATE TABLE book_locations (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  name TEXT NOT NULL,
  UNIQUE(household_id,id)
);

CREATE TABLE household_books (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  edition_id TEXT NOT NULL REFERENCES book_editions(id),
  location_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'household' CHECK(visibility IN ('private','household','friends')),
  lendable INTEGER NOT NULL DEFAULT 0 CHECK(lendable IN (0,1)),
  exchangeable INTEGER NOT NULL DEFAULT 0 CHECK(exchangeable IN (0,1)),
  current_holder TEXT,
  acquired_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(household_id,id),
  FOREIGN KEY(household_id,location_id) REFERENCES book_locations(household_id,id)
);

CREATE TABLE reading_records (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  household_book_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('unread','reading','read','want_to_read')),
  started_date TEXT,
  finished_date TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(member_id,household_book_id),
  FOREIGN KEY(household_id,member_id) REFERENCES household_members(household_id,id),
  FOREIGN KEY(household_id,household_book_id) REFERENCES household_books(household_id,id),
  CHECK(finished_date IS NULL OR started_date IS NULL OR finished_date >= started_date)
);

CREATE TABLE book_ratings (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  household_book_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  UNIQUE(member_id,household_book_id),
  FOREIGN KEY(household_id,member_id) REFERENCES household_members(household_id,id),
  FOREIGN KEY(household_id,household_book_id) REFERENCES household_books(household_id,id)
);

CREATE TABLE scan_sessions (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  status TEXT NOT NULL CHECK(status IN ('review','completed')),
  provider TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(household_id,id)
);

CREATE TABLE scan_images (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  scan_session_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  storage_key TEXT,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes > 0),
  UNIQUE(household_id,id),
  FOREIGN KEY(household_id,scan_session_id) REFERENCES scan_sessions(household_id,id)
);

CREATE TABLE recognition_candidates (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  scan_session_id TEXT NOT NULL,
  source_image_id TEXT NOT NULL,
  probable_title TEXT NOT NULL,
  probable_author TEXT NOT NULL,
  probable_isbn TEXT,
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  confirmation_state TEXT NOT NULL DEFAULT 'pending' CHECK(confirmation_state IN ('pending','accepted','rejected')),
  household_book_id TEXT,
  FOREIGN KEY(household_id,scan_session_id) REFERENCES scan_sessions(household_id,id),
  FOREIGN KEY(household_id,source_image_id) REFERENCES scan_images(household_id,id),
  FOREIGN KEY(household_id,household_book_id) REFERENCES household_books(household_id,id)
);

CREATE TABLE recommendation_sessions (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  request TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(household_id,id),
  FOREIGN KEY(household_id,member_id) REFERENCES household_members(household_id,id)
);

CREATE TABLE recommendations (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  household_book_id TEXT NOT NULL,
  explanation TEXT NOT NULL,
  rank INTEGER NOT NULL CHECK(rank BETWEEN 1 AND 3),
  FOREIGN KEY(household_id,session_id) REFERENCES recommendation_sessions(household_id,id),
  FOREIGN KEY(household_id,household_book_id) REFERENCES household_books(household_id,id),
  UNIQUE(session_id,rank)
);

CREATE TABLE reading_plans (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  household_book_id TEXT NOT NULL,
  target_date TEXT,
  state TEXT NOT NULL DEFAULT 'planned' CHECK(state IN ('planned','completed','cancelled')),
  FOREIGN KEY(household_id,member_id) REFERENCES household_members(household_id,id),
  FOREIGN KEY(household_id,household_book_id) REFERENCES household_books(household_id,id)
);

CREATE INDEX owned_books_by_household ON household_books(household_id);
CREATE INDEX members_by_household ON household_members(household_id);
CREATE INDEX history_by_household_member ON reading_records(household_id,member_id,status);
CREATE INDEX scans_by_household ON scan_sessions(household_id);
