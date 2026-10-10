import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { computeAccountState, computeOverallState, monthKey, addMonths } from './ledger'

export function registerIpcHandlers(db: Database.Database): void {
  ipcMain.handle('accounts:list', () => {
    return db.prepare('SELECT id, name, created_at FROM accounts ORDER BY id ASC').all()
  })

  ipcMain.handle('accounts:create', (_event, { name }: { name: string }) => {
    const createdAt = new Date().toISOString()
    const result = db
      .prepare('INSERT INTO accounts (name, created_at) VALUES (?, ?)')
      .run(name, createdAt)
    return { id: result.lastInsertRowid as number, name, created_at: createdAt }
  })

  ipcMain.handle(
    'oneTimeDeposits:create',
    (
      _event,
      {
        accountId,
        amount,
        date,
        description
      }: { accountId: number; amount: number; date: string; description: string }
    ) => {
      const createdAt = new Date().toISOString()
      const result = db
        .prepare(
          'INSERT INTO one_time_deposits (account_id, amount, date, description, created_at) VALUES (?, ?, ?, ?, ?)'
        )
        .run(accountId, amount, date, description ?? '', createdAt)
      return { id: result.lastInsertRowid as number }
    }
  )

  ipcMain.handle(
    'oneTimeDeposits:listForMonth',
    (_event, { accountId, month }: { accountId: number; month: string }) => {
      return db
        .prepare(
          "SELECT id, amount, date, description, created_at FROM one_time_deposits WHERE account_id = ? AND strftime('%Y-%m', date) = ? ORDER BY date ASC"
        )
        .all(accountId, month)
    }
  )

  ipcMain.handle(
    'regularDeposits:create',
    (
      _event,
      { accountId, name, amount }: { accountId: number; name: string; amount: number }
    ) => {
      const createdAt = new Date().toISOString()
      const startMonth = monthKey(new Date())
      const result = db
        .prepare(
          'INSERT INTO regular_deposits (account_id, name, created_at) VALUES (?, ?, ?)'
        )
        .run(accountId, name, createdAt)
      const regularDepositId = result.lastInsertRowid as number
      db.prepare(
        'INSERT INTO regular_deposit_rates (regular_deposit_id, amount, effective_from_month, created_at) VALUES (?, ?, ?, ?)'
      ).run(regularDepositId, amount, startMonth, createdAt)
      return { id: regularDepositId }
    }
  )

  ipcMain.handle(
    'regularDeposits:changeRate',
    (_event, { regularDepositId, amount }: { regularDepositId: number; amount: number }) => {
      const createdAt = new Date().toISOString()
      const effectiveFromMonth = addMonths(monthKey(new Date()), 1)
      db.prepare(
        'INSERT INTO regular_deposit_rates (regular_deposit_id, amount, effective_from_month, created_at) VALUES (?, ?, ?, ?)'
      ).run(regularDepositId, amount, effectiveFromMonth, createdAt)
      return { effectiveFromMonth }
    }
  )

  ipcMain.handle(
    'regularDeposits:listForAccount',
    (_event, { accountId }: { accountId: number }) => {
      return db
        .prepare('SELECT id, name, created_at FROM regular_deposits WHERE account_id = ? ORDER BY id ASC')
        .all(accountId)
    }
  )

  ipcMain.handle(
    'compute:accountState',
    (_event, { accountId, asOfDate }: { accountId: number; asOfDate: string }) => {
      return computeAccountState(db, accountId, new Date(asOfDate))
    }
  )

  ipcMain.handle('compute:overallState', (_event, { asOfDate }: { asOfDate: string }) => {
    return computeOverallState(db, new Date(asOfDate))
  })

  ipcMain.handle(
    'spots:create',
    (
      _event,
      {
        accountId,
        amount,
        date,
        description,
        paymentFromRegular,
        paymentFromOnetime
      }: {
        accountId: number
        amount: number
        date: string
        description: string
        paymentFromRegular: number
        paymentFromOnetime: number
      }
    ) => {
      const createdAt = new Date().toISOString()
      const result = db
        .prepare(
          'INSERT INTO spots (account_id, amount, date, description, payment_from_regular, payment_from_onetime, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          accountId,
          amount,
          date,
          description ?? '',
          paymentFromRegular,
          paymentFromOnetime,
          createdAt
        )
      return { id: result.lastInsertRowid as number }
    }
  )

  ipcMain.handle(
    'spots:listForMonth',
    (_event, { accountId, month }: { accountId: number; month: string }) => {
      return db
        .prepare(
          "SELECT id, amount, date, description, payment_from_regular, payment_from_onetime, created_at FROM spots WHERE account_id = ? AND strftime('%Y-%m', date) = ? ORDER BY date ASC"
        )
        .all(accountId, month)
    }
  )

  ipcMain.handle(
    'spots:computeAvailablePayment',
    (
      _event,
      { accountId, asOfDate }: { accountId: number; asOfDate: string }
    ): { availableAR: number; availableCash: number } => {
      const state = computeAccountState(db, accountId, new Date(asOfDate))
      return {
        availableAR: state.ar,
        availableCash: state.oneTimeTotal
      }
    }
  )
}
