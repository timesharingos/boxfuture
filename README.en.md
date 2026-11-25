# boxfuture

Accrual-basis personal ledger: **future obligations locked in advance, dual budget pools, an append-only ledger you can never silently edit**.

> Design sources: `exprdocs/origin.txt` (original draft) and `exprdocs/detail-design.md` (detailed design + decision log).
> Stack: Tauri 2 + React 18 + TypeScript + Tailwind 4 + Rust + SQLite (rusqlite bundled).

[简体中文](README.md) | English

---

## What it solves

Most trackers record *when money left*. This one records **when the commitment happened**:

- Order a pre-order figure: the deposit hits this month, **the balance locks the budget of the month it falls due**;
- At month end the leftover recurring budget is carried into the one-off pool, and **one-off budget never renews**;
- Every entry is append-only; mistakes are fixed with reversal / settlement / roll-over, so **the audit trail stays intact**;
- Spending is graded by amount, and anything above the small tier **must** carry a reason, urgency and market price — otherwise it cannot be saved;
- How much cash you need over the next 12 months, and how far you can borrow from the future, are visible at a glance.

## Languages

The UI ships in Chinese and English:

- **Follows the system language by default**: `navigator.language` starting with `zh` → Chinese, anything else → English;
- The `EN` / `中文` button in the top-right corner switches at any time and the choice is stored in `localStorage`;
- Strings live in `src/lib/i18n.tsx`, keyed by the **Chinese original**, so adding a new string means adding one dictionary entry.

## Recurring budget: receivable → realization

The monthly recurring quota is treated as **the first receivable of the month**:

- At month start each account's quota is booked as *recurring budget* income, so the P&L reads `quota − spending` instead of a mysterious negative number;
- **Budget realization** records the part that actually arrived. It is a cash inflow, can be recorded several times, is capped at the month's quota, and **does not change how much you may spend**;
- Realization rate = realized ÷ quota. Anything not realized is *owed* (`quota − realized`) and resets every month;
- **Virtual month close** (dashboard projections): the **current month** is projected using its actual realization ratio, while **future months** assume 100% realization;
- Rows in reports that fall in future months carry a `Forecast` badge, and the dashboard shows a `Live forecast` badge when a future month is selected.

## Run

```bash
npm install
npm run tauri:dev      # dev mode
npm run tauri:build    # build the NSIS installer
```

Prerequisites: Node 22+, stable Rust, Visual Studio 2022 C++ build tools, WebView2.

Data files: `%APPDATA%\boxfuture\boxfuture.db`, attachments in `%APPDATA%\boxfuture\attachments`.

The data directory is resolved in this order, taking the first **writable** one:

