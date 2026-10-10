import { computeAccountState } from '../src/main/ledger.ts'
import { createTestDb, assert, createAccount, createRegularDeposit, createRegularDepositRate } from './test-helpers.mjs'

console.log('=== Property Test 1: Idempotence of rate change in same month ===')
// Creating the same rate change multiple times should produce the same result

const db1 = createTestDb()

const acc1 = createAccount(db1, 'Test', '2026-10-01').lastInsertRowid
const stream1 = createRegularDeposit(db1, acc1, 'Salary', '2026-10-01').lastInsertRowid
createRegularDepositRate(db1, stream1, 5000, '2026-10', '2026-10-01')

// First rate change to 6000 effective in 2026-11
createRegularDepositRate(db1, stream1, 6000, '2026-11', '2026-10-15')

const state1_oct = computeAccountState(db1, acc1, new Date('2026-10-20'))
const state1_nov = computeAccountState(db1, acc1, new Date('2026-11-15'))

// Idempotent operation: Insert the same rate change again (should be ignored or have no additional effect)
createRegularDepositRate(db1, stream1, 6000, '2026-11', '2026-10-16')

const state2_oct = computeAccountState(db1, acc1, new Date('2026-10-20'))
const state2_nov = computeAccountState(db1, acc1, new Date('2026-11-15'))

assert(state1_oct.ar === state2_oct.ar, `October AR should be unchanged after duplicate rate change: ${state1_oct.ar} vs ${state2_oct.ar}`)
assert(state1_nov.ar === state2_nov.ar, `November AR should be unchanged after duplicate rate change: ${state1_nov.ar} vs ${state2_nov.ar}`)
assert(state1_oct.cashFlow === state2_oct.cashFlow, `October cash should be unchanged: ${state1_oct.cashFlow} vs ${state2_oct.cashFlow}`)
assert(state1_nov.cashFlow === state2_nov.cashFlow, `November cash should be unchanged: ${state1_nov.cashFlow} vs ${state2_nov.cashFlow}`)

console.log('Idempotence verified: Multiple rate changes to same value produce same result')

console.log('\n=== Property Test 2: History invariance under future modifications ===')
// Changes made in future months must not affect historical data

const db2 = createTestDb()

const acc2 = createAccount(db2, 'History Test', '2026-10-01').lastInsertRowid
const stream2 = createRegularDeposit(db2, acc2, 'Income', '2026-10-01').lastInsertRowid
createRegularDepositRate(db2, stream2, 5000, '2026-10', '2026-10-01')

// Capture October state before any future changes
const oct_before = computeAccountState(db2, acc2, new Date('2026-10-20'))
console.log(`October state before future changes: AR=${oct_before.ar}, Cash=${oct_before.cashFlow}`)

// Make a rate change in October that takes effect in November
createRegularDepositRate(db2, stream2, 7000, '2026-11', '2026-10-15')

// Verify November reflects the change
const nov_after_change = computeAccountState(db2, acc2, new Date('2026-11-15'))
console.log(`November state after change: AR=${nov_after_change.ar}, Cash=${nov_after_change.cashFlow}`)
assert(nov_after_change.ar === 7000, `November AR should reflect new rate: expected 7000, got ${nov_after_change.ar}`)

// Now make another rate change in November that takes effect in December
createRegularDepositRate(db2, stream2, 9000, '2026-12', '2026-11-10')

// Verify December reflects the second change
const dec_after_change = computeAccountState(db2, acc2, new Date('2026-12-15'))
console.log(`December state after second change: AR=${dec_after_change.ar}`)
assert(dec_after_change.ar === 9000, `December AR should reflect newest rate: expected 9000, got ${dec_after_change.ar}`)

