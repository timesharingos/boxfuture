import { t } from "../lib/i18n";
import { useEffect, useState } from "react";
import { useBudget, useCapacity, useCash, useHabit, usePnl, useRealization } from "../lib/queries";
import { addMonths, cls, isFutureMonth, monthLabel, pct, shortMonth, yuan } from "../lib/format";
import { Badge, Card, Empty, Field, Input, Stat } from "../components/ui";
import { useMonth } from "../App";

type Tab = "pnl" | "cash" | "budget" | "habit" | "capacity" | "realize";

const TABS: { key: Tab; label: string }[] = [
  { key: "pnl", label: "利润表" },
  { key: "cash", label: "现金流量表" },
  { key: "budget", label: "预算执行" },
  { key: "habit", label: "预订习惯" },
  { key: "capacity", label: "超前消费能力" },
  { key: "realize", label: "兑现比例" },
];

export default function Reports() {
  const { month: headerMonth } = useMonth();
  const [tab, setTab] = useState<Tab>("pnl");
  const [from, setFrom] = useState(addMonths(headerMonth, -5));
  const [to, setTo] = useState(headerMonth);
  const [budgetMonth, setBudgetMonth] = useState(headerMonth);

  // 顶部切换月份时，报表区间与月份锚点跟随（之后可再手动微调）
  useEffect(() => {
    setFrom(addMonths(headerMonth, -5));
    setTo(headerMonth);
    setBudgetMonth(headerMonth);
  }, [headerMonth]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-md border border-slate-700 bg-slate-950/50 p-0.5">
          {TABS.map((tabItem) => (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key)}
              className={cls(
                "rounded px-3 py-1 text-xs transition-colors",
                tab === tabItem.key
                  ? "bg-slate-700 text-slate-100"
                  : "text-slate-400 hover:text-slate-200",
              )}
            >
              {t(tabItem.label)}
            </button>
          ))}
        </div>
        {tab !== "budget" && tab !== "capacity" && (
          <div className="ml-auto flex items-end gap-2">
            <Field label={t("起")}>
              <Input
                type="month"
                className="w-[130px]"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field label={t("止")}>
              <Input
                type="month"
                className="w-[130px]"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
          </div>
        )}
        {tab === "budget" && (
          <div className="ml-auto">
            <Input
              type="month"
              className="w-[140px]"
              value={budgetMonth}
              onChange={(e) => setBudgetMonth(e.target.value)}
            />
          </div>
        )}
      </div>

      {tab === "pnl" && <PnlView from={from} to={to} />}
      {tab === "cash" && <CashView from={from} to={to} />}
      {tab === "budget" && <BudgetView month={budgetMonth} />}
      {tab === "habit" && <HabitView toMonth={headerMonth} />}
      {tab === "capacity" && <CapacityView month={headerMonth} />}
      {tab === "realize" && <RealizeView from={from} to={to} />}
    </div>
  );
}

