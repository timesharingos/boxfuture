import { t } from "../lib/i18n";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBootstrap, useInvalidateAll } from "../lib/queries";
import { api, errorMessage } from "../lib/ipc";
import { addMonths, currentMonthStr, monthLabel, todayStr, yuan } from "../lib/format";
import type { Pool, TagRuleView } from "../lib/types";
import {
  Button,
  Card,
  Empty,
  Field,
  Input,
  MoneyInput,
  Segmented,
  Select,
  Textarea,
  toast,
} from "../components/ui";
import { cls } from "../lib/format";

type Tab = "spot" | "futures" | "accrual" | "transfer" | "income" | "opening";

const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: "spot", label: "现货", hint: "即时消费或未来一次性" },
  { key: "futures", label: "期货", hint: "定金 + 尾款，锁定未来月" },
  { key: "accrual", label: "计提", hint: "估算占位，后续核销" },
  { key: "transfer", label: "转账", hint: "账户间、池间划转" },
  { key: "income", label: "收入", hint: "外部资金流入" },
  { key: "opening", label: "期初", hint: "账户初始余额" },
];

interface MetaState {
  title: string;
  reason: string;
  urgency: string;
  marketPrice: number;
  expectedEffect: string;
  usageMonths: number;
  necessity: string;
  purpose: string;
}

const EMPTY_META: MetaState = {
  title: "",
  reason: "",
  urgency: "",
  marketPrice: 0,
  expectedEffect: "",
  usageMonths: 0,
  necessity: "",
  purpose: "",
};

const FIELD_LABEL: Record<string, string> = {
  title: "项目",
  reason: "消费理由",
  urgency: "时效性",
  market_price: "市场均价",
  expected_effect: "预期使用效果",
  usage_months: "使用时长(月)",
  necessity: "采购必要性",
  purpose: "预期目的",
};

function TagFields({
  rules,
  amount,
  meta,
  setMeta,
}: {
  rules: TagRuleView[];
  amount: number;
  meta: MetaState;
  setMeta: (m: MetaState) => void;
}) {
  const rule = useMemo(() => {
    let chosen = rules[rules.length - 1];
    for (const r of rules) {
      const upper = r.maxAmount == null || amount < r.maxAmount;
      if (amount >= r.minAmount && upper) {
        chosen = r;
        break;
      }
    }
    return chosen;
  }, [rules, amount]);

  if (!rule) return null;
  const req = rule.requiredFields;

  return (
    <Card className="card-pad space-y-2 border-slate-800">
      <div className="flex items-center justify-between">
        <div className="section-title">
          {t("分级：")}
          <span className="text-sky-300">{t(rule.label)}</span>
          <span className="ml-2 font-normal normal-case tracking-normal text-slate-500">
            {rule.minAmount / 100} ~ {rule.maxAmount == null ? "∞" : rule.maxAmount / 100}
          </span>
        </div>
        {rule.monthlyLimit != null && (
          <span className="text-[11px] text-amber-400">
            {t("本月已用 {{a}}/{{b}}", { a: rule.used, b: rule.monthlyLimit })}
            {rule.used + 1 > rule.monthlyLimit && ` · ${t("本次将升级为中等")}`}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t(FIELD_LABEL.title)} required={req.includes("title")}>
          <Input
            value={meta.title}
            placeholder={t("买的是什么")}
            onChange={(e) => setMeta({ ...meta, title: e.target.value })}
          />
        </Field>
        {req.includes("reason") && (
          <Field label={t(FIELD_LABEL.reason)} required>
            <Input
              value={meta.reason}
              onChange={(e) => setMeta({ ...meta, reason: e.target.value })}
            />
          </Field>
        )}
        {req.includes("urgency") && (
          <Field label={t(FIELD_LABEL.urgency)} required>
            <Input
              value={meta.urgency}
              placeholder={t("是否急用 / 能等多久")}
              onChange={(e) => setMeta({ ...meta, urgency: e.target.value })}
            />
          </Field>
        )}
        {req.includes("market_price") && (
          <Field label={t(FIELD_LABEL.market_price)} required>
            <MoneyInput
              value={meta.marketPrice}
              onChange={(v) => setMeta({ ...meta, marketPrice: v })}
            />
          </Field>
        )}
        {req.includes("expected_effect") && (
          <Field label={t(FIELD_LABEL.expected_effect)} required>
            <Input
              value={meta.expectedEffect}
              onChange={(e) => setMeta({ ...meta, expectedEffect: e.target.value })}
            />
          </Field>
        )}
        {req.includes("usage_months") && (
          <Field label={t(FIELD_LABEL.usage_months)} required>
            <Input
              type="number"
              value={meta.usageMonths || ""}
              onChange={(e) => setMeta({ ...meta, usageMonths: Number(e.target.value) || 0 })}
            />
          </Field>
        )}
        {req.includes("necessity") && (
          <Field label={t(FIELD_LABEL.necessity)} required>
            <Input
              value={meta.necessity}
              onChange={(e) => setMeta({ ...meta, necessity: e.target.value })}
            />
          </Field>
        )}
        {req.includes("purpose") && (
          <Field label={t(FIELD_LABEL.purpose)} required>
            <Input
              value={meta.purpose}
              onChange={(e) => setMeta({ ...meta, purpose: e.target.value })}
            />
          </Field>
        )}
      </div>
    </Card>
  );
}

function PoolPicker({ value, onChange }: { value: Pool; onChange: (p: Pool) => void }) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={[
        { value: "recurring", label: t("规律预算") },
        { value: "oneoff", label: t("一次性预算") },
      ]}
    />
  );
}

