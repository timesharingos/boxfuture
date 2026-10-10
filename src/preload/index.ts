import { contextBridge, ipcRenderer } from 'electron'

const ledger = {
  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    create: (args: { name: string }) => ipcRenderer.invoke('accounts:create', args)
  },
  oneTimeDeposits: {
    create: (args: { accountId: number; amount: number; date: string; description: string }) =>
      ipcRenderer.invoke('oneTimeDeposits:create', args),
    listForMonth: (args: { accountId: number; month: string }) =>
      ipcRenderer.invoke('oneTimeDeposits:listForMonth', args)
  },
  regularDeposits: {
    create: (args: { accountId: number; name: string; amount: number }) =>
      ipcRenderer.invoke('regularDeposits:create', args),
    changeRate: (args: { regularDepositId: number; amount: number }) =>
      ipcRenderer.invoke('regularDeposits:changeRate', args),
    listForAccount: (args: { accountId: number }) =>
      ipcRenderer.invoke('regularDeposits:listForAccount', args)
  },
  compute: {
    accountState: (args: { accountId: number; asOfDate: string }) =>
      ipcRenderer.invoke('compute:accountState', args),
    overallState: (args: { asOfDate: string }) =>
      ipcRenderer.invoke('compute:overallState', args)
  }
}

const api = {
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  },
  ledger
}

contextBridge.exposeInMainWorld('api', api)