1. `BOXFUTURE_DATA_DIR`
2. `%APPDATA%\boxfuture`
3. `%LOCALAPPDATA%\boxfuture`
4. `data\` next to the executable

If it falls back to 3 or 4 (common in restricted or sandboxed environments), an orange banner shows the actual path so data never ends up somewhere unexpected.

**Portable mode**: set `BOXFUTURE_DATA_DIR` to any folder and the database, attachments and WebView2 data all live there — handy for USB sticks or isolated testing.

First launch creates three sample accounts (daily card / reserve card / investment account); rename or archive them on the Accounts page.

![Dashboard](docs/dashboard.png)

## Features (first release)

| Module | What it does |
|---|---|
| Accounts | Logical accounts with two pools (recurring / one-off), monthly quota, archiving |
| Month close | Automatic close with a carry-over summary; manual close and reopen |
| Spot | Immediate purchases and future spot entries (paid now, locked to a future month) |
| Futures | Deposit + balance, **deposit and balance may use different accounts and pools**, item lines, extra fees, vendors, original currency and FX rate, attachments, multiple payments, settlement, roll-over, cancellation |
| Accrual | An estimate that parks budget indefinitely; settling it produces a real spot entry |
| Realization | Records the recurring budget actually arriving; multiple entries, capped at the monthly quota, reversible |
| Reversal | Partial and repeated, may exceed the original amount (the excess becomes a new expense) |
| Transfer | Between accounts and pools; `one-off → recurring` is forbidden |
| Income | Regular and one-off income; one-off income can only enter the one-off pool |
| Grading | Essential / Small / Medium / Large / Equipment with hard-required fields and a monthly small-tier counter (over-limit auto-upgrades) |
| Reports | P&L, cash flow, budget execution, scheduled-payment schedule, booking habits, spending headroom, realization rate |
| Audit | Full event timeline, budget postings, cash flows and related events for any entry |

## Core rules (as implemented)

1. **Postings are the only truth**: every entry is reduced to `(account, pool, month, amount)`; a balance is `quota + Σ postings`.
2. **Future locking** is just writing a posting into a future month — no extra mechanism.
3. **Month normalization**: an internal adjustment targeting a closed month is redirected to the current month, so historical projections never change.
4. **One-way adjustments** (decision Q8): budget releases (refunds / reversals) always land in the one-off pool; extra costs hit one-off first, then recurring (which may go negative).
5. **Futures grading** uses the full order amount, and the counter counts an order once; the balance only locks budget.
6. **Two-phase balance**: *settle* changes the estimate and recomputes budget, *pay* (repeatable) only records cash.
7. **Hard grading block**: missing required fields reject the save.
8. **Month-scoped views**: dashboard figures (recurring / one-off balances, 12-month obligations, unpaid obligations, spending headroom) all settle to the selected month; closed months use real carry-over postings while open months are **simulated** (i.e. "what it looks like if we settle to that month").
9. **Quota edits take effect next month**: changing the recurring quota in Budget leaves the selected month untouched and applies from the **following** month; editing the same effective month again overwrites it.
10. **Account opening balances**: a new account can take an initial recurring quota and an initial one-off budget (positive balance / negative debt).
11. **Budget injection rows**: the ledger shows a read-only *recurring budget injection* row per account per month (not persisted, no cash impact, no P&L impact); clicking it opens the quota history. Hidden while a month filter or search is active.
12. **Recurring quota is income**: each account's monthly quota is booked as *recurring budget* income, so the P&L net equals `quota − spending`.
13. **Realization**: recording realized budget is a cash inflow only — spendable budget is unchanged, the cumulative total may not exceed the month's quota, and entries in a closed month are rejected.
14. **Virtual close**: projections use the current month's actual realization ratio and 100% for future months; report rows in future months are tagged `Forecast`.

## Project layout

```
src/                     React frontend (zero SQL, everything through invoke)
  components/ui.tsx      base components and toast
  features/              dashboard / new entry / ledger / budget / obligations / accounts / reports / settings
  lib/                   IPC wrapper, types, formatting, react-query hooks, i18n
src-tauri/
  migrations/0001_init.sql
  src/domain.rs          Month / Pool / AppError
  src/db.rs              connection, migrations, seed data
  src/engine/            ledger core (mod / write / close / read)
  src/reports.rs         aggregation for the seven reports
  src/commands.rs        thin Tauri command layer
  tests/                 engine, quota and report integration tests
```

## Tests

```bash
cd src-tauri
cargo test --offline     # engine invariants: posting, locking, close, reversal, settlement, roll-over,
                         # quota editing and budget realization
```

## Build troubleshooting

### `failed to run custom build command for libsqlite3-sys` / `cl : error D8050`

```
cl : command line error D8050 : failed to execute "…\c1.dll" : cannot put the command line into the debug record
error occurred in cc-rs: command did not execute successfully (status code exit code: 2)
```

`rusqlite`'s `bundled` feature compiles SQLite from C with MSVC at build time. When `TMP` / `TEMP` point at the system temp directory, `cl.exe` fails with D8050 on some machines; pointing the temp directory at a writable local path fixes it.

The repository already handles this: `.cargo/config.toml` forces `TMP` / `TEMP` to `src-tauri/target/` during builds (cargo recreates that directory on every build, so a `cargo clean` is harmless), which means a plain `npm run tauri:dev` needs no extra setup.

If it still fails:

1. Clean and retry: `cargo clean -p libsqlite3-sys`;
2. Use `npm run dev:win` / `npm run build:win`, which load the Visual Studio environment (`vcvars64`) first;
3. Make sure the "Desktop development with C++" workload and the Windows SDK are installed, and that C: has enough free space.

## Not implemented yet

Installments, recurring transactions, savings goals with budget blocking, manual/smart splitting, FX settlement modes and exchange gains/losses, equipment amortization, scheduled transfers, database encryption, cloud sync, mobile apps.
