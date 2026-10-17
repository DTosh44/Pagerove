import { writeFileSync } from 'node:fs';
// Fictional reading histories; real titles are for realistic UI review.
const books: [string, string, string[], number, string][] = [
  [
    'The Thursday Murder Club',
    'Richard Osman',
    ['Mystery', 'Gripping', 'Funny'],
    382,
    'Four friends investigate a mystery in their retirement village.',
  ],
  [
    'The Midnight Library',
    'Matt Haig',
    ['Fiction', 'Reflective'],
    304,
    'A library of possible lives and second chances.',
  ],
  [
    'A Man Called Ove',
    'Fredrik Backman',
    ['Fiction', 'Funny'],
    337,
    'Unexpected friendship changes a quiet neighbourhood.',
  ],
  [
    'The Hobbit',
    'J. R. R. Tolkien',
    ['Fantasy', 'Adventure'],
    310,
    'Bilbo leaves home for an unexpected adventure.',
  ],
  [
    'Matilda',
    'Roald Dahl',
    ['Children', 'Funny', 'Fantasy'],
    240,
    'A book-loving girl discovers her extraordinary talents.',
  ],
  [
    'The Wild Robot',
    'Peter Brown',
    ['Children', 'Adventure'],
    288,
    'A robot finds a home on a wild island.',
  ],
  [
    'The Boy, the Mole, the Fox and the Horse',
    'Charlie Mackesy',
    ['Illustrated', 'Short'],
    128,
    'A gentle illustrated journey about friendship.',
  ],
  [
    'Piranesi',
    'Susanna Clarke',
    ['Fantasy', 'Mystery', 'Short'],
    245,
    'A strange house filled with tides and secrets.',
  ],
  [
    'Sapiens',
    'Yuval Noah Harari',
    ['Nonfiction', 'History', 'Learn'],
    443,
    'An exploration of human history.',
  ],
  [
    'A Brief History of Time',
    'Stephen Hawking',
    ['Science', 'Learn'],
    212,
    'An introduction to the universe and its mysteries.',
  ],
  [
    'Little Women',
    'Louisa May Alcott',
    ['Classics', 'Family'],
    449,
    'Four sisters find their paths in a changing world.',
  ],
  [
    'The Gruffalo',
    'Julia Donaldson',
    ['Children', 'Funny', 'Short'],
    32,
    'A clever mouse takes a walk in the woods.',
  ],
  [
    'Charlotte’s Web',
    'E. B. White',
    ['Children', 'Classics', 'Short'],
    192,
    'A story of friendship on a farm.',
  ],
  [
    'The House in the Cerulean Sea',
    'TJ Klune',
    ['Fantasy', 'Feel-good'],
    400,
    'An unexpected family on a magical island.',
  ],
  [
    'Educated',
    'Tara Westover',
    ['Memoir', 'Learn'],
    334,
    'A memoir of learning and finding an independent life.',
  ],
  [
    'Project Hail Mary',
    'Andy Weir',
    ['Science fiction', 'Gripping'],
    496,
    'A lone astronaut faces a problem on a cosmic scale.',
  ],
  [
    'The Secret Garden',
    'Frances Hodgson Burnett',
    ['Children', 'Classics'],
    331,
    'An overlooked garden transforms three children’s lives.',
  ],
  [
    'The Little Prince',
    'Antoine de Saint-Exupéry',
    ['Classics', 'Short'],
    96,
    'A traveller considers what matters most.',
  ],
  [
    'The Colour of Magic',
    'Terry Pratchett',
    ['Fantasy', 'Funny'],
    288,
    'An unlikely wizard explores the Discworld.',
  ],
  [
    'Harry Potter and the Philosopher’s Stone',
    'J. K. Rowling',
    ['Children', 'Fantasy', 'Adventure'],
    223,
    'A young wizard discovers a new world.',
  ],
  [
    'The Curious Incident of the Dog in the Night-Time',
    'Mark Haddon',
    ['Fiction', 'Mystery'],
    226,
    'A young narrator investigates a neighbourhood mystery.',
  ],
  [
    'A Walk in the Woods',
    'Bill Bryson',
    ['Travel', 'Funny', 'Nonfiction'],
    350,
    'An entertaining journey along the Appalachian Trail.',
  ],
  [
    'The Very Hungry Caterpillar',
    'Eric Carle',
    ['Children', 'Short'],
    26,
    'A small caterpillar has a very big appetite.',
  ],
  [
    'Anne of Green Gables',
    'L. M. Montgomery',
    ['Children', 'Classics'],
    320,
    'An imaginative girl finds a home on Prince Edward Island.',
  ],
];
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
const sql = [
  '-- Demo fixtures only. Idempotent; never run against a real household.',
  'PRAGMA foreign_keys=ON;',
  "INSERT OR IGNORE INTO users(id,email) VALUES ('user-demo','demo@example.invalid');",
  "INSERT OR IGNORE INTO households(id,name) VALUES ('household-demo','The Willow household');",
  "INSERT OR IGNORE INTO user_households(user_id,household_id) VALUES ('user-demo','household-demo');",
  "INSERT OR IGNORE INTO book_locations(id,household_id,name) VALUES ('location-demo','household-demo','Living room bookshelf');",
];
const members = [
  ['alex', 'Alex', 'adult', ['Mystery', 'Science fiction']],
  ['sam', 'Sam', 'adult', ['Fiction', 'Funny']],
  ['ella', 'Ella', 'child', ['Fantasy', 'Adventure']],
  ['leo', 'Leo', 'child', ['Children', 'Funny']],
] as const;
for (const [key, name, type, preferences] of members)
  sql.push(
    `INSERT OR IGNORE INTO household_members(id,household_id,display_name,type,preferences) VALUES (${quote(key)},'household-demo',${quote(name)},${quote(type)},${quote(JSON.stringify(preferences))});`,
  );
books.forEach(([title, author, categories, pages, description], i) => {
  const n = i + 1;
  sql.push(
    `INSERT OR IGNORE INTO books(id,title,author,categories,description) VALUES ('work-${n}',${quote(title)},${quote(author)},${quote(JSON.stringify(categories))},${quote(description)});`,
  );
  sql.push(
    `INSERT OR IGNORE INTO book_editions(id,book_id,format,page_count) VALUES ('edition-${n}','work-${n}',${quote(['paperback', 'hardback', 'ebook', 'audiobook'][i % 4])},${pages});`,
  );
  sql.push(
    `INSERT OR IGNORE INTO household_books(id,household_id,edition_id,location_id) VALUES ('copy-${n}','household-demo','edition-${n}','location-demo');`,
  );
  members.forEach(([key], m) => {
    const status =
      (i + m * 3) % 7 === 0
        ? 'reading'
        : (i + m) % 5 === 0
          ? 'want_to_read'
          : (i + m * 2) % 3 === 0
            ? 'read'
            : 'unread';
    const started = ['read', 'reading'].includes(status) ? "'2026-09-01'" : 'NULL';
    const finished = status === 'read' ? "'2026-09-20'" : 'NULL';
    sql.push(
      `INSERT OR IGNORE INTO reading_records(id,household_id,member_id,household_book_id,status,started_date,finished_date) VALUES ('record-${key}-${n}','household-demo','${key}','copy-${n}','${status}',${started},${finished});`,
    );
    if (status === 'read')
      sql.push(
        `INSERT OR IGNORE INTO book_ratings(id,household_id,member_id,household_book_id,rating) VALUES ('rating-${key}-${n}','household-demo','${key}','copy-${n}',${4 + (i % 2)});`,
      );
  });
});
writeFileSync('db/seed.sql', sql.join('\n') + '\n');
