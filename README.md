# BoxFutures

An accrual-basis personal finance tracker that lets you travel through an infinite timeline to see your financial position at any point — past, present, or future.

## What makes it different

Traditional finance apps use category-based tracking on a cash basis (when money actually moves). BoxFutures uses **accrual accounting** instead:

- **Accounts receivable (AR)**: Money you expect but haven't received yet (like this month's unfinished salary accrual)
- **Cash flow**: Real money you can withdraw right now
- **Regular deposits**: Recurring income streams (salary, allowances) that accrue as AR during each period, then settle to cash at period end
- **One-time deposits**: Individual transactions (bonuses, gifts, purchases)

The ledger is **append-only** — nothing is ever deleted. Every action becomes part of an immutable history you can query at any date.

## Core concepts

### Account
A logical representation of a real-world account (checking, savings, etc.). Each account independently tracks its own AR and cash flow.

### Primitive: Spot
An instant transaction that consumes existing balance. Spots are the primary way users record expenses and income adjustments.

**Payment methods:**
- **Regular-first (default)**: Uses as much regular AR as available, then falls back to one-time cash for any remainder
- **One-time only**: Paid entirely from one-time cash
- **Manual override**: User specifies exact amounts from regular AR and one-time cash

**Timing:**
- Spots can only be added for current or future months (not past months)
- A spot paid from regular AR reduces the current month's AR immediately
- When the month settles, the reduced AR translates to reduced cash flow
- A spot paid from one-time cash reduces cash flow immediately

**Examples:**
- $2000 expense with $5000 AR available → uses $2000 from AR, leaving $3000 AR
- $6000 expense with $5000 AR → uses all $5000 AR + $1000 from one-time cash
- Negative amounts represent income/refunds (increase balance instead of reducing it)

### One-time deposit
A single transaction: income (positive amount) or expense (negative amount). Examples: lottery winnings, company bonus, a purchase. Cannot recur.

### Regular deposit
A recurring income stream with a monthly settlement period. Examples: salary, weekly allowance.

- **Accrual phase**: While the current month is active, the expected monthly amount counts as AR, not cash.
- **Settlement**: When the next month begins (hardcoded to the 1st for now), the previous month's accrual instantly becomes realized cash, and a fresh accrual starts for the new month.
- **Rate changes**: Editing a regular deposit's amount only takes effect starting month **m+2**, where m is the month in which you make the edit. The current month (m+0) and the already-imminent next month (m+1) remain unchanged. This ensures the "current" accrual and the imminent settlement stay stable.

### Cash flow
The real cash available for withdrawal at a given date. Formula: `sum(one-time deposits up to date) + sum(settled regular deposit months before date)`.

### AR (Accounts Receivable)
Money accruing *right now* but not yet cash. Formula: `sum(each active regular deposit's current-month amount)`.

### Infinity calendar
A month-based navigator (prev/next buttons + date picker) that lets you jump to any month — 10 years ago or 50 years in the future — and see the computed AR and cash flow for that exact moment. No background jobs, no materialization — everything is derived on-demand from the append-only ledger.

## Tech stack

- **Electron** 39.8.10 + **electron-vite** — cross-platform desktop app with HMR in dev
- **React** 19 + **TypeScript** 5.7 — renderer process UI
- **Ant Design** 5.23 — component library
- **better-sqlite3** 12.5.0 — embedded SQLite database (main process)
- **Playwright** — end-to-end testing

## Getting started

```bash
# Install dependencies
npm install

# Rebuild native modules for Electron's ABI (required after fresh install or node_modules changes)
npx electron-builder install-app-deps

# Dev mode with HMR
npm run dev

# Build for production (output in out/)
npm run build

# Run ledger unit tests (pure accrual math)
npm run test:ledger

# Run spot primitive unit tests
npm run test:spot

# Run end-to-end UI smoke tests (requires a production build first)
npm run test:e2e

# Run spot primitive E2E tests (requires a production build first)
npm run test:spot-e2e
```

## Project structure

```
src/
├── main/
│   ├── index.ts          # Electron main process entry
│   ├── db.ts             # SQLite schema init
│   ├── ledger.ts         # Pure accrual computation functions
│   └── ipc.ts            # IPC handlers for renderer ↔ main communication
├── preload/
│   ├── index.ts          # Preload script (exposes window.api.ledger)
│   └── types.ts          # Shared TypeScript types
└── renderer/
    └── src/
        ├── App.tsx                  # Shell: sidebar + layout
        ├── pages/
        │   ├── Overview.tsx         # Cross-account summary
        │   └── AccountCalendar.tsx  # Per-account view: AR, cash flow, deposit lists
        ├── components/
        │   └── MonthNav.tsx         # Month navigator (prev/next + picker)
        └── lib/
            └── month.ts             # Date helpers (monthKey, addMonths, etc.)
```

## Database schema

### `accounts`
- `id`, `name`, `created_at`

### `one_time_deposits`
- `id`, `account_id`, `amount`, `date`, `description`, `created_at`
- Negative amounts = expenses/withdrawals

### `regular_deposits`
- `id`, `account_id`, `name`, `created_at`
- `settlement_day` (default 1), `period` (default 'monthly') — reserved for future user configuration

### `regular_deposit_rates`
- `id`, `regular_deposit_id`, `amount`, `effective_from_month`, `created_at`
- Append-only rate history. Each edit adds a new row with `effective_from_month = currentMonth + 2`

No table stores a "current balance" — everything is computed on-demand.

## Development notes

### Native module (better-sqlite3)
The `better-sqlite3` package is a native addon compiled against Node's ABI. After `npm install`, it's built for your **system Node**, not Electron's bundled Node (different ABI versions).

You must rebuild it for Electron's ABI before running the app:
```bash
npx electron-builder install-app-deps
```

This is **not** wired into `postinstall` because it depends on downloading prebuilt binaries from GitHub, which can be flaky on some networks. Run it manually after install or when `node_modules` changes.

### Testing
- **Unit tests** (`npm run test:ledger`): Pure accrual math tests using Electron's Node runtime (via `ELECTRON_RUN_AS_NODE=1`) so the test environment matches the real app's ABI.
- **E2E tests** (`npm run test:e2e`): Playwright launches the built app, clicks through creating accounts/deposits, navigating months, and validates the UI text/screenshots match expected AR/cash-flow values.

### Future expansion
The current implementation reserves schema fields (`settlement_day`, `period`) and design space for:
- User-configurable settlement periods (weekly, biweekly, custom)
- A "responsibility" or "primitive-level revoke" system (user mentioned but deferred)
- Cross-account transfer actions
- Multi-currency support

## License

(Add your license here)
