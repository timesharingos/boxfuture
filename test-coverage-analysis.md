# Test Coverage Analysis

## Unit Tests (Ledger Logic)

### test-ledger.mjs - Core ledger calculations
- ✅ Regular deposit starting in current month (AR accrual)
- ✅ One-time deposit in current month (immediate cash flow)
- ✅ Viewing month before stream started (not_started status)
- ✅ Regular deposit settlement in next month (AR → cash flow)
- ✅ Rate change with m+1 rule (takes effect next month)
- ✅ Rate change persistence (new rate continues in future months)
- ✅ Far future calculation performance (70+ years)
- ✅ Overall state aggregation (multiple accounts)

### test-spot-ledger.mjs - Spot transaction logic
- ✅ Spot payment from regular deposit (reduces AR)
- ✅ Spot payment from one-time deposit (reduces cash immediately)
- ✅ Hybrid spot payment (regular + one-time)
- ✅ Multiple spots accumulation
- ✅ Negative spot (income/refund increases AR)

## E2E Tests (Full UI workflow)

### e2e-smoke.mjs - Basic smoke test
- ✅ Account creation with initial balance
- ✅ Regular deposit configuration
- ✅ Initial state display (cash flow + AR)
- ✅ Month navigation (forward)
- ✅ Settlement verification (AR → cash flow)

### test-spot-e2e.mjs - Spot transactions UI
- ✅ Spot from regular deposit (AR reduction)
- ✅ Spot from one-time deposit (cash reduction)
- ✅ Hybrid spot payment
- ✅ Settlement after spots consumed AR
- ✅ UI state updates

### test-sorting-e2e.mjs - Transaction list features
- ✅ Transaction list sorting by date (asc/desc)
- ✅ Transaction list sorting by amount (asc/desc)
- ✅ Unified transaction list display
- ✅ Transaction type tags
- ✅ Payment source tags

### test-m1-rule-e2e.mjs - Rate change UI
- ✅ Rate change dialog
- ✅ m+1 rule enforcement (change takes effect next month)
- ✅ Current month AR unchanged after rate change
- ✅ Next month AR reflects new rate
- ✅ New rate persistence

## Coverage Gaps - Missing Test Scenarios

### Core Ledger Logic
- ❌ Multiple regular deposits in same account
- ❌ Multiple one-time deposits
- ❌ Edge case: spot exactly equals AR (AR goes to zero)
- ❌ Edge case: spot exceeds available AR + cash (should fail or handle gracefully)
- ❌ Regular deposit with different settlement days
- ❌ Date boundaries (end of month, leap years)
- ❌ Account deletion/archival
- ❌ Negative cash flow scenarios
- ❌ Very large amounts (precision/overflow)

### Spot Transactions
- ❌ Spot transaction editing/deletion
- ❌ Spot with future date
- ❌ Spot with past date (in different month)
- ❌ Multiple spots on same day
- ❌ Spot description validation/limits

### UI/UX Edge Cases
- ❌ Empty state (no accounts)
- ❌ Empty state (no transactions in month)
- ❌ Account editing/renaming
- ❌ Account deletion with existing transactions
- ❌ Form validation errors (negative amounts, invalid dates)
- ❌ Month navigation backward (multiple clicks)
- ❌ Month navigation to far future/past
- ❌ Window resize/responsive behavior
- ❌ Error handling (database errors, network issues)
- ❌ Modal cancellation (without saving)

### Data Persistence
- ❌ Database corruption recovery
- ❌ Migration testing (schema upgrades)
- ❌ Data export/import
- ❌ Concurrent access (multiple windows)

### Performance
- ❌ Large dataset (1000+ transactions)
- ❌ Large dataset (100+ accounts)
- ❌ Stress test (rapid UI interactions)

