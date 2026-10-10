import Database from 'better-sqlite3'
import { SCHEMA } from '../src/main/schema.ts'
import { createAccount, createOneTimeDeposit, createRegularDeposit, createRegularDepositRate, createSpot } from '../src/main/queries.ts'

/**
 * Create an in-memory test database with the same schema as production
 * Uses the EXACT same schema definition as the main application
 */
export function createTestDb() {
  const db = new Database(':memory:')
  db.exec(SCHEMA)
  return db
}

/**
 * Helper for assertions in tests
 */
export function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exitCode = 1
  } else {
    console.log('ok:', msg)
  }
}

// Re-export all the centralized query helpers so tests use the exact same code as production
export { createAccount, createOneTimeDeposit, createRegularDeposit, createRegularDepositRate, createSpot }
