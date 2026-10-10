import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import { SCHEMA } from './schema.ts'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = join(app.getPath('userData'), 'data.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.exec(SCHEMA)
    console.log('[db] opened sqlite database at', dbPath)
  }
  return db
}