function AccountSelect({
  value,
  onChange,
  accounts,
}: {
  value: string;
  onChange: (v: string) => void;
  accounts: { id: string; name: string }[];
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t("选择账户…")}</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </Select>
  );
}

export default function NewEntry() {
  const boot = useBootstrap();
  const [tab, setTab] = useState<Tab>("spot");
  const accounts = (boot.data?.accounts ?? []).filter((a) => !a.archived);
  const rules = boot.data?.tagRules ?? [];

  return (
    <div className="grid grid-cols-3 gap-5">
      <div className="col-span-2 space-y-3">
        <div className="flex gap-1">
          {TABS.map((tabItem) => (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key)}
              className={cls(
                "rounded-md border px-3 py-1.5 text-left transition-colors",
                tab === tabItem.key
                  ? "border-sky-500/40 bg-sky-500/10"
                  : "border-slate-800 bg-slate-900/40 hover:border-slate-700",
              )}
            >
              <div
                className={cls(
                  "text-[13px] font-medium",
                  tab === tabItem.key ? "text-sky-300" : "text-slate-300",
                )}
              >
                {t(tabItem.label)}
              </div>
              <div className="text-[10px] text-slate-600">{t(tabItem.hint)}</div>
            </button>
          ))}
        </div>

        {accounts.length === 0 ? (
          <Card>
            <Empty
              title={t("请先创建账户")}
              hint={t("到「账户」页添加逻辑账户后才能记账")}
            />
          </Card>
        ) : tab === "spot" ? (
          <SpotForm accounts={accounts} rules={rules} />
        ) : tab === "futures" ? (
          <FuturesForm accounts={accounts} rules={rules} />
        ) : tab === "accrual" ? (
          <AccrualForm accounts={accounts} />
        ) : tab === "transfer" ? (
          <TransferForm accounts={accounts} />
        ) : tab === "income" ? (
          <IncomeForm accounts={accounts} />
        ) : (
          <OpeningForm accounts={accounts} />
        )}
      </div>

      <aside className="space-y-3">
        <Card className="card-pad">
          <div className="section-title mb-2">{t("当前预算")}</div>
          <div className="space-y-2">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-[12px]">
                <span className="text-slate-400">{a.name}</span>
                <span className="num">
                  <span className={a.recurringBalance < 0 ? "text-rose-400" : "text-slate-200"}>
                    {yuan(a.recurringBalance)}
                  </span>
                  <span className="ml-2 text-slate-600">/ {yuan(a.oneoffBalance)}</span>
                </span>
              </div>
            ))}
            <div className="pt-1 text-[10px] text-slate-600">
              {t("左：规律可用 · 右：一次性余额")}
            </div>
          </div>
        </Card>
        <Card className="card-pad text-[11px] leading-relaxed text-slate-500">
          <div className="mb-1 font-medium text-slate-400">{t("规则提示")}</div>
          <div>· {t("必填项未填会直接拒绝保存（硬性阻断）。")}</div>
          <div>· {t("未来月会被预先锁定，影响当月的结转。")}</div>
          <div>· {t("冲销与退款一律回到一次性预算。")}</div>
          <div>· {t("一次性预算不能转回规律预算。")}</div>
        </Card>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 现货
