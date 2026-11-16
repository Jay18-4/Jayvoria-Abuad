import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export type AppDatabase = DatabaseSync;

export function createDatabase(dbPath?: string): DatabaseSync {
  const targetPath = dbPath || process.env.DB_PATH || './data/savoria.db';
  if (targetPath !== ':memory:') {
    const dir = path.dirname(path.resolve(targetPath));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  const db = new DatabaseSync(targetPath);
  db.exec('PRAGMA foreign_keys = ON;');
  if (targetPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }
  return db;
}

let defaultDb: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!defaultDb) {
    defaultDb = createDatabase();
  }
  return defaultDb;
}
