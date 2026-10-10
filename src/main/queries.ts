/**
 * Centralized database operations
 * All SQL statements used in production and tests must come from here
 * This ensures consistency and prevents false passing tests
 */
import type Database from 'better-sqlite3'

export const queries = {
  // Accounts
  insertAccount: 'INSERT INTO accounts (name, created_at) VALUES (?, ?)',
  selectAccounts: 'SELECT id, name, created_at FROM accounts ORDER BY id ASC',
  selectAllAccountIds: 'SELECT id FROM accounts',

  // One-time deposits
  insertOneTimeDeposit: 'INSERT INTO one_time_deposits (account_id, amount, date, description, created_at) VALUES (?, ?, ?, ?, ?)',
  selectOneTimeDepositsForMonth: "SELECT id, amount, date, description, created_at FROM one_time_deposits WHERE account_id = ? AND strftime('%Y-%m', date) = ? ORDER BY date ASC",
  selectOneTimeDepositsTotal: 'SELECT COALESCE(SUM(amount), 0) AS total FROM one_time_deposits WHERE account_id = ? AND date <= ?',

  // Regular deposits
  insertRegularDeposit: 'INSERT INTO regular_deposits (account_id, name, created_at) VALUES (?, ?, ?)',
  selectRegularDepositsForAccount: 'SELECT id, name, created_at FROM regular_deposits WHERE account_id = ? ORDER BY id ASC',
  selectRegularDepositsByAccount: 'SELECT id, name FROM regular_deposits WHERE account_id = ?',
  deleteRegularDeposits: 'DELETE FROM regular_deposits',

  // Regular deposit rates
  insertRegularDepositRate: 'INSERT INTO regular_deposit_rates (regular_deposit_id, amount, effective_from_month, created_at) VALUES (?, ?, ?, ?)',
  selectRegularDepositRates: 'SELECT amount, effective_from_month FROM regular_deposit_rates WHERE regular_deposit_id = ? ORDER BY effective_from_month ASC',
  deleteRegularDepositRates: 'DELETE FROM regular_deposit_rates',

  // Spots
  insertSpot: 'INSERT INTO spots (account_id, amount, date, description, payment_from_regular, payment_from_onetime, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  selectSpotsForMonth: "SELECT id, amount, date, description, payment_from_regular, payment_from_onetime, created_at FROM spots WHERE account_id = ? AND strftime('%Y-%m', date) = ? ORDER BY date ASC",
  selectSpotsBeforeDate: 'SELECT payment_from_regular, payment_from_onetime FROM spots WHERE account_id = ? AND date <= ?',
  selectSpotsForMonth2: 'SELECT COALESCE(SUM(payment_from_regular), 0) AS total FROM spots WHERE account_id = ? AND date >= ? AND date <= ?',
  selectSpotsFromOnetime: 'SELECT COALESCE(SUM(payment_from_onetime), 0) AS total FROM spots WHERE account_id = ? AND date <= ?',
  deleteSpots: 'DELETE FROM spots',
  deleteOneTimeDeposits: 'DELETE FROM one_time_deposits'
} as const

/**
 * Helper to create account - used by both production and tests
 */
export function createAccount(db: Database.Database, name: string, createdAt: string) {
  return db.prepare(queries.insertAccount).run(name, createdAt)
}

/**
 * Helper to create one-time deposit - used by both production and tests
 */
export function createOneTimeDeposit(
  db: Database.Database,
  accountId: number,
  amount: number,
  date: string,
  description: string,
  createdAt: string
) {
  return db.prepare(queries.insertOneTimeDeposit).run(accountId, amount, date, description, createdAt)
}

/**
 * Helper to create regular deposit - used by both production and tests
 */
export function createRegularDeposit(
  db: Database.Database,
  accountId: number,
  name: string,
  createdAt: string
) {
  return db.prepare(queries.insertRegularDeposit).run(accountId, name, createdAt)
}

/**
 * Helper to create regular deposit rate - used by both production and tests
 */
export function createRegularDepositRate(
  db: Database.Database,
  regularDepositId: number,
  amount: number,
  effectiveFromMonth: string,
  createdAt: string
) {
  return db.prepare(queries.insertRegularDepositRate).run(regularDepositId, amount, effectiveFromMonth, createdAt)
}

/**
 * Helper to create spot - used by both production and tests
 */
export function createSpot(
  db: Database.Database,
  accountId: number,
  amount: number,
  date: string,
  description: string,
  paymentFromRegular: number,
  paymentFromOnetime: number,
  createdAt: string
) {
  return db.prepare(queries.insertSpot).run(
    accountId,
    amount,
    date,
    description,
    paymentFromRegular,
    paymentFromOnetime,
    createdAt
  )
}
