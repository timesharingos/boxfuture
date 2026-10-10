export interface Account {
  id: number
  name: string
  created_at: string
}

export interface OneTimeDeposit {
  id: number
  amount: number
  date: string
  description: string
  created_at: string
}

export interface RegularDepositSummary {
  id: number
  name: string
  created_at: string
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

export interface OverallState {
  cashFlow: number
  ar: number
  accounts: AccountState[]
}

export interface LedgerApi {
  accounts: {
    list: () => Promise<Account[]>
    create: (args: { name: string }) => Promise<Account>
  }
  oneTimeDeposits: {
    create: (args: {
      accountId: number
      amount: number
      date: string
      description: string
    }) => Promise<{ id: number }>
    listForMonth: (args: { accountId: number; month: string }) => Promise<OneTimeDeposit[]>
  }
  regularDeposits: {
    create: (args: { accountId: number; name: string; amount: number }) => Promise<{ id: number }>
    changeRate: (args: {
      regularDepositId: number
      amount: number
    }) => Promise<{ effectiveFromMonth: string }>
    listForAccount: (args: { accountId: number }) => Promise<RegularDepositSummary[]>
  }
  compute: {
    accountState: (args: { accountId: number; asOfDate: string }) => Promise<AccountState>
    overallState: (args: { asOfDate: string }) => Promise<OverallState>
  }
}

export interface ExposedApi {
  versions: {
    node: string
    chrome: string
    electron: string
  }
  ledger: LedgerApi
}