function PnlView({ from, to }: { from: string; to: string }) {
  const q = usePnl(from, to);
  if (!q.data) return <Empty title={t("加载中…")} />;
  const d = q.data;
  const maxAbs = Math.max(1, ...d.months.map((m) => Math.max(m.income, m.expense)));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label={t("收入合计")} value={yuan(d.totalIncome)} tone="ok" />
        <Stat label={t("支出合计")} value={yuan(d.totalExpense)} />
        <Stat
          label={t("净额")}
          value={yuan(d.totalNet)}
          tone={d.totalNet < 0 ? "danger" : "ok"}
          sub={t("权责发生制：期货下单日确认全额，计提核销日确认")}
        />
      </div>

      <Card className="card-pad">
        <div className="flex h-[140px] items-end gap-2">
          {d.months.map((m) => (
            <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-[110px] w-full items-end justify-center gap-0.5">
                <div
                  className="w-1/2 rounded-t bg-emerald-500/70"
                  style={{ height: `${Math.max(1, (m.income / maxAbs) * 105)}px` }}
                  title={`收入 ${yuan(m.income)}`}
                />
                <div
                  className="w-1/2 rounded-t bg-rose-500/70"
                  style={{ height: `${Math.max(1, (m.expense / maxAbs) * 105)}px` }}
                  title={`支出 ${yuan(m.expense)}`}
                />
              </div>
              <span className="text-[10px] text-slate-600">{shortMonth(m.month)}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("月份")}</th>
              <th className="text-right">{t("收入")}</th>
              <th className="text-right">{t("支出")}</th>
              <th className="text-right">{t("净额")}</th>
              <th>{t("构成")}</th>
            </tr>
          </thead>
          <tbody>
            {d.months.map((m) => (
              <tr key={m.month}>
                <td className="num text-slate-300">{monthLabel(m.month)}{isFutureMonth(m.month) && <Badge tone="violet" className="ml-1">{t("预测")}</Badge>}</td>
                <td className="num text-right text-emerald-400">{yuan(m.income)}</td>
                <td className="num text-right text-rose-300">{yuan(m.expense)}</td>
                <td className={"num text-right " + (m.net < 0 ? "text-rose-400" : "text-slate-100")}>
                  {yuan(m.net)}
                </td>
                <td className="text-[11px] text-slate-500">
                  {m.items.map((i) => `${t(i.label)} ${yuan(i.amount)}`).join(" · ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CashView({ from, to }: { from: string; to: string }) {
  const q = useCash(from, to);
  if (!q.data) return <Empty title={t("加载中…")} />;
  const d = q.data;
  const maxAbs = Math.max(1, ...d.months.map((m) => Math.max(m.inflow, m.outflow)));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label={t("现金流入")} value={yuan(d.totalInflow)} tone="ok" />
        <Stat label={t("现金流出")} value={yuan(d.totalOutflow)} />
        <Stat label={t("净现金流")} value={yuan(d.totalInflow - d.totalOutflow)} />
      </div>

      <Card className="card-pad">
        <div className="flex h-[140px] items-end gap-2">
          {d.months.map((m) => (
            <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-[110px] w-full items-end justify-center gap-0.5">
                <div
                  className="w-1/2 rounded-t bg-sky-500/70"
                  style={{ height: `${Math.max(1, (m.inflow / maxAbs) * 105)}px` }}
                />
                <div
                  className="w-1/2 rounded-t bg-amber-500/70"
                  style={{ height: `${Math.max(1, (m.outflow / maxAbs) * 105)}px` }}
                />
              </div>
              <span className="text-[10px] text-slate-600">{shortMonth(m.month)}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="section-title mb-2">{t("按月")}</div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("月份")}</th>
                  <th className="text-right">{t("流入")}</th>
                  <th className="text-right">{t("流出")}</th>
                  <th className="text-right">{t("净额")}</th>
                </tr>
              </thead>
              <tbody>
                {d.months.map((m) => (
                  <tr key={m.month}>
                    <td className="num text-slate-300">{monthLabel(m.month)}{isFutureMonth(m.month) && <Badge tone="violet" className="ml-1">{t("预测")}</Badge>}</td>
                    <td className="num text-right text-sky-300">{yuan(m.inflow)}</td>
                    <td className="num text-right text-amber-300">{yuan(m.outflow)}</td>
                    <td className="num text-right">{yuan(m.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div className="section-title mb-2">{t("按账户")}</div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("账户")}</th>
                  <th className="text-right">{t("流入")}</th>
                  <th className="text-right">{t("流出")}</th>
                </tr>
              </thead>
              <tbody>
                {d.byAccount.map((a) => (
                  <tr key={a.accountId}>
                    <td className="text-slate-300">{a.accountName || "—"}</td>
                    <td className="num text-right text-sky-300">{yuan(a.inflow)}</td>
                    <td className="num text-right text-amber-300">{yuan(a.outflow)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function BudgetView({ month }: { month: string }) {
  const q = useBudget(month);
  const rows = q.data ?? [];
  return (
    <div className="space-y-3">
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("账户")}</th>
              <th className="text-right">{t("额度")}</th>
              <th className="text-right">{t("已用")}</th>
              <th className="text-right">{t("可用")}</th>
              <th>{t("使用率")}</th>
              <th className="text-right">{t("一次性余额")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const ratio = r.quota > 0 ? Math.min(1, r.recurringUsed / r.quota) : 0;
              return (
                <tr key={r.accountId}>
                  <td className="text-slate-200">{r.accountName}</td>
                  <td className="num text-right">{yuan(r.quota)}</td>
                  <td className="num text-right text-slate-400">{yuan(r.recurringUsed)}</td>
                  <td className={"num text-right " + (r.recurringBalance < 0 ? "text-rose-400" : "")}>
                    {yuan(r.recurringBalance)}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className={cls(
                            "h-full",
                            r.over ? "bg-rose-500" : ratio > 0.85 ? "bg-amber-500" : "bg-emerald-500",
                          )}
                          style={{ width: `${ratio * 100}%` }}
                        />
                      </div>
                      <span className="num text-[11px] text-slate-500">{pct(ratio)}</span>
                    </div>
                  </td>
                  <td className="num text-right">{yuan(r.oneoffBalance)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <Empty title={t("没有数据")} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Card className="card-pad text-[11px] text-slate-500">{t("预算执行报告对比实际权责支出与「规律额度 + 一次性可用额」；超支行会标红。")}</Card>
    </div>
  );
}

function HabitView({ toMonth }: { toMonth: string }) {
  const q = useHabit(12, toMonth);
  if (!q.data) return <Empty title={t("加载中…")} />;
  const d = q.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <Stat label={t("订单数")} value={String(d.orderCount)} />
        <Stat label={t("订单总额")} value={yuan(d.orderTotal)} />
        <Stat
          label={t("跳票率")}
          value={pct(d.defaultRate)}
          sub={t("展期 + 取消 + 违约 / 订单总数")}
          tone={d.defaultRate > 0.3 ? "danger" : "default"}
        />
        <Stat label={t("平均延期")} value={`${d.avgExtensionDays.toFixed(1)} 天`} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="section-title mb-2">{t("按月")}</div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("月份")}</th>
                  <th className="text-right">{t("订单")}</th>
                  <th className="text-right">{t("总额")}</th>
                  <th className="text-right">{t("展期")}</th>
                  <th className="text-right">{t("取消")}</th>
                </tr>
              </thead>
              <tbody>
                {d.months.map((m) => (
                  <tr key={m.month}>
                    <td className="num text-slate-300">{monthLabel(m.month)}{isFutureMonth(m.month) && <Badge tone="violet" className="ml-1">{t("预测")}</Badge>}</td>
                    <td className="num text-right">{m.orders}</td>
                    <td className="num text-right">{yuan(m.total)}</td>
                    <td className="num text-right text-amber-300">{m.rolled}</td>
                    <td className="num text-right text-rose-300">{m.cancelled}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div className="section-title mb-2">{t("按供应商")}</div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("供应商")}</th>
                  <th className="text-right">{t("订单")}</th>
                  <th className="text-right">{t("总额")}</th>
                  <th className="text-right">{t("展期")}</th>
                  <th className="text-right">{t("取消")}</th>
                  <th className="text-right">{t("平均延期")}</th>
                </tr>
              </thead>
              <tbody>
                {d.vendors.map((v) => (
                  <tr key={v.vendorName}>
                    <td className="text-slate-200">{v.vendorName}</td>
                    <td className="num text-right">{v.orders}</td>
                    <td className="num text-right">{yuan(v.total)}</td>
                    <td className="num text-right text-amber-300">{v.rolled}</td>
                    <td className="num text-right text-rose-300">{v.cancelled}</td>
                    <td className="num text-right">{v.avgExtensionDays.toFixed(1)} 天</td>
                  </tr>
                ))}
                {d.vendors.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <Empty title={t("暂无期货订单")} />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function CapacityView({ month }: { month: string }) {
  const q = useCapacity(month);
  if (!q.data) return <Empty title={t("加载中…")} />;
  const d = q.data;
  const maxOut = Math.max(1, ...d.byMonth.map((m) => m.outflow));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <Stat label={t("一次性余额")} value={yuan(d.oneoffTotal)} />
        <Stat label={t("本月剩余规律额度")} value={yuan(d.recurringTotal)} />
        <Stat label={t("未来 12 月刚性义务")} value={yuan(d.obligatory12m)} tone="danger" />
        <Stat
          label={t("可超前消费")}
          value={yuan(d.available)}
          tone={d.available < 0 ? "danger" : "ok"}
          sub={`安全垫 ${yuan(d.cushion)}`}
        />
      </div>

      <Card className="card-pad">
        <div className="section-title mb-2">{t("未来 12 月刚性义务分布")}</div>
        <div className="flex h-[130px] items-end gap-2">
          {d.byMonth.map((m) => (
            <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-rose-500/60"
                style={{ height: `${Math.max(2, (m.outflow / maxOut) * 110)}px` }}
                title={yuan(m.outflow)}
              />
              <span className="text-[10px] text-slate-600">{shortMonth(m.month)}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="card-pad text-[12px] leading-relaxed text-slate-400">
        <div className="mb-1 font-medium text-slate-300">{t("计算口径")}</div>
        <div>
          可支配总资产 = 各账户一次性余额 + 本月剩余规律额度 ={" "}
          <span className="num text-slate-200">
            {yuan(d.oneoffTotal + d.recurringTotal)}
          </span>
        </div>
        <div>
          刚性义务 = 未来 12 个月的未付尾款 + 未核销计提 ={" "}
          <span className="num text-rose-300">{yuan(d.obligatory12m)}</span>
        </div>
        <div>{t("可超前消费 = 可支配总资产 − 刚性义务 − 安全垫 =")}<span className={"num ml-1 " + (d.available < 0 ? "text-rose-400" : "text-emerald-400")}>
            {yuan(d.available)}
          </span>
        </div>
        <div className="mt-1 text-slate-600">{t("安全垫可在「设置」中调整。")}</div>
      </Card>
    </div>
  );
}


function RealizeView({ from, to }: { from: string; to: string }) {
  const q = useRealization(from, to);
  if (!q.data) return <Empty title={t("加载中…")} />;
  const d = q.data;
  const owed = d.totalQuota - d.totalRealized;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <div className="card card-pad">
          <div className="text-[11px] text-slate-500">{t("兑现比例")}</div>
          <div className="num mt-1 text-[20px] font-semibold text-sky-300">
            {Math.round(d.ratio * 100)}%
          </div>
        </div>
        <div className="card card-pad">
          <div className="text-[11px] text-slate-500">{t("规律额度")}</div>
          <div className="num mt-1 text-[20px] text-slate-200">{yuan(d.totalQuota)}</div>
        </div>
        <div className="card card-pad">
          <div className="text-[11px] text-slate-500">{t("已兑现")}</div>
          <div className="num mt-1 text-[20px] text-emerald-400">{yuan(d.totalRealized)}</div>
        </div>
        <div className="card card-pad">
          <div className="text-[11px] text-slate-500">{t("欠兑现")}</div>
          <div className={cls("num mt-1 text-[20px]", owed > 0 ? "text-amber-300" : "text-slate-200")}>
            {yuan(owed)}
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("月份")}</th>
              <th className="text-right">{t("规律额度")}</th>
              <th className="text-right">{t("已兑现")}</th>
              <th className="text-right">{t("欠兑现")}</th>
              <th className="w-[220px]">{t("兑现比例")}</th>
            </tr>
          </thead>
          <tbody>
            {d.months.map((m) => {
              const left = m.quota - m.realized;
              const r = Math.min(1, Math.max(0, m.ratio));
              return (
                <tr key={m.month}>
                  <td className="num text-slate-300">{monthLabel(m.month)}{isFutureMonth(m.month) && <Badge tone="violet" className="ml-1">{t("预测")}</Badge>}</td>
                  <td className="num text-right">{yuan(m.quota)}</td>
                  <td className="num text-right text-emerald-400">{yuan(m.realized)}</td>
                  <td className={cls("num text-right", left > 0 ? "text-amber-300" : "text-slate-500")}>
                    {yuan(left)}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full bg-sky-500"
                          style={{ width: `${r * 100}%` }}
                        />
                      </div>
                      <span className="num w-10 text-right text-[11px] text-slate-500">
                        {Math.round(m.ratio * 100)}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div>
        <div className="section-title mb-1">{t("按账户")}</div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("账户")}</th>
                <th className="text-right">{t("规律额度")}</th>
                <th className="text-right">{t("已兑现")}</th>
                <th className="text-right">{t("兑现比例")}</th>
              </tr>
            </thead>
            <tbody>
              {d.byAccount.map((a) => (
                <tr key={a.accountId}>
                  <td className="text-slate-200">{a.accountName}</td>
                  <td className="num text-right">{yuan(a.quota)}</td>
                  <td className="num text-right text-emerald-400">{yuan(a.realized)}</td>
                  <td className="num text-right text-slate-400">
                    {Math.round(a.ratio * 100)}%
                  </td>
                </tr>
              ))}
              {d.byAccount.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <Empty title={t("没有数据")} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-[11px] leading-relaxed text-slate-600">
        {t("规律预算在月初记为应收收入；兑现是它的实际到账，累计不超过当月额度。欠兑现 = 额度 − 已兑现，按月清零。")}
      </div>
    </div>
  );
}
