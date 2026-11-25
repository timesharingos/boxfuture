import { invoke } from "@tauri-apps/api/core";
import type {
  AccountView,
  Bootstrap,
  BudgetRow,
  CapacityReport,
  CashReport,
  RealizeReport,  ClosedPeriod,
  CreatedEvent,
  EventDetail,
  EventView,
  ForwardRow,
  HabitReport,
  Obligation,
  OrderLineInput,
  PnlReport,
  Pool,
  QuotaGrant,
  QuotaPoint,
  TagRuleView,
} from "./types";

export interface AppErrorPayload {
  code: string;
  message: string;
}

const NO_TAURI: AppErrorPayload = {
  code: "no_tauri",
  message:
    "当前不在桌面应用中运行：浏览器里只能预览界面，记账功能需要在 boxfuture 窗口里使用。",
};

/** 浏览器里预览时没有 Tauri 运行时，给出可读的错误而不是 "reading 'invoke'" */
function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return Promise.reject(NO_TAURI);
  }
  return invoke<T>(cmd, args);
}

export function errorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) {
    return String((e as AppErrorPayload).message);
  }
  return String(e);
}

export const api = {
  bootstrap: () => call<Bootstrap>("bootstrap"),
  refreshPeriods: () => call<ClosedPeriod[]>("refresh_periods"),
  closeMonth: (month: string) => call<ClosedPeriod>("close_month", { month }),
  reopenMonth: (month: string) => call<void>("reopen_month", { month }),

  listEvents: (p: {
    fromMonth?: string;
    toMonth?: string;
    accountId?: string;
    kind?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => call<EventView[]>("list_events", p),
  eventDetail: (id: string) => call<EventDetail>("event_detail", { id }),
  quotaGrants: (fromMonth: string, toMonth: string) =>
    call<QuotaGrant[]>("quota_grants", { fromMonth, toMonth }),
  quotaHistory: (accountId: string) =>
    call<QuotaPoint[]>("quota_history", { accountId }),

  createSpot: (input: Record<string, unknown>) =>
    call<CreatedEvent>("create_spot", { input }),
  createFutures: (input: Record<string, unknown>) =>
    call<CreatedEvent>("create_futures", { input }),
  createAccrual: (input: Record<string, unknown>) =>
    call<CreatedEvent>("create_accrual", { input }),
  settleAccrual: (obligationId: string, input: Record<string, unknown>) =>
    call<CreatedEvent>("settle_accrual", { obligationId, input }),
  createTransfer: (input: Record<string, unknown>) =>
    call<CreatedEvent>("create_transfer", { input }),
  createIncome: (input: Record<string, unknown>) =>
    call<CreatedEvent>("create_income", { input }),
  createOpening: (input: Record<string, unknown>) =>
    call<CreatedEvent>("create_opening", { input }),
  createRealize: (input: Record<string, unknown>) =>
    call<CreatedEvent>("create_realize", { input }),
  undoRealize: (eventId: string) => call<CreatedEvent>("undo_realize", { eventId }),
  reportRealization: (from: string, to: string) =>
    call<RealizeReport>("report_realization", { from, to }),
  reverse: (input: Record<string, unknown>) =>
    call<CreatedEvent>("reverse", { input }),

  payObligation: (obligationId: string, amount: number, date: string, note?: string) =>
    call<CreatedEvent>("pay_obligation", { obligationId, amount, date, note }),
  settleObligation: (obligationId: string, newAmount: number, date: string, note?: string) =>
    call<CreatedEvent>("settle_obligation", { obligationId, newAmount, date, note }),
  rolloverObligation: (obligationId: string, newMonth: string, date: string, note?: string) =>
    call<CreatedEvent>("rollover_obligation", { obligationId, newMonth, date, note }),
  cancelFutures: (
    orderEventId: string,
    reasonKind: string,
    refund: number,
    date: string,
    note?: string,
  ) => call<CreatedEvent>("cancel_futures", { orderEventId, reasonKind, refund, date, note }),
  freezeObligation: (obligationId: string, frozen: boolean, date: string, note?: string) =>
    call<CreatedEvent>("freeze_obligation", { obligationId, frozen, date, note }),
  listObligations: (includeDone = false, kind?: string) =>
    call<Obligation[]>("list_obligations", { includeDone, kind }),

  createAccount: (input: Record<string, unknown>) => call<string>("create_account", { input }),
  updateAccount: (p: {
    id: string;
    name?: string;
    kind?: string;
    note?: string;
    sort?: number;
  }) => call<void>("update_account", p),
  setAccountArchived: (id: string, archived: boolean) =>
    call<void>("set_account_archived", { id, archived }),
  setQuota: (accountId: string, month: string, amount: number) =>
    call<string>("set_quota", { accountId, month, amount }),
  accounts: (month?: string) => call<AccountView[]>("accounts", { month }),
  tagRules: (accountId?: string, month?: string) =>
    call<TagRuleView[]>("tag_rules", { accountId, month }),

  reportPnl: (from: string, to: string) => call<PnlReport>("report_pnl", { from, to }),
  reportCash: (from: string, to: string) => call<CashReport>("report_cash", { from, to }),
  reportBudget: (month: string) => call<BudgetRow[]>("report_budget", { month }),
  reportForward: (months: number, fromMonth?: string) =>
    call<ForwardRow[]>("report_forward", { months, fromMonth }),
  reportHabit: (months: number, toMonth?: string) =>
    call<HabitReport>("report_habit", { months, toMonth }),
  reportCapacity: (month?: string) => call<CapacityReport>("report_capacity", { month }),

  saveSetting: (key: string, value: string) => call<void>("save_setting", { key, value }),
  addAttachment: (eventId: string, sourcePath: string) =>
    call<{ id: string; fileName: string; size: number }>("add_attachment", {
      eventId,
      sourcePath,
    }),
  openAttachment: (storedName: string) => call<void>("open_attachment", { storedName }),
  backupDatabase: (dest: string) => call<string>("backup_database", { dest }),
};

export type { OrderLineInput, Pool };
