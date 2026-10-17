import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
// Run the exact migrations/SQL against SQLite, with a small D1-compatible test adapter.
export function database(seed = true) {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('migrations')
    .filter((file) => file.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  if (seed) sqlite.exec(readFileSync('db/seed.sql', 'utf8'));
  function prepare(sql: string) {
    const params: (string | number | null)[] = [];
    const execute = () => {
      const result = sqlite.prepare(sql).run(...params);
      return { success: true, results: [], meta: { changes: Number(result.changes) } };
    };
    return {
      bind(...values: (string | number | null)[]) {
        params.push(...values);
        return this;
      },
      async first() {
        return sqlite.prepare(sql).get(...params) ?? null;
      },
      async all() {
        return { success: true, results: sqlite.prepare(sql).all(...params) };
      },
      async run() {
        return execute();
      },
      execute,
    };
  }
  const db = {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map((statement) => statement.execute());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as D1Database;
  return { db, sqlite };
}
