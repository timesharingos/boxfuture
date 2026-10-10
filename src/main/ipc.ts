import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { computeAccountState, computeOverallState, monthKey, addMonths } from './ledger'
import { queries, createAccount, createOneTimeDeposit, createRegularDeposit, createRegularDepositRate, createSpot } from './queries'

export function registerIpcHandlers(db: Database.Database): void {
  ipcMain.handle('accounts:list', () => {
    return db.prepare(queries.selectAccounts).all()
  })

  ipcMain.handle('accounts:create', (_event, { name }: { name: string }) => {
    const createdAt = new Date().toISOString()
    const result = createAccount(db, name, createdAt)
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
      const result = createOneTimeDeposit(db, accountId, amount, date, description ?? '', createdAt)
      return { id: result.lastInsertRowid as number }
    }
  )

  ipcMain.handle(
    'oneTimeDeposits:listForMonth',
    (_event, { accountId, month }: { accountId: number; month: string }) => {
      return db.prepare(queries.selectOneTimeDepositsForMonth).all(accountId, month)
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
      const result = createRegularDeposit(db, accountId, name, createdAt)
      const regularDepositId = result.lastInsertRowid as number
      createRegularDepositRate(db, regularDepositId, amount, startMonth, createdAt)
      return { id: regularDepositId }
    }
  )

  ipcMain.handle(
    'regularDeposits:changeRate',
    (_event, { regularDepositId, amount }: { regularDepositId: number; amount: number }) => {
      const createdAt = new Date().toISOString()
      const effectiveFromMonth = addMonths(monthKey(new Date()), 1)
      createRegularDepositRate(db, regularDepositId, amount, effectiveFromMonth, createdAt)
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
      const result = createSpot(
        db,
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
      return db.prepare(queries.selectSpotsForMonth).all(accountId, month)
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
