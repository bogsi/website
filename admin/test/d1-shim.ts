// Minimal D1Database stand-in backed by better-sqlite3, for tests only.
// Covers what the app uses: prepare/bind/all/first/run and batch.
import Database from "better-sqlite3";
import { readdirSync, readFileSync } from "node:fs";

type Row = Record<string, unknown>;

class Stmt {
  constructor(private db: Database.Database, readonly sql: string, readonly args: unknown[] = []) {}
  bind(...args: unknown[]) {
    return new Stmt(this.db, this.sql, args);
  }
  private exec() {
    const s = this.db.prepare(this.sql);
    // D1 allows ?1 numbered params; better-sqlite3 wants an object keyed by number.
    const numbered = /\?\d/.test(this.sql);
    const params = numbered ? Object.fromEntries(this.args.map((a, i) => [i + 1, a])) : this.args;
    return { s, params };
  }
  async all<T = Row>() {
    const { s, params } = this.exec();
    if (!s.reader) {
      const info = numbered(params) ? s.run(params) : s.run(...(params as unknown[]));
      return { results: [] as T[], success: true, meta: { changes: info.changes } };
    }
    const results = (numbered(params) ? s.all(params) : s.all(...(params as unknown[]))) as T[];
    return { results, success: true, meta: {} };
  }
  async first<T = Row>() {
    const { results } = await this.all<T>();
    return results[0] ?? null;
  }
  async run() {
    return this.all();
  }
}
const numbered = (p: unknown) => !Array.isArray(p);

export function createD1(): D1Database & { raw: Database.Database } {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  // Apply every migration in order, as wrangler d1 migrations apply does.
  const dir = new URL("../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    db.exec(readFileSync(new URL(file, dir), "utf8"));
  }
  const d1 = {
    raw: db,
    prepare: (sql: string) => new Stmt(db, sql),
    async batch(stmts: Stmt[]) {
      const out: unknown[] = [];
      db.exec("BEGIN");
      try {
        for (const s of stmts) out.push(await s.all());
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return out;
    },
  };
  return d1 as unknown as D1Database & { raw: Database.Database };
}
