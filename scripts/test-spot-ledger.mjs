import { computeAccountState, monthKey } from '../src/main/ledger.ts'
import { createTestDb, createAccount, createRegularDeposit, createRegularDepositRate, createOneTimeDeposit, createSpot } from './test-helpers.mjs'
import { queries } from '../src/main/queries.ts'

const db = createTestDb()

const now = new Date().toISOString()
const accountId = createAccount(db, 'Test', now).lastInsertRowid

// Scenario 1: Spot paid from regular AR reduces current month AR
console.log('=== Test 1: Spot from regular reduces current AR ===')
db.prepare(queries.deleteRegularDeposits).run()
db.prepare(queries.deleteRegularDepositRates).run()
db.prepare(queries.deleteSpots).run()
db.prepare(queries.deleteOneTimeDeposits).run()

const regularId = createRegularDeposit(db, accountId, 'Salary', now).lastInsertRowid
createRegularDepositRate(db, regularId, 5000, '2026-10', now)

let state = computeAccountState(db, accountId, new Date('2026-10-15'))
console.log('Before spot: AR =', state.ar, '(expected 5000)')
if (state.ar !== 5000) throw new Error('AR should be 5000 before spot')

createSpot(db, accountId, 1000, '2026-10-10', 'Purchase', 1000, 0, now)

state = computeAccountState(db, accountId, new Date('2026-10-15'))
console.log('After spot: AR =', state.ar, '(expected 4000)')
if (state.ar !== 4000) throw new Error('AR should be 4000 after consuming 1000 via spot')
console.log('✓ Spot from regular reduces current AR')

// Scenario 2: Spot from regular in past month reduces realized cash when month settles
console.log('\n=== Test 2: Spot from regular reduces realized cash at settlement ===')
db.prepare(queries.deleteSpots).run()
createSpot(db, accountId, 1000, '2026-10-10', 'Purchase', 1000, 0, now)

state = computeAccountState(db, accountId, new Date('2026-11-15'))
console.log('November cash flow =', state.cashFlow, '(expected 4000)')
console.log('November AR =', state.ar, '(expected 5000)')
if (state.cashFlow !== 4000)
  throw new Error(
    'Cash flow should be 4000 (5000 salary - 1000 spot from October regular, settled in November)'
  )
if (state.ar !== 5000) throw new Error('AR should be 5000 (new November accrual, no spot yet)')
console.log('✓ Spot from regular reduces realized cash at settlement')

// Scenario 3: Spot from one-time reduces one-time cash immediately
console.log('\n=== Test 3: Spot from one-time reduces cash immediately ===')
db.prepare(queries.deleteSpots).run()
db.prepare(queries.deleteOneTimeDeposits).run()
db.prepare(queries.deleteRegularDepositRates).run()
db.prepare(queries.deleteRegularDeposits).run()

createOneTimeDeposit(db, accountId, 10000, '2026-10-01', 'Bonus', now)

state = computeAccountState(db, accountId, new Date('2026-10-05'))
console.log('Before spot: cash flow =', state.cashFlow, '(expected 10000)')
if (state.cashFlow !== 10000) throw new Error('Cash flow should be 10000 before spot')

createSpot(db, accountId, 3000, '2026-10-03', 'Purchase', 0, 3000, now)

state = computeAccountState(db, accountId, new Date('2026-10-05'))
console.log('After spot: cash flow =', state.cashFlow, '(expected 7000)')
if (state.cashFlow !== 7000) throw new Error('Cash flow should be 7000 after spot consumes 3000')
console.log('✓ Spot from one-time reduces cash immediately')

// Scenario 4: Hybrid payment (regular + one-time)
console.log('\n=== Test 4: Hybrid payment (regular + one-time) ===')
db.prepare(queries.deleteSpots).run()
db.prepare('DELETE FROM one_time_deposits').run()
db.prepare('DELETE FROM regular_deposit_rates').run()
db.prepare('DELETE FROM regular_deposits').run()

const regId2 = db
  .prepare('INSERT INTO regular_deposits (account_id, name, created_at) VALUES (?, ?, ?)')
  .run(accountId, 'Salary', now).lastInsertRowid
db.prepare(
  'INSERT INTO regular_deposit_rates (regular_deposit_id, amount, effective_from_month, created_at) VALUES (?, ?, ?, ?)'
).run(regId2, 2000, '2026-10', now)

db.prepare(
  'INSERT INTO one_time_deposits (account_id, amount, date, description, created_at) VALUES (?, ?, ?, ?, ?)'
).run(accountId, 5000, '2026-10-01', 'Bonus', now)

state = computeAccountState(db, accountId, new Date('2026-10-05'))
console.log('Before spot: AR =', state.ar, 'cash =', state.cashFlow)
if (state.ar !== 2000) throw new Error('AR should be 2000')
if (state.cashFlow !== 5000) throw new Error('Cash should be 5000')

// Spot for 3000: 2000 from regular AR, 1000 from one-time cash
db.prepare(
  'INSERT INTO spots (account_id, amount, date, description, payment_from_regular, payment_from_onetime, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
).run(accountId, 3000, '2026-10-03', 'Big purchase', 2000, 1000, now)

state = computeAccountState(db, accountId, new Date('2026-10-05'))
console.log('After hybrid spot: AR =', state.ar, 'cash =', state.cashFlow)
if (state.ar !== 0) throw new Error('AR should be 0 (2000 consumed by spot)')
if (state.cashFlow !== 4000) throw new Error('Cash should be 4000 (5000 - 1000)')
console.log('✓ Hybrid payment works correctly')

// Scenario 5: Multiple spots accumulate
console.log('\n=== Test 5: Multiple spots accumulate correctly ===')
db.prepare('DELETE FROM spots').run()
db.prepare(
  'INSERT INTO spots (account_id, amount, date, description, payment_from_regular, payment_from_onetime, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
).run(accountId, 500, '2026-10-02', 'Spot 1', 500, 0, now)
db.prepare(
  'INSERT INTO spots (account_id, amount, date, description, payment_from_regular, payment_from_onetime, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
).run(accountId, 300, '2026-10-03', 'Spot 2', 300, 0, now)
db.prepare(
  'INSERT INTO spots (account_id, amount, date, description, payment_from_regular, payment_from_onetime, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
).run(accountId, 200, '2026-10-04', 'Spot 3', 0, 200, now)

state = computeAccountState(db, accountId, new Date('2026-10-05'))
console.log('After 3 spots: AR =', state.ar, 'cash =', state.cashFlow)
if (state.ar !== 1200) throw new Error('AR should be 1200 (2000 - 500 - 300)')
if (state.cashFlow !== 4800) throw new Error('Cash should be 4800 (5000 - 200)')
console.log('✓ Multiple spots accumulate correctly')

// Scenario 6: Negative spot (income/refund)
console.log('\n=== Test 6: Negative spot (income) ===')
db.prepare('DELETE FROM spots').run()
db.prepare(
  'INSERT INTO spots (account_id, amount, date, description, payment_from_regular, payment_from_onetime, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
).run(accountId, -500, '2026-10-02', 'Refund', -500, 0, now)

state = computeAccountState(db, accountId, new Date('2026-10-05'))
console.log('After negative spot: AR =', state.ar, 'cash =', state.cashFlow)
if (state.ar !== 2500) throw new Error('AR should be 2500 (2000 - (-500))')
console.log('✓ Negative spot increases AR')

console.log('\n=== All spot ledger tests passed ===')
