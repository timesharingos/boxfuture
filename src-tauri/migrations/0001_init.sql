-- boxfuture schema v1
-- 设计原则：ledger_event 只追加；posting / cash_flow / obligation / counter_usage 均为可重建投影。

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE currency (
  code       TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  symbol     TEXT NOT NULL DEFAULT '',
  minor_unit INTEGER NOT NULL DEFAULT 2,
  is_base    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE account (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'bank',
  currency       TEXT NOT NULL DEFAULT 'CNY',
  cycle_start_day INTEGER NOT NULL DEFAULT 1,
  sort           INTEGER NOT NULL DEFAULT 0,
  archived       INTEGER NOT NULL DEFAULT 0,
  note           TEXT,
  created_at     TEXT NOT NULL
);

-- 规律预算额度：按账户 + 起始月份，取 <= 目标月的最近一条生效
CREATE TABLE account_quota (
  account_id TEXT NOT NULL REFERENCES account(id),
  month      TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (account_id, month)
);

CREATE TABLE period (
  month         TEXT PRIMARY KEY,
  status        TEXT NOT NULL DEFAULT 'open',   -- open | closed
  closed_at     TEXT,
  close_event_id TEXT,
  carryover_json TEXT,
  reopened_at   TEXT
);

CREATE TABLE ledger_event (
  seq             INTEGER PRIMARY KEY AUTOINCREMENT,
  id              TEXT NOT NULL UNIQUE,
  kind            TEXT NOT NULL,
  direction       TEXT NOT NULL,
  ref_event_id    TEXT,
  obligation_id   TEXT,
  parent_event_id TEXT,
  accrual_date    TEXT NOT NULL,
  budget_month    TEXT NOT NULL,
  cash_date       TEXT,
  amount          INTEGER NOT NULL DEFAULT 0,
  cash_amount     INTEGER NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'CNY',
  fx_rate         TEXT,
  original_amount INTEGER,
  account_id      TEXT,
  to_account_id   TEXT,
  pool            TEXT,
  to_pool         TEXT,
  tag             TEXT,
  counter_delta   INTEGER NOT NULL DEFAULT 0,
  vendor_id       TEXT,
  title           TEXT,
  reason          TEXT,
  urgency         TEXT,
  market_price    INTEGER,
  expected_effect TEXT,
  usage_months    INTEGER,
  necessity       TEXT,
  purpose         TEXT,
  status          TEXT NOT NULL DEFAULT 'normal',
  note            TEXT,
  meta            TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_event_kind     ON ledger_event(kind);
CREATE INDEX idx_event_budget   ON ledger_event(budget_month);
CREATE INDEX idx_event_accrual  ON ledger_event(accrual_date);
CREATE INDEX idx_event_ref      ON ledger_event(ref_event_id);
CREATE INDEX idx_event_account  ON ledger_event(account_id);

CREATE TABLE posting (
  id         TEXT PRIMARY KEY,
  event_id   TEXT NOT NULL,
  account_id TEXT NOT NULL,
  pool       TEXT NOT NULL,
  month      TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  kind       TEXT NOT NULL
);
CREATE INDEX idx_posting_event ON posting(event_id);
CREATE INDEX idx_posting_bal   ON posting(account_id, pool, month);

CREATE TABLE cash_flow (
  id         TEXT PRIMARY KEY,
  event_id   TEXT NOT NULL,
  account_id TEXT NOT NULL,
  date       TEXT NOT NULL,
  month      TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  kind       TEXT NOT NULL
);
CREATE INDEX idx_cash_date    ON cash_flow(date);
CREATE INDEX idx_cash_account ON cash_flow(account_id, month);

CREATE TABLE obligation (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL,
  account_id  TEXT NOT NULL,
  kind        TEXT NOT NULL,          -- futures_balance | accrual
  due_month   TEXT NOT NULL,
  due_date    TEXT,
  amount      INTEGER NOT NULL,
  paid_amount INTEGER NOT NULL DEFAULT 0,
  pool        TEXT,
  tag         TEXT,
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | paid | settled | cancelled | frozen
  note        TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_oblig_due ON obligation(due_month, status);
CREATE INDEX idx_oblig_ev  ON obligation(event_id);

CREATE TABLE order_line (
  id         TEXT PRIMARY KEY,
  event_id   TEXT NOT NULL,
  kind       TEXT NOT NULL,           -- item | fee
  name       TEXT NOT NULL,
  qty        REAL NOT NULL DEFAULT 1,
  unit_price INTEGER NOT NULL DEFAULT 0,
  amount     INTEGER NOT NULL,
  currency   TEXT,
  note       TEXT,
  sort       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_line_event ON order_line(event_id);

CREATE TABLE attachment (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime        TEXT,
  size        INTEGER,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_attach_event ON attachment(event_id);

CREATE TABLE counter_usage (
  account_id TEXT NOT NULL,
  tag        TEXT NOT NULL,
  month      TEXT NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, tag, month)
);

CREATE TABLE tag_rule (
  tag             TEXT PRIMARY KEY,
  label           TEXT NOT NULL,
  min_amount      INTEGER NOT NULL,
  max_amount      INTEGER,
  monthly_limit   INTEGER,
  upgrade_to      TEXT,
  required_fields TEXT NOT NULL,
  sort            INTEGER NOT NULL
);

CREATE TABLE vendor (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  kind       TEXT,
  note       TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE rate (
  base   TEXT NOT NULL,
  quote  TEXT NOT NULL,
  date   TEXT NOT NULL,
  value  TEXT NOT NULL,
  source TEXT,
  PRIMARY KEY (base, quote, date)
);

CREATE TABLE audit_log (
  seq       INTEGER PRIMARY KEY AUTOINCREMENT,
  at        TEXT NOT NULL,
  action    TEXT NOT NULL,
  entity    TEXT,
  entity_id TEXT,
  detail    TEXT
);
