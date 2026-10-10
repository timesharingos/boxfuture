import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = join(app.getPath('userData'), 'data.db')
    db = new Database(dbPath)
    console.log('[db] opened sqlite database at', dbPath)
  }
  return db
}
