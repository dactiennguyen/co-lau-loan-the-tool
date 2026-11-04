// An in-memory D1 for the tests, on node:sqlite (D1 is SQLite too): the migrations of ../migrations applied, and the
// part of the D1 API that Drizzle's D1 driver uses (prepare, bind, first, all, raw, run, batch).
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

const MIGRATIONS = new URL('../migrations/', import.meta.url);

class Statement {
  private readonly db: DatabaseSync;
  private readonly sql: string;
  private readonly args: SQLInputValue[];
  constructor(db: DatabaseSync, sql: string, args: SQLInputValue[] = []) {
    this.db = db;
    this.sql = sql;
    this.args = args;
  }
  bind(...args: SQLInputValue[]) {
    return new Statement(this.db, this.sql, args);
  }
  async first<T>(column?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.args) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (column ? row[column] : { ...row }) as T;
  }
  async all<T>() {
    const results = this.db.prepare(this.sql).all(...this.args).map((r) => ({ ...r }) as T);
    return { results, success: true, meta: {} };
  }
  /** The rows as arrays of their values, in column order: what Drizzle reads selects and RETURNING with. */
  async raw() {
    return this.db.prepare(this.sql).all(...this.args).map((r) => Object.values(r));
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.args);
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  /** What a batch gives for it: the rows it returns (none for a plain write) and its meta. */
  async result() {
    if (!/\breturning\b|^\s*select\b/i.test(this.sql)) return { results: [], ...(await this.run()) };
    const before = this.db.prepare('SELECT total_changes() AS n').get() as { n: number };
    const results = this.db.prepare(this.sql).all(...this.args).map((r) => ({ ...r }));
    const after = this.db.prepare('SELECT total_changes() AS n').get() as { n: number };
    return { results, success: true, meta: { changes: Number(after.n) - Number(before.n) } };
  }
}

export function d1(): D1Database {
  const db = new DatabaseSync(':memory:');
  for (const file of readdirSync(MIGRATIONS).sort()) db.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'));
  const fake = {
    prepare: (sql: string) => new Statement(db, sql),
    // As D1: all or none, and each result with its rows (RETURNING, SELECT) as well as its meta.
    async batch(statements: Statement[]) {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of statements) out.push(await s.result());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return fake as unknown as D1Database;
}
