import initSqlJs, { Database } from 'sql.js';
import path from 'node:path';
import { migrations } from '../src/app/core/database/migrations';

export class TestDatabase {
  private db!: Database;
  async init(): Promise<void> {
    const SQL = await initSqlJs({ locateFile: (file) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file) });
    this.db = new SQL.Database();
    for (const sql of migrations[1]) this.db.exec(sql);
  }
  async query<T>(sql: string, values: unknown[] = []): Promise<T[]> {
    const statement = this.db.prepare(sql);
    statement.bind(values as never);
    const rows: T[] = [];
    while (statement.step()) rows.push(statement.getAsObject() as T);
    statement.free();
    return rows;
  }
  async run(sql: string, values: unknown[] = []): Promise<number> {
    this.db.run(sql, values as never);
    return this.db.getRowsModified();
  }
  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    this.db.exec('BEGIN');
    try { const result = await operation(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  async getSetting<T>(key: string, fallback: T): Promise<T> {
    const rows = await this.query<{ value: string }>('SELECT value FROM settings WHERE key=?', [key]);
    return rows.length ? JSON.parse(rows[0].value) : fallback;
  }
  async setSetting(key: string, value: unknown): Promise<void> {
    await this.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, JSON.stringify(value)]);
  }
}
