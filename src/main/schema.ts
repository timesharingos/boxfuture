/**
 * Database schema shared between production and tests
 * This file has no dependencies and can be imported in any environment
 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS one_time_deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_one_time_deposits_account_date
  ON one_time_deposits(account_id, date);

CREATE TABLE IF NOT EXISTS regular_deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  settlement_day INTEGER NOT NULL DEFAULT 1,
  period TEXT NOT NULL DEFAULT 'monthly'
);

CREATE TABLE IF NOT EXISTS regular_deposit_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  regular_deposit_id INTEGER NOT NULL REFERENCES regular_deposits(id),
  amount REAL NOT NULL,
  effective_from_month TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_regular_deposit_rates_stream
  ON regular_deposit_rates(regular_deposit_id, effective_from_month);

CREATE TABLE IF NOT EXISTS spots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  payment_from_regular REAL NOT NULL DEFAULT 0,
  payment_from_onetime REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spots_account_date
  ON spots(account_id, date);
`