// Travel back to October - it should be completely unchanged
const oct_after = computeAccountState(db2, acc2, new Date('2026-10-20'))
console.log(`October state after all future changes: AR=${oct_after.ar}, Cash=${oct_after.cashFlow}`)
assert(oct_after.ar === oct_before.ar, `October AR must be unchanged by future modifications: ${oct_before.ar} vs ${oct_after.ar}`)
assert(oct_after.cashFlow === oct_before.cashFlow, `October cash must be unchanged by future modifications: ${oct_before.cashFlow} vs ${oct_after.cashFlow}`)

// Travel back to November - it should reflect only the first change, not the second
const nov_after_all = computeAccountState(db2, acc2, new Date('2026-11-15'))
console.log(`November state after December change: AR=${nov_after_all.ar}`)
assert(nov_after_all.ar === 7000, `November AR must be unchanged by December's change: expected 7000, got ${nov_after_all.ar}`)

console.log('History invariance verified: Future modifications do not affect past states')

console.log('\n=== Property Test 3: Time-travel consistency ===')
// Viewing any historical month multiple times should always return the same result

const db3 = createTestDb()

const acc3 = createAccount(db3, 'Consistency', '2026-09-01').lastInsertRowid
const stream3 = createRegularDeposit(db3, acc3, 'Monthly', '2026-10-01').lastInsertRowid
createRegularDepositRate(db3, stream3, 4000, '2026-10', '2026-10-01')
const { createOneTimeDeposit: createOneTimeDeposit3, createSpot: createSpot3 } = await import('./test-helpers.mjs')
createOneTimeDeposit3(db3, acc3, 10000, '2026-10-05', 'Bonus', '2026-10-05')
createSpot3(db3, acc3, 1500, '2026-10-10', 'Purchase', stream3, 0, '2026-10-10')

// Add future rate change
createRegularDepositRate(db3, stream3, 5500, '2026-11', '2026-10-20')

// Simulate time travel: Oct -> Nov -> Dec -> Nov -> Oct -> Dec -> Oct
const visits = [
  new Date('2026-10-25'),
  new Date('2026-11-15'),
  new Date('2026-12-20'),
  new Date('2026-11-15'),
  new Date('2026-10-25'),
  new Date('2026-12-20'),
  new Date('2026-10-25')
]

const snapshots = visits.map(date => ({
  date: date.toISOString().slice(0, 10),
  state: computeAccountState(db3, acc3, date)
}))

// Check October consistency (visits 0, 4, 6)
assert(snapshots[0].state.ar === snapshots[4].state.ar && snapshots[4].state.ar === snapshots[6].state.ar,
  `October AR should be consistent across visits: ${snapshots[0].state.ar}, ${snapshots[4].state.ar}, ${snapshots[6].state.ar}`)
assert(snapshots[0].state.cashFlow === snapshots[4].state.cashFlow && snapshots[4].state.cashFlow === snapshots[6].state.cashFlow,
  `October cash should be consistent: ${snapshots[0].state.cashFlow}, ${snapshots[4].state.cashFlow}, ${snapshots[6].state.cashFlow}`)

// Check November consistency (visits 1, 3)
assert(snapshots[1].state.ar === snapshots[3].state.ar,
  `November AR should be consistent: ${snapshots[1].state.ar} vs ${snapshots[3].state.ar}`)
assert(snapshots[1].state.cashFlow === snapshots[3].state.cashFlow,
  `November cash should be consistent: ${snapshots[1].state.cashFlow} vs ${snapshots[3].state.cashFlow}`)

// Check December consistency (visits 2, 5)
assert(snapshots[2].state.ar === snapshots[5].state.ar,
  `December AR should be consistent: ${snapshots[2].state.ar} vs ${snapshots[5].state.ar}`)
assert(snapshots[2].state.cashFlow === snapshots[5].state.cashFlow,
  `December cash should be consistent: ${snapshots[2].state.cashFlow} vs ${snapshots[5].state.cashFlow}`)

console.log('Time-travel consistency verified: Historical states remain stable regardless of navigation order')

console.log('\n=== All property tests passed ===')
