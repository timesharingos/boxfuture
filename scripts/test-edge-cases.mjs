import { computeAccountState, computeOverallState, monthKey } from '../src/main/ledger.ts'
import { createTestDb, assert, createAccount, createRegularDeposit, createRegularDepositRate, createOneTimeDeposit, createSpot } from './test-helpers.mjs'

const db = createTestDb()

console.log('=== Test 1: Multiple regular deposits in same account ===')
const acc1 = createAccount(db, 'Multi-stream', '2026-10-01').lastInsertRowid
const stream1 = createRegularDeposit(db, acc1, 'Salary', '2026-10-01').lastInsertRowid
const stream2 = createRegularDeposit(db, acc1, 'Bonus', '2026-10-01').lastInsertRowid
createRegularDepositRate(db, stream1, 5000, '2026-10', '2026-10-01')
createRegularDepositRate(db, stream2, 2000, '2026-10', '2026-10-01')

let state = computeAccountState(db, acc1, new Date('2026-10-15'))
assert(state.ar === 7000, `Multiple streams should sum AR: expected 7000, got ${state.ar}`)

state = computeAccountState(db, acc1, new Date('2026-11-15'))
assert(state.cashFlow === 7000, `Both streams should settle: expected 7000, got ${state.cashFlow}`)
assert(state.ar === 7000, `AR should continue in next month: expected 7000, got ${state.ar}`)

console.log('=== Test 2: Multiple one-time deposits ===')
const acc2 = createAccount(db, 'Multiple OT', '2026-10-01').lastInsertRowid
createOneTimeDeposit(db, acc2, 1000, '2026-10-05', 'Deposit 1', '2026-10-05')
createOneTimeDeposit(db, acc2, 500, '2026-10-10', 'Deposit 2', '2026-10-10')
createOneTimeDeposit(db, acc2, 2500, '2026-10-15', 'Deposit 3', '2026-10-15')

state = computeAccountState(db, acc2, new Date('2026-10-20'))
assert(state.cashFlow === 4000, `Multiple one-time deposits should sum: expected 4000, got ${state.cashFlow}`)

console.log('=== Test 3: Spot exactly equals AR (AR goes to zero) ===')
const acc3 = createAccount(db, 'Exact spot', '2026-10-01').lastInsertRowid
const stream3 = createRegularDeposit(db, acc3, 'Income', '2026-10-01').lastInsertRowid
createRegularDepositRate(db, stream3, 3000, '2026-10', '2026-10-01')
createSpot(db, acc3, 3000, '2026-10-15', 'Exact payment', 3000, 0, '2026-10-15')

state = computeAccountState(db, acc3, new Date('2026-10-20'))
assert(state.ar === 0, `AR should be zero after exact spot: got ${state.ar}`)
assert(state.cashFlow === 0, `Cash flow should be zero: got ${state.cashFlow}`)

state = computeAccountState(db, acc3, new Date('2026-11-15'))
assert(state.cashFlow === 0, `No settlement when AR was consumed: got ${state.cashFlow}`)
assert(state.ar === 3000, `New month AR should accrue normally: got ${state.ar}`)

console.log('=== Test 4: Spot exceeds available AR (hybrid with overflow to cash) ===')
const acc4 = createAccount(db, 'Overflow', '2026-10-01').lastInsertRowid
const stream4 = createRegularDeposit(db, acc4, 'Income', '2026-10-01').lastInsertRowid
createRegularDepositRate(db, stream4, 2000, '2026-10', '2026-10-01')
createOneTimeDeposit(db, acc4, 5000, '2026-10-01', 'Initial', '2026-10-01')
// Spot 6000: should consume all 2000 AR, then 4000 from cash
createSpot(db, acc4, 6000, '2026-10-15', 'Big purchase', 2000, 4000, '2026-10-15')

state = computeAccountState(db, acc4, new Date('2026-10-20'))
assert(state.ar === 0, `AR should be zero after overflow spot: got ${state.ar}`)
assert(state.cashFlow === 1000, `Cash should be 5000 - 4000 = 1000: got ${state.cashFlow}`)

console.log('=== Test 5: Negative cash flow scenarios ===')
const acc5 = createAccount(db, 'Negative', '2026-10-01').lastInsertRowid
createOneTimeDeposit(db, acc5, 100, '2026-10-01', 'Small deposit', '2026-10-01')
createSpot(db, acc5, 500, '2026-10-15', 'Overdraft', 0, 500, '2026-10-15')

state = computeAccountState(db, acc5, new Date('2026-10-20'))
assert(state.cashFlow === -400, `Negative cash flow allowed: expected -400, got ${state.cashFlow}`)

console.log('=== Test 6: Multiple spots on same day ===')
const acc6 = createAccount(db, 'Same day', '2026-10-01').lastInsertRowid
const stream6 = createRegularDeposit(db, acc6, 'Income', '2026-10-01').lastInsertRowid
createRegularDepositRate(db, stream6, 5000, '2026-10', '2026-10-01')
createSpot(db, acc6, 1000, '2026-10-15', 'Purchase 1', 1000, 0, '2026-10-15T10:00:00')
createSpot(db, acc6, 500, '2026-10-15', 'Purchase 2', 500, 0, '2026-10-15T14:00:00')
createSpot(db, acc6, 800, '2026-10-15', 'Purchase 3', 800, 0, '2026-10-15T18:00:00')

state = computeAccountState(db, acc6, new Date('2026-10-20'))
assert(state.ar === 2700, `Multiple spots same day should all apply: 5000 - 1000 - 500 - 800 = 2700, got ${state.ar}`)

console.log('=== Test 7: Very large amounts (precision) ===')
const acc7 = createAccount(db, 'Large amounts', '2026-10-01').lastInsertRowid
const stream7 = createRegularDeposit(db, acc7, 'Big income', '2026-10-01').lastInsertRowid
createRegularDepositRate(db, stream7, 9999999.99, '2026-10', '2026-10-01')
createOneTimeDeposit(db, acc7, 5555555.55, '2026-10-01', 'Large deposit', '2026-10-01')

state = computeAccountState(db, acc7, new Date('2026-10-20'))
assert(state.ar === 9999999.99, `Large AR precision: got ${state.ar}`)
assert(state.cashFlow === 5555555.55, `Large cash precision: got ${state.cashFlow}`)

console.log('=== Test 8: Overall state with multiple accounts ===')
const overall = computeOverallState(db, new Date('2026-10-20'))
assert(overall.accounts.length >= 7, `Should have all test accounts: got ${overall.accounts.length}`)
const totalAR = overall.accounts.reduce((sum, acc) => sum + acc.ar, 0)
const totalCash = overall.accounts.reduce((sum, acc) => sum + acc.cashFlow, 0)
assert(overall.ar === totalAR, `Overall AR should sum accounts: ${overall.ar} vs ${totalAR}`)
assert(overall.cashFlow === totalCash, `Overall cash should sum accounts: ${overall.cashFlow} vs ${totalCash}`)

console.log('\n=== All edge case tests passed ===')
