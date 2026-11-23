import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';

@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  private db?: SQLiteDBConnection;
  private opening?: Promise<void>;
  private transactionDepth = 0;

  async init(): Promise<void> {
    if (this.db) return;
    this.opening ??= this.open();
    await this.opening;
  }

  private async open(): Promise<void> {
    const platform = Capacitor.getPlatform();
    if (platform === 'web') {
      const { defineCustomElements } = await import('jeep-sqlite/dist/esm/loader');
      defineCustomElements(window);
      if (!document.querySelector('jeep-sqlite')) document.body.appendChild(document.createElement('jeep-sqlite'));
      await this.sqlite.initWebStore();
    }
    const connected = await this.sqlite.isConnection('mahfuzat', false);
    this.db = connected.result
      ? await this.sqlite.retrieveConnection('mahfuzat', false)
      : await this.sqlite.createConnection('mahfuzat', false, 'no-encryption', 1, false);
    await this.db.open();
    await this.db.execute('PRAGMA foreign_keys = ON;');
    await this.migrate();
  }

  private async migrate(): Promise<void> {
    const { migrations, DATABASE_VERSION } = await import('./migrations');
    const rows = await this.query<{ user_version: number }>('PRAGMA user_version;');
    let version = rows[0]?.user_version ?? 0;
    while (version < DATABASE_VERSION) {
      const next = version + 1;
      for (const sql of migrations[next] ?? []) await this.db!.execute(sql, false);
      await this.db!.execute(`PRAGMA user_version = ${next};`, false);
      version = next;
    }
    await this.persistWeb();
  }

  async query<T>(sql: string, values: unknown[] = []): Promise<T[]> {
    await this.init();
    return (await this.db!.query(sql, values)).values ?? [];
  }

  async run(sql: string, values: unknown[] = []): Promise<number> {
    await this.init();
    const result = await this.db!.run(sql, values, false, 'all', true);
    await this.persistWeb();
    return result.changes?.changes ?? 0;
  }

  async execute(sql: string): Promise<void> {
    await this.init();
    await this.db!.execute(sql, false);
    await this.persistWeb();
  }

  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    await this.init();
    if (this.transactionDepth > 0) return operation();
    await this.db!.execute('BEGIN IMMEDIATE;', false);
    this.transactionDepth++;
    let result: T;
    try {
      result = await operation();
      await this.db!.execute('COMMIT;', false);
    } catch (error) {
      await this.db!.execute('ROLLBACK;', false);
      this.transactionDepth--;
      throw error;
    }
    this.transactionDepth--;
    await this.persistWeb();
    return result;
  }

  async getSetting<T>(key: string, fallback: T): Promise<T> {
    const rows = await this.query<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
    return rows.length ? JSON.parse(rows[0].value) as T : fallback;
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    await this.run(
      'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      [key, JSON.stringify(value)]
    );
  }

  private async persistWeb(): Promise<void> {
    if (Capacitor.getPlatform() === 'web' && this.db && this.transactionDepth === 0) {
      await this.sqlite.saveToStore('mahfuzat');
    }
  }
}
