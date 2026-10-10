import { computeAccountState, computeOverallState, monthKey, addMonths } from '../src/main/ledger.ts'
import { createTestDb, assert, createAccount, createOneTimeDeposit, createRegularDeposit, createRegularDepositRate } from './test-helpers.mjs'

const db = createTestDb()

const accId = createAccount(db, 'Checking', 'now').lastInsertRowid

// scenario: "now" is 2026-10. Salary stream starts 2026-10 at 5000.
const streamId = createRegularDeposit(db, accId, 'Salary', 'now').lastInsertRowid
createRegularDepositRate(db, streamId, 5000, '2026-10', 'now')

// one-time deposit of 1000 in October
createOneTimeDeposit(db, accId, 1000, '2026-10-05', 'bonus', 'now')

// --- Test 1: viewing October itself (the start month) ---
let state = computeAccountState(db, accId, new Date('2026-10-31'))
assert(state.ar === 5000, `October AR should be 5000 (got ${state.ar})`)
assert(state.cashFlow === 1000, `October cash flow should be 1000 one-time only (got ${state.cashFlow})`)
assert(state.streams[0].status === 'accruing', 'salary stream should be accruing in October')

// --- Test 2: viewing September (before the stream started) ---
state = computeAccountState(db, accId, new Date('2026-09-30'))
assert(state.ar === 0, `September AR should be 0, stream not started (got ${state.ar})`)
assert(state.streams[0].status === 'not_started', 'salary stream should be not_started before October')

// --- Test 3: viewing November (October has settled into cash) ---
state = computeAccountState(db, accId, new Date('2026-11-30'))
assert(state.cashFlow === 1000 + 5000, `November cash flow should include settled October salary (got ${state.cashFlow})`)
assert(state.ar === 5000, `November AR should be the new (November) accrual = 5000 (got ${state.ar})`)

// --- Test 4: rate change made "now" (October) takes effect next month (November), not immediately, and not two months out ---
db.prepare('INSERT INTO regular_deposit_rates (regular_deposit_id, amount, effective_from_month, created_at) VALUES (?, ?, ?, ?)')
  .run(streamId, 6000, addMonths(monthKey(new Date('2026-10-15')), 1), 'now')

state = computeAccountState(db, accId, new Date('2026-10-31'))
assert(state.ar === 5000, `October AR should stay at old rate 5000 after a rate change made in October (got ${state.ar})`)

state = computeAccountState(db, accId, new Date('2026-11-30'))
assert(state.ar === 6000, `November AR should reflect the new rate 6000 (got ${state.ar})`)
assert(state.cashFlow === 1000 + 5000, `November cash flow should still only have Oct's old-rate settlement (got ${state.cashFlow})`)

state = computeAccountState(db, accId, new Date('2026-12-31'))
assert(state.cashFlow === 1000 + 5000 + 6000, `December cash flow should include Nov settled at new rate (got ${state.cashFlow})`)

// --- Test 5: far future (infinity) stays correct and fast ---
const start = Date.now()
state = computeAccountState(db, accId, new Date('2099-01-31'))
const elapsed = Date.now() - start
assert(elapsed < 200, `computing 70+ years out should be fast (took ${elapsed}ms)`)
// months from 2026-10 (old rate) to 2026-11 settlement boundary: 1 month @5000, then 2026-11 to 2099-01 @6000
const monthsAtNewRate = (2099 - 2026) * 12 + (1 - 11) // months from 2026-11 to 2099-01 exclusive of 2099-01
const expected = 1000 + 5000 * 1 + 6000 * monthsAtNewRate
assert(state.cashFlow === expected, `far-future cash flow mismatch (got ${state.cashFlow}, expected ${expected})`)

// --- Test 6: overall state aggregates accounts ---
const novState = computeAccountState(db, accId, new Date('2026-11-30'))
const overall = computeOverallState(db, new Date('2026-11-30'))
assert(overall.accounts.length === 1, `overall should list 1 account (got ${overall.accounts.length})`)
assert(overall.cashFlow === novState.cashFlow, `overall cash flow should match the single account's cash flow (got ${overall.cashFlow} vs ${novState.cashFlow})`)
assert(overall.ar === novState.ar, `overall AR should match the single account's AR (got ${overall.ar} vs ${novState.ar})`)

console.log('done')
