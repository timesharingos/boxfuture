import { getLang } from "./i18n";

const EN_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const MONTH_NAMES = [
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
];

export function yuan(cents: number): string {
  const neg = cents < 0;
  const v = Math.abs(cents);
  const s = (v / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${neg ? "-" : ""}¥${s}`;
}

export function yuanSigned(cents: number): string {
  if (cents === 0) return yuan(0);
  return `${cents > 0 ? "+" : ""}${yuan(cents)}`;
}

export function parseYuan(input: string): number {
  const cleaned = input.replace(/[^\d.-]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function monthLabel(m: string): string {
  const [y, mo] = m.split("-");
  const n = Number(mo);
  if (getLang() === "en") return `${EN_MONTHS[(n - 1) % 12]} ${y}`;
  return `${y}年${n}月`;
}

export function shortMonth(m: string): string {
  const [, mo] = m.split("-");
  const n = Number(mo);
  if (getLang() === "en") return EN_MONTHS[(n - 1) % 12];
  return `${n}月`;
}

export function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function currentMonthStr(): string {
  return todayStr().slice(0, 7);
}

/** 是否属于未来月份（用于「预测」标记） */
export function isFutureMonth(m: string): boolean {
  return m > currentMonthStr();
}

export function addMonths(m: string, delta: number): string {
  const [y, mo] = m.split("-").map(Number);
  const total = y * 12 + (mo - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export function pct(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

const KIND_LABEL: Record<string, string> = {
  spot: "现货",
  futures_order: "期货订单",
  futures_payment: "尾款支付",
  futures_settle: "尾款核销",
  futures_rollover: "展期",
  futures_cancel: "取消订单",
  accrual: "计提",
  accrual_settle: "计提核销",
  transfer: "账户转账",
  income: "收入",
  reversal: "冲销",
  opening: "期初",
  period_close: "月结",
  freeze: "冻结",
  budget_receivable: "规律预算",
  budget_realize: "预算兑现",
  budget_unrealize: "兑现撤回",
};

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

const STATUS_LABEL: Record<string, string> = {
  normal: "正常",
  reversed: "已冲销",
  partially_reversed: "部分冲销",
  settled: "已核销",
  estimated: "计提中",
  void: "已作废",
  superseded: "已被重结覆盖",
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

const OBLIGATION_STATUS: Record<string, string> = {
  pending: "待付",
  paid: "已付",
  settled: "已核销",
  cancelled: "已取消",
  frozen: "已冻结",
};

export function obligationStatusLabel(s: string): string {
  return OBLIGATION_STATUS[s] ?? s;
}

export function poolLabel(pool: string | null | undefined): string {
  if (pool === "recurring") return "规律";
  if (pool === "oneoff") return "一次性";
  return "—";
}

const ACCOUNT_KIND: Record<string, string> = {
  bank: "银行卡",
  cash: "现金",
  reserve: "储备",
  investment: "投资",
  credit: "信用",
};

export function accountKindLabel(kind: string): string {
  return ACCOUNT_KIND[kind] ?? kind;
}

export function fieldLabel(key: string): string {
  const map: Record<string, string> = {
    title: "项目",
    reason: "消费理由",
    urgency: "时效性",
    market_price: "市场均价",
    expected_effect: "预期使用效果",
    usage_months: "使用时长(月)",
    necessity: "采购必要性",
    purpose: "预期目的",
  };
  return map[key] ?? key;
}

export function cls(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
