export type Pool = "recurring" | "oneoff";

export interface AccountView {
  id: string;
  name: string;
  kind: string;
  currency: string;
  sort: number;
  archived: boolean;
  note: string | null;
  quota: number;
  recurringBalance: number;
  oneoffBalance: number;
}

export interface TagRuleView {
  tag: string;
  label: string;
  minAmount: number;
  maxAmount: number | null;
  monthlyLimit: number | null;
  upgradeTo: string | null;
  requiredFields: string[];
  used: number;
}

export interface EventView {
  id: string;
  seq: number;
  kind: string;
  direction: string;
  accrualDate: string;
  budgetMonth: string;
  cashDate: string | null;
  amount: number;
  cashAmount: number;
  currency: string;
  accountId: string | null;
  accountName: string | null;
  toAccountId: string | null;
  toAccountName: string | null;
  pool: Pool | null;
  toPool: Pool | null;
  tag: string | null;
  tagLabel: string | null;
  counterDelta: number;
  vendorId: string | null;
  vendorName: string | null;
  title: string | null;
  reason: string | null;
  urgency: string | null;
  marketPrice: number | null;
  expectedEffect: string | null;
  usageMonths: number | null;
  necessity: string | null;
  purpose: string | null;
  status: string;
  note: string | null;
  meta: string | null;
  refEventId: string | null;
  obligationId: string | null;
  createdAt: string;
  fxRate: string | null;
  originalAmount: number | null;
}

export interface Obligation {
  id: string;
  eventId: string;
  accountId: string;
  accountName: string | null;
  kind: string;
  dueMonth: string;
  dueDate: string | null;
  amount: number;
  paidAmount: number;
  pool: string | null;
  tag: string | null;
  status: string;
  note: string | null;
  title: string | null;
  vendorName: string | null;
  rollovers: number;
}

export interface PostingView {
  month: string;
  pool: string;
  amount: number;
  kind: string;
}

export interface CashView {
  date: string;
  amount: number;
  kind: string;
}

export interface LineView {
  id: string;
  kind: string;
  name: string;
  qty: number;
  unitPrice: number;
  amount: number;
  currency: string | null;
  note: string | null;
}

export interface AttachmentView {
  id: string;
  fileName: string;
  storedName: string;
  size: number | null;
  createdAt: string;
}

export interface EventDetail {
  event: EventView;
  postings: PostingView[];
  cash: CashView[];
  lines: LineView[];
  obligations: Obligation[];
  related: EventView[];
  attachments: AttachmentView[];
}

export interface CarryoverItem {
  accountId: string;
  accountName: string;
  amount: number;
}

export interface ClosedPeriod {
  month: string;
  items: CarryoverItem[];
  total: number;
  closedAt: string;
}

export interface CurrencyView {
  code: string;
  name: string;
  symbol: string;
  minorUnit: number;
}

export interface VendorView {
  id: string;
  name: string;
}

export interface Bootstrap {
  currentMonth: string;
  today: string;
  accounts: AccountView[];
  tagRules: TagRuleView[];
  settings: Record<string, string>;
  currencies: CurrencyView[];
  vendors: VendorView[];
  autoClosed: ClosedPeriod[];
  currentPeriodClosed: boolean;
  closedMonths: string[];
  dbPath: string;
}

export interface CreatedEvent {
  eventId: string;
  tag: string | null;
  tagUpgraded: boolean;
  warnings: string[];
}

/** 账本里的虚拟行：每月规律预算注入（不落库，只读） */
export interface QuotaGrant {
  accountId: string;
  accountName: string;
  month: string;
  amount: number;
  isFuture: boolean;
}

export interface QuotaPoint {
  month: string;
  amount: number;
}

export interface PnlItem {
  kind: string;
  label: string;
  amount: number;
}
export interface PnlMonth {
  month: string;
  income: number;
  expense: number;
  net: number;
  items: PnlItem[];
}
export interface PnlReport {
  from: string;
  to: string;
  months: PnlMonth[];
  totalIncome: number;
  totalExpense: number;
  totalNet: number;
}

export interface CashMonth {
  month: string;
  inflow: number;
  outflow: number;
  net: number;
}
export interface AccountCash {
  accountId: string;
  accountName: string;
  inflow: number;
  outflow: number;
}
export interface CashReport {
  months: CashMonth[];
  totalInflow: number;
  totalOutflow: number;
  byAccount: AccountCash[];
}

export interface BudgetRow {
  accountId: string;
  accountName: string;
  quota: number;
  recurringUsed: number;
  recurringBalance: number;
  oneoffIn: number;
  oneoffOut: number;
  oneoffBalance: number;
  over: boolean;
}

export interface ForwardItem {
  kind: string;
  title: string;
  accountName: string;
  amount: number;
  status: string;
}
export interface ForwardRow {
  month: string;
  futuresBalance: number;
  accrual: number;
  total: number;
  items: ForwardItem[];
}

export interface HabitMonth {
  month: string;
  orders: number;
  total: number;
  rolled: number;
  cancelled: number;
}
export interface VendorStat {
  vendorName: string;
  orders: number;
  total: number;
  rolled: number;
  cancelled: number;
  avgExtensionDays: number;
}
export interface HabitReport {
  months: HabitMonth[];
  vendors: VendorStat[];
  defaultRate: number;
  avgExtensionDays: number;
  orderCount: number;
  orderTotal: number;
}

export interface CapacityReport {
  oneoffTotal: number;
  recurringTotal: number;
  obligatory12m: number;
  cushion: number;
  available: number;
  byMonth: CashMonth[];
}

export interface OrderLineInput {
  kind: "item" | "fee";
  name: string;
  qty?: number;
  unitPrice?: number;
  amount?: number;
  currency?: string;
  note?: string;
}