// ---------------------------------------------------------------------------

function SpotForm({
  accounts,
  rules,
}: {
  accounts: { id: string; name: string }[];
  rules: TagRuleView[];
}) {
  const invalidate = useInvalidateAll();
  const navigate = useNavigate();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState(0);
  const [pool, setPool] = useState<Pool>("recurring");
  const [date, setDate] = useState(todayStr());
  const [budgetMonth, setBudgetMonth] = useState("");
  const [tag, setTag] = useState("auto");
  const [meta, setMeta] = useState<MetaState>(EMPTY_META);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const effectiveMonth = budgetMonth || date.slice(0, 7) || currentMonthStr();

  async function submit() {
    if (!accountId) return toast(t("请选择账户"), "error");
    if (amount <= 0) return toast(t("金额必须大于 0"), "error");
    setBusy(true);
    try {
      const res = await api.createSpot({
        accountId,
        amount,
        pool,
        accrualDate: date,
        budgetMonth: effectiveMonth,
        tag,
        title: meta.title || null,
        reason: meta.reason || null,
        urgency: meta.urgency || null,
        marketPrice: meta.marketPrice || null,
        expectedEffect: meta.expectedEffect || null,
        usageMonths: meta.usageMonths || null,
        necessity: meta.necessity || null,
        purpose: meta.purpose || null,
        note: note || null,
      });
      res.warnings.forEach((w) => toast(w, "info"));
      toast(`${t("已记账")}${res.tagUpgraded ? t("（分级已自动升级）") : ""}`, "success");
      invalidate();
      setAmount(0);
      setMeta(EMPTY_META);
      setNote("");
      navigate("/ledger");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Card className="card-pad space-y-3">
        <div className="grid grid-cols-4 gap-3">
          <Field label={t("账户")} required>
            <AccountSelect value={accountId} onChange={setAccountId} accounts={accounts} />
          </Field>
          <Field label={t("金额")} required>
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
          <Field label={t("预算池")}>
            <PoolPicker value={pool} onChange={setPool} />
          </Field>
          <Field label={t("日期")} required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Field
            label={t("预算归属月")}
            hint={t("默认 {{m}}；选择未来月即为「未来现货」，会预先锁定该月预算", {
              m: effectiveMonth,
            })}
          >
            <Input
              type="month"
              value={effectiveMonth}
              onChange={(e) => setBudgetMonth(e.target.value)}
            />
          </Field>
          <Field label={t("分级覆盖")}>
            <Select value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="auto">{t("自动判定")}</option>
              {rules.map((r) => (
                <option key={r.tag} value={r.tag}>
                  {t(r.label)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("备注")} className="col-span-2">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </Card>

      <TagFields rules={rules} amount={amount} meta={meta} setMeta={setMeta} />

      <div className="flex justify-end gap-2">
        <Button variant="primary" onClick={submit} disabled={busy}>
          {busy ? t("保存中…") : t("保存现货")}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 期货
// ---------------------------------------------------------------------------

interface LineRow {
  key: number;
  kind: "item" | "fee";
  name: string;
  qty: number;
  unitPrice: number;
}

let lineKey = 0;
const newLine = (kind: "item" | "fee"): LineRow => ({
  key: ++lineKey,
  kind,
  name: "",
  qty: 1,
  unitPrice: 0,
});

function FuturesForm({
  accounts,
  rules,
}: {
  accounts: { id: string; name: string }[];
  rules: TagRuleView[];
}) {
  const boot = useBootstrap();
  const invalidate = useInvalidateAll();
  const navigate = useNavigate();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [pool, setPool] = useState<Pool>("oneoff");
  const [balanceAccountId, setBalanceAccountId] = useState(accounts[0]?.id ?? "");
  const [balancePool, setBalancePool] = useState<Pool>("oneoff");
  const [date, setDate] = useState(todayStr());
  const [title, setTitle] = useState("");
  const [total, setTotal] = useState(0);
  const [deposit, setDeposit] = useState(0);
  const [balanceMonth, setBalanceMonth] = useState(addMonths(currentMonthStr(), 1));
  const [vendorName, setVendorName] = useState("");
  const [currency, setCurrency] = useState("");
  const [originalTotal, setOriginalTotal] = useState(0);
  const [fxRate, setFxRate] = useState("");
  const [deadline, setDeadline] = useState("");
  const [meta, setMeta] = useState<MetaState>(EMPTY_META);
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<LineRow[]>([]);
  const [busy, setBusy] = useState(false);

  const linesTotal = lines.reduce((s, l) => s + Math.round(l.qty * l.unitPrice), 0);
  const grandTotal = lines.length > 0 ? linesTotal : total;
  const balance = Math.max(0, grandTotal - deposit);

  async function submit() {
    if (!accountId) return toast(t("请选择账户"), "error");
    if (!balanceAccountId) return toast(t("请选择尾款账户"), "error");
    if (grandTotal <= 0) return toast(t("订单总额必须大于 0"), "error");
    if (deposit > grandTotal) return toast(t("定金不能超过总额"), "error");
    setBusy(true);
    try {
      const res = await api.createFutures({
        accountId,
        pool,
        balanceAccountId,
        balancePool,
        total: lines.length > 0 ? null : total,
        deposit,
        accrualDate: date,
        balanceMonth,
        tag: "auto",
        title: title || null,
        vendorName: vendorName || null,
        vendorId: null,
        lines:
          lines.length > 0
            ? lines.map((l) => ({
                kind: l.kind,
                name: l.name,
                qty: l.qty,
                unitPrice: l.unitPrice,
              }))
            : null,
        currency: currency || null,
        fxRate: fxRate || null,
        originalTotal: originalTotal || null,
        orderDeadline: deadline || null,
        reason: meta.reason || null,
        urgency: meta.urgency || null,
        marketPrice: meta.marketPrice || null,
        expectedEffect: meta.expectedEffect || null,
        usageMonths: meta.usageMonths || null,
        necessity: meta.necessity || null,
        purpose: meta.purpose || null,
        note: note || null,
      });
      res.warnings.forEach((w) => toast(w, "info"));
      toast(
        t("订单已建立，尾款 {{x}} 已锁定 {{m}}", {
          x: yuan(balance),
          m: monthLabel(balanceMonth),
        }),
        "success",
      );
      invalidate();
      navigate("/future");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Card className="card-pad space-y-3">
        <div className="grid grid-cols-4 gap-3">
          <Field label={t("定金账户")} required hint={t("定金从哪个账户扣")}>
            <AccountSelect
              value={accountId}
              onChange={(v) => {
                setAccountId(v);
                if (balanceAccountId === accountId) setBalanceAccountId(v);
              }}
              accounts={accounts}
            />
          </Field>
          <Field label={t("定金预算池")}>
            <PoolPicker value={pool} onChange={setPool} />
          </Field>
          <Field label={t("尾款账户")} required hint={t("尾款从哪个账户扣")}>
            <AccountSelect
              value={balanceAccountId}
              onChange={setBalanceAccountId}
              accounts={accounts}
            />
          </Field>
          <Field label={t("尾款预算池")}>
            <PoolPicker value={balancePool} onChange={setBalancePool} />
          </Field>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Field label={t("下单日")} required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t("截单日")}>
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
          <Field label={t("商品名")} required className="col-span-2">
            <Input
              value={title}
              placeholder={t("如：某某 1/7 限定手办")}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Field label={t("供应商 / 会社")} hint={t("可留空，输入后自动建档")} className="col-span-2">
            <Input
              list="vendor-list"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
            />
            <datalist id="vendor-list">
              {(boot.data?.vendors ?? []).map((v) => (
                <option key={v.id} value={v.name} />
              ))}
            </datalist>
          </Field>
          <Field label={t("定金")} hint={t("定金为 0 则全额锁定尾款月")} className="col-span-2">
            <MoneyInput value={deposit} onChange={setDeposit} />
          </Field>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Field
            label={lines.length > 0 ? t("订单总额（由明细汇总）") : t("订单总额")}
            required
          >
            <MoneyInput value={grandTotal} onChange={setTotal} disabled={lines.length > 0} />
          </Field>
          <Field label={t("尾款月")} required hint={t("尾款 {{x}} 将锁定于此月", { x: yuan(balance) })}>
            <Input
              type="month"
              value={balanceMonth}
              onChange={(e) => setBalanceMonth(e.target.value)}
            />
          </Field>
          <Field label={t("原币种")}>
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="">{t("本位币")}</option>
              {(boot.data?.currencies ?? []).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} {c.symbol}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("原币金额 / 汇率")}>
            <div className="flex gap-1">
              <MoneyInput value={originalTotal} onChange={setOriginalTotal} />
              <Input
                className="w-20"
                placeholder={t("汇率")}
                value={fxRate}
                onChange={(e) => setFxRate(e.target.value)}
              />
            </div>
          </Field>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="section-title">{t("商品明细 / 额外费用（可选）")}</span>
            <div className="flex gap-1">
              <Button size="sm" onClick={() => setLines([...lines, newLine("item")])}>
                {t("+ 商品")}
              </Button>
              <Button size="sm" onClick={() => setLines([...lines, newLine("fee")])}>
                {t("+ 费用")}
              </Button>
            </div>
          </div>
          {lines.length === 0 ? (
            <div className="text-[11px] text-slate-600">
              {t("不填明细时以「订单总额」为准；填了明细则由明细求和。")}
            </div>
          ) : (
            <div className="space-y-1">
              {lines.map((l, i) => (
                <div key={l.key} className="flex items-center gap-1">
                  <span className="w-10 text-[11px] text-slate-500">
                    {l.kind === "item" ? t("商品") : t("费用")}
                  </span>
                  <Input
                    className="flex-1"
                    placeholder={l.kind === "item" ? t("名称") : t("运费/手续费")}
                    value={l.name}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i] = { ...l, name: e.target.value };
                      setLines(next);
                    }}
                  />
                  <Input
                    className="w-16 num"
                    type="number"
                    value={l.qty}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i] = { ...l, qty: Number(e.target.value) || 0 };
                      setLines(next);
                    }}
                  />
                  <MoneyInput
                    className="w-28"
                    value={l.unitPrice}
                    onChange={(v) => {
                      const next = [...lines];
                      next[i] = { ...l, unitPrice: v };
                      setLines(next);
                    }}
                  />
                  <span className="w-20 text-right text-[11px] text-slate-500 num">
                    {yuan(Math.round(l.qty * l.unitPrice))}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setLines(lines.filter((x) => x.key !== l.key))}
                  >
                    ×
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <TagFields rules={rules} amount={grandTotal} meta={meta} setMeta={setMeta} />

      <Card className="card-pad">
        <div className="grid grid-cols-3 gap-3 text-[12px]">
          <div>
            <div className="text-slate-500">
              {t("定金（{{a}} · 下单月扣）", {
                a: accounts.find((x) => x.id === accountId)?.name ?? "—",
              })}
            </div>
            <div className="num mt-0.5 text-slate-200">{yuan(deposit)}</div>
          </div>
          <div>
            <div className="text-slate-500">
              {t("尾款（{{a}} · {{m}} 锁定）", {
                a: accounts.find((x) => x.id === balanceAccountId)?.name ?? "—",
                m: monthLabel(balanceMonth),
              })}
            </div>
            <div className="num mt-0.5 text-amber-300">{yuan(balance)}</div>
          </div>
          <div>
            <div className="text-slate-500">{t("备注")}</div>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="primary" onClick={submit} disabled={busy}>
          {busy ? t("保存中…") : t("创建订单")}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 计提 / 转账 / 收入 / 期初
// ---------------------------------------------------------------------------

function AccrualForm({ accounts }: { accounts: { id: string; name: string }[] }) {
  const invalidate = useInvalidateAll();
  const navigate = useNavigate();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState(0);
  const [pool, setPool] = useState<Pool>("oneoff");
  const [date, setDate] = useState(todayStr());
  const [budgetMonth, setBudgetMonth] = useState(currentMonthStr());
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!accountId) return toast(t("请选择账户"), "error");
    if (amount <= 0) return toast(t("金额必须大于 0"), "error");
    setBusy(true);
    try {
      await api.createAccrual({
        accountId,
        amount,
        pool,
        accrualDate: date,
        budgetMonth,
        title: title || null,
        reason: reason || null,
        note: note || null,
      });
      toast(
        t("已计提 {{x}}，锁定 {{m}}", { x: yuan(amount), m: monthLabel(budgetMonth) }),
        "success",
      );
      invalidate();
      navigate("/future");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Card className="card-pad space-y-3">
        <div className="grid grid-cols-4 gap-3">
          <Field label={t("账户")} required>
            <AccountSelect value={accountId} onChange={setAccountId} accounts={accounts} />
          </Field>
          <Field label={t("计提金额")} required>
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
          <Field label={t("预算池")}>
            <PoolPicker value={pool} onChange={setPool} />
          </Field>
          <Field label={t("日期")} required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Field label={t("锁定月份")} required hint={t("可未来月，用于预估运费/关税等")}>
            <Input
              type="month"
              value={budgetMonth}
              onChange={(e) => setBudgetMonth(e.target.value)}
            />
          </Field>
          <Field label={t("项目")} className="col-span-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label={t("备注")}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <Field label={t("计提理由")}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Card>
      <div className="flex justify-end">
        <Button variant="primary" onClick={submit} disabled={busy}>
          {busy ? t("保存中…") : t("保存计提")}
        </Button>
      </div>
    </div>
  );
}

function TransferForm({ accounts }: { accounts: { id: string; name: string }[] }) {
  const invalidate = useInvalidateAll();
  const [from, setFrom] = useState(accounts[0]?.id ?? "");
  const [to, setTo] = useState(accounts[1]?.id ?? accounts[0]?.id ?? "");
  const [fromPool, setFromPool] = useState<Pool>("recurring");
  const [toPool, setToPool] = useState<Pool>("oneoff");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const illegal = fromPool === "oneoff" && toPool === "recurring";

  async function submit() {
    if (amount <= 0) return toast(t("金额必须大于 0"), "error");
    setBusy(true);
    try {
      await api.createTransfer({
        fromAccountId: from,
        toAccountId: to,
        amount,
        fromPool,
        toPool,
        date,
        note: note || null,
      });
      toast(t("转账已记录"), "success");
      invalidate();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="card-pad space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2 rounded-md border border-slate-800 p-3">
          <div className="section-title">{t("转出")}</div>
          <AccountSelect value={from} onChange={setFrom} accounts={accounts} />
          <PoolPicker value={fromPool} onChange={setFromPool} />
        </div>
        <div className="space-y-2 rounded-md border border-slate-800 p-3">
          <div className="section-title">{t("转入")}</div>
          <AccountSelect value={to} onChange={setTo} accounts={accounts} />
          <PoolPicker value={toPool} onChange={setToPool} />
        </div>
      </div>
      {illegal && (
        <div className="rounded border border-rose-800/60 bg-rose-950/30 px-3 py-2 text-[12px] text-rose-300">
          {t("一次性预算不可转回规律预算（不可再生资源不得再生）。")}
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <Field label={t("金额")} required>
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <Field label={t("日期")} required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t("备注")}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button variant="primary" onClick={submit} disabled={busy || illegal}>
          {t("保存转账")}
        </Button>
      </div>
    </Card>
  );
}

function IncomeForm({ accounts }: { accounts: { id: string; name: string }[] }) {
  const invalidate = useInvalidateAll();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState(0);
  const [kind, setKind] = useState<"regular" | "oneoff">("regular");
  const [pool, setPool] = useState<Pool>("recurring");
  const [date, setDate] = useState(todayStr());
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function setIncomeKind(k: "regular" | "oneoff") {
    setKind(k);
    setPool(k === "oneoff" ? "oneoff" : "recurring");
  }

  async function submit() {
    if (amount <= 0) return toast(t("金额必须大于 0"), "error");
    setBusy(true);
    try {
      await api.createIncome({
        accountId,
        amount,
        pool,
        incomeKind: kind,
        date,
        title: title || null,
        note: note || null,
      });
      toast(t("收入已记录"), "success");
      invalidate();
      setAmount(0);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="card-pad space-y-3">
      <div className="grid grid-cols-4 gap-3">
        <Field label={t("账户")} required>
          <AccountSelect value={accountId} onChange={setAccountId} accounts={accounts} />
        </Field>
        <Field label={t("金额")} required>
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <Field label={t("收入类型")}>
          <Segmented
            value={kind}
            onChange={setIncomeKind}
            options={[
              { value: "regular", label: t("规律收入") },
              { value: "oneoff", label: t("一次性收入") },
            ]}
          />
        </Field>
        <Field label={t("日期")} required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <Field label={t("进入预算池")} hint={t("一次性收入只能进一次性预算")}>
          <PoolPicker value={pool} onChange={setPool} />
        </Field>
        <Field label={t("来源 / 标题")} className="col-span-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t("备注")}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button variant="primary" onClick={submit} disabled={busy}>
          {t("保存收入")}
        </Button>
      </div>
    </Card>
  );
}

function OpeningForm({ accounts }: { accounts: { id: string; name: string }[] }) {
  const invalidate = useInvalidateAll();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [pool, setPool] = useState<Pool>("oneoff");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api.createOpening({
        accountId,
        pool,
        amount,
        date,
        note: note || null,
      });
      toast(t("期初余额已记录"), "success");
      invalidate();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="card-pad space-y-3">
      <div className="grid grid-cols-4 gap-3">
        <Field label={t("账户")} required>
          <AccountSelect value={accountId} onChange={setAccountId} accounts={accounts} />
        </Field>
        <Field label={t("预算池")}>
          <PoolPicker value={pool} onChange={setPool} />
        </Field>
        <Field label={t("金额")} hint={t("负数为期初欠款")}>
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <Field label={t("日期")} required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label={t("备注")}>
        <Input value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex justify-end">
        <Button variant="primary" onClick={submit} disabled={busy}>
          {t("保存期初")}
        </Button>
      </div>
    </Card>
  );
}

export { TagFields, EMPTY_META, type MetaState };
