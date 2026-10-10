import type Database from 'better-sqlite3'
import { queries } from './queries.ts'

export interface RateRow {
  amount: number
  effective_from_month: string
}

export type StreamStatus = 'not_started' | 'accruing'

export interface StreamState {
  id: number
  name: string
  status: StreamStatus
  monthAmount: number
}

export interface AccountState {
  accountId: number
  cashFlow: number
  ar: number
  oneTimeTotal: number
  regularRealizedTotal: number
  streams: StreamState[]
}

export function monthKey(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

function monthToIndex(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return y * 12 + (m - 1)
}

export function compareMonthKey(a: string, b: string): number {
  return monthToIndex(a) - monthToIndex(b)
}

export function effectiveRateForMonth(rates: RateRow[], month: string): number | null {
  let best: RateRow | null = null
  for (const rate of rates) {
    if (compareMonthKey(rate.effective_from_month, month) <= 0) {
      if (!best || compareMonthKey(rate.effective_from_month, best.effective_from_month) > 0) {
        best = rate
      }
    }
  }
  return best ? best.amount : null
}

export function realizedFromRegular(rates: RateRow[], asOfMonth: string): number {
  if (rates.length === 0) return 0
  const sorted = [...rates].sort((a, b) => compareMonthKey(a.effective_from_month, b.effective_from_month))
  const streamStart = sorted[0].effective_from_month
  if (compareMonthKey(streamStart, asOfMonth) >= 0) return 0

  let total = 0
  for (let i = 0; i < sorted.length; i++) {
    const segmentStart = sorted[i].effective_from_month
    const segmentEnd = i + 1 < sorted.length ? sorted[i + 1].effective_from_month : asOfMonth
    const rangeStart = compareMonthKey(segmentStart, streamStart) > 0 ? segmentStart : streamStart
    const effectiveEnd = compareMonthKey(segmentEnd, asOfMonth) < 0 ? segmentEnd : asOfMonth
    const monthsInSegment = monthToIndex(effectiveEnd) - monthToIndex(rangeStart)
    if (monthsInSegment > 0) {
      total += monthsInSegment * sorted[i].amount
    }
  }
  return total
}

export function arFromRegular(rates: RateRow[], asOfMonth: string): number {
  const rate = effectiveRateForMonth(rates, asOfMonth)
  return rate ?? 0
}

interface StreamRow {
  id: number
  name: string
}

export function computeAccountState(
  db: Database.Database,
  accountId: number,
  asOfDate: Date
): AccountState {
  const asOfMonth = monthKey(asOfDate)
  const asOfDateStr = asOfDate.toISOString().slice(0, 10)

  const oneTimeTotal = (
    db.prepare(queries.selectOneTimeDepositsTotal).get(accountId, asOfDateStr) as { total: number }
  ).total

  const streamRows = db.prepare(queries.selectRegularDepositsByAccount).all(accountId) as StreamRow[]

  let regularRealizedTotal = 0
  let ar = 0
  const streams: StreamState[] = []

  for (const stream of streamRows) {
    const rates = db
      .prepare(queries.selectRegularDepositRates)
      .all(stream.id) as RateRow[]

    regularRealizedTotal += realizedFromRegular(rates, asOfMonth)
    const currentRate = effectiveRateForMonth(rates, asOfMonth)
    const monthAmount = currentRate ?? 0
    ar += monthAmount

    streams.push({
      id: stream.id,
      name: stream.name,
      status: currentRate === null ? 'not_started' : 'accruing',
      monthAmount
    })
  }

  // Deduct spots: spots reduce AR (payment_from_regular) and one-time cash (payment_from_onetime)
  const spotRows = db
    .prepare(queries.selectSpotsBeforeDate)
    .all(accountId, asOfDateStr) as { payment_from_regular: number; payment_from_onetime: number }[]

  let totalSpotFromRegular = 0
  let totalSpotFromOnetime = 0
  for (const spot of spotRows) {
    totalSpotFromRegular += spot.payment_from_regular
    totalSpotFromOnetime += spot.payment_from_onetime
  }

  // Spots paid from regular this month reduce current AR
  const spotsFromRegularThisMonth = (
    db
      .prepare(queries.selectSpotsForMonth2)
      .get(accountId, asOfMonth + '-01', asOfDateStr) as { total: number }
  ).total

  ar -= spotsFromRegularThisMonth

  // Spots paid from regular in past months reduce realized total (they consumed AR at settlement time)
  const spotsFromRegularBeforeThisMonth = totalSpotFromRegular - spotsFromRegularThisMonth
  regularRealizedTotal -= spotsFromRegularBeforeThisMonth

  // Spots paid from one-time reduce one-time total
  const adjustedOneTimeTotal = oneTimeTotal - totalSpotFromOnetime

  return {
    accountId,
    cashFlow: adjustedOneTimeTotal + regularRealizedTotal,
    ar,
    oneTimeTotal: adjustedOneTimeTotal,
    regularRealizedTotal,
    streams
  }
}

export interface OverallState {
  cashFlow: number
  ar: number
  accounts: AccountState[]
}

export function computeOverallState(db: Database.Database, asOfDate: Date): OverallState {
  const accountRows = db.prepare(queries.selectAllAccountIds).all() as { id: number }[]
  const accounts = accountRows.map((row) => computeAccountState(db, row.id, asOfDate))
  return {
    cashFlow: accounts.reduce((sum, a) => sum + a.cashFlow, 0),
    ar: accounts.reduce((sum, a) => sum + a.ar, 0),
    accounts
  }
}
