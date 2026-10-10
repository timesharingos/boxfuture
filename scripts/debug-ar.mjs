import Database from 'better-sqlite3'
import { computeAccountState } from '../src/main/ledger.ts'

const db = new Database('C:\\Users\\luobo\\AppData\\Roaming\\boxfutures\\data.db')

console.log('=== Computing state as of 2026-10-31 ===')
const state = computeAccountState(db, 1, new Date('2026-10-31T23:59:59Z'))

console.log('Cash flow:', state.cashFlow)
console.log('AR:', state.ar)
console.log('One-time total:', state.oneTimeTotal)
console.log('Regular realized:', state.regularRealizedTotal)
console.log('Streams:', state.streams)

console.log('\n=== Manual calculation ===')
console.log('Regular deposit rate for 2026-10:', 5000)
console.log('Spots from regular this month:',
  db.prepare("SELECT COALESCE(SUM(payment_from_regular), 0) AS total FROM spots WHERE account_id = 1 AND date >= '2026-10-01' AND date <= '2026-10-31'").get()
)
console.log('Expected AR: 5000 - 5000 = 0')

db.close()
