import { Link } from "react-router-dom";
import { useAccounts, useCapacity, useForward, useObligations, useRealization } from "../lib/queries";
import {
  accountKindLabel,
  isFutureMonth,
  monthLabel,
  obligationStatusLabel,
  poolLabel,
  shortMonth,
  yuan,
} from "../lib/format";
import { Badge, Card, Empty, SectionTitle, Stat } from "../components/ui";
import { useMonth } from "../App";
import { useT } from "../lib/i18n";

export default function Dashboard() {
  const { month } = useMonth();
  const { t } = useT();
  // 所有指标都按「结算到所选月份」计算
  const accountsQuery = useAccounts(month);
  const forward = useForward(12, month);
  const capacity = useCapacity(month);
  const obligations = useObligations(false);
  const realization = useRealization(month, month);

  const accounts = (accountsQuery.data ?? []).filter((a) => !a.archived);
  const recurringTotal = accounts.reduce((s, a) => s + a.recurringBalance, 0);
  const oneoffTotal = accounts.reduce((s, a) => s + a.oneoffBalance, 0);
  const maxForward = Math.max(1, ...(forward.data ?? []).map((f) => f.total));
  const availableTotal =
    (capacity.data?.oneoffTotal ?? 0) + (capacity.data?.recurringTotal ?? 0);
  const pending = (obligations.data ?? [])
    .filter((o) => o.dueMonth >= month)
    .slice(0, 6);

  return (
    <div className="space-y-5">
      {isFutureMonth(month) && (
        <div className="flex items-center gap-2">
          <Badge tone="violet">{t("实时预测")}</Badge>
          <span className="text-[11px] text-slate-500">
            {t("该月尚未开始，以下数字由「模拟月结」推算")}
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label={t("{{m}} 规律可用", { m: monthLabel(month) })}
          value={yuan(recurringTotal)}
          sub={t("{{n}} 个逻辑账户", { n: accounts.length })}
          tone={recurringTotal < 0 ? "danger" : "ok"}
        />
        <Stat
          label={t("一次性余额")}
          value={yuan(oneoffTotal)}
          sub={t("结算至 {{m}} · 未结账月份按模拟月结（当前月按已兑现比例）", {
            m: monthLabel(month),
          })}
        />
        <Stat
          label={t("未来 12 月刚性义务")}
          value={yuan(capacity.data?.obligatory12m ?? 0)}
          sub={t("含尾款与计提 {{n}} 笔", { n: obligations.data?.length ?? 0 })}
          tone="danger"
        />
        <Stat
          label={t("超前消费能力")}
          value={yuan(capacity.data?.available ?? 0)}
          sub={t("可支配 {{a}} − 义务 − 安全垫 {{b}}", {
            a: yuan(availableTotal),
            b: yuan(capacity.data?.cushion ?? 0),
          })}
          tone={(capacity.data?.available ?? 0) < 0 ? "danger" : "ok"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <SectionTitle
            right={
              <Link className="text-xs text-sky-400" to="/budget">
                {t("查看预算 →")}
              </Link>
            }
          >
            {t("账户预算")}
          </SectionTitle>
          <div className="space-y-2">
            {accounts.length === 0 && (
              <Card>
                <Empty title={t("还没有账户")} hint={t("到「账户」页添加一个逻辑账户")} />
              </Card>
            )}
            {accounts.map((a) => {
              const used = a.quota - a.recurringBalance;
              const ratio = a.quota > 0 ? Math.min(1, Math.max(0, used / a.quota)) : 0;
              return (
                <Card key={a.id} className="px-4 py-3">
                  <div className="flex items-baseline justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-slate-200">{a.name}</span>
                      <Badge tone="slate">{t(accountKindLabel(a.kind))}</Badge>
                    </div>
                    <div className="num text-[13px]">
                      <span className={a.recurringBalance < 0 ? "text-rose-400" : "text-slate-200"}>
                        {yuan(a.recurringBalance)}
                      </span>
                      <span className="ml-2 text-[11px] text-slate-500">
                        {t("一次性")} {yuan(a.oneoffBalance)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={ratio > 0.9 ? "h-full bg-rose-500" : "h-full bg-sky-500"}
                        style={{ width: `${ratio * 100}%` }}
                      />
                    </div>
                    <span className="num text-[11px] text-slate-500">
                      {t("已用 {{a}} / {{b}}", { a: yuan(used), b: yuan(a.quota) })}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        <div className="xl:col-span-2">
          <SectionTitle
            right={
              <Link className="text-xs text-sky-400" to="/future">
                {t("明细 →")}
              </Link>
            }
          >
            {t("未来 12 月资金需求")}
          </SectionTitle>
          <Card className="card-pad">
            {forward.data && forward.data.length > 0 ? (
              <div className="flex h-[168px] items-end gap-1.5">
                {forward.data.map((f) => (
                  <div key={f.month} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-amber-600/70 to-amber-400/80"
                      style={{ height: `${Math.max(2, (f.total / maxForward) * 130)}px` }}
                      title={`${f.month} ${yuan(f.total)}`}
                    />
                    <span className="text-[10px] text-slate-600">{shortMonth(f.month)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty title={t("暂无未来义务")} />
            )}
          </Card>
        </div>
      </div>

      <div>
        <SectionTitle
          right={
            <Link className="text-xs text-sky-400" to="/future">
              {t("全部 →")}
            </Link>
          }
        >
          {t("待付义务")}
        </SectionTitle>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("到期月")}</th>
                <th>{t("项目")}</th>
                <th>{t("供应商")}</th>
                <th>{t("账户")}</th>
                <th>{t("类型")}</th>
                <th className="text-right">{t("金额")}</th>
                <th className="text-right">{t("未付")}</th>
                <th>{t("状态")}</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((o) => (
                <tr key={o.id}>
                  <td className="num text-slate-400">{o.dueMonth}</td>
                  <td className="text-slate-200">{o.title ?? "—"}</td>
                  <td className="text-slate-400">{o.vendorName ?? "—"}</td>
                  <td className="text-slate-400">{o.accountName ?? "—"}</td>
                  <td className="text-slate-400">
                    {t(o.kind === "accrual" ? "计提" : "尾款")} · {t(poolLabel(o.pool))}
                  </td>
                  <td className="num text-right">{yuan(o.amount)}</td>
                  <td className="num text-right text-amber-300">
                    {yuan(o.amount - o.paidAmount)}
                  </td>
                  <td>
                    <Badge tone={o.status === "frozen" ? "sky" : "amber"}>
                      {t(obligationStatusLabel(o.status))}
                    </Badge>
                  </td>
                </tr>
              ))}
              {pending.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <Empty
                      title={t("没有待付义务")}
                      hint={t("期货尾款与计提会出现在这里")}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Card className="card-pad">
        <div className="flex items-baseline justify-between">
          <div className="section-title">{t("兑现比例")}</div>
          <div className="num text-[13px] font-semibold text-rose-300">
            {Math.round((realization.data?.ratio ?? 0) * 100)}%
          </div>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full bg-rose-500"
            style={{
              width: `${Math.min(100, Math.max(0, (realization.data?.ratio ?? 0) * 100))}%`,
            }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
          <span>
            {t("已兑现 {{a}} / 额度 {{b}}", {
              a: yuan(realization.data?.totalRealized ?? 0),
              b: yuan(realization.data?.totalQuota ?? 0),
            })}
          </span>
          <span className="text-amber-300/80">
            {t("欠兑现 {{x}}", {
              x: yuan(
                (realization.data?.totalQuota ?? 0) - (realization.data?.totalRealized ?? 0),
              ),
            })}
          </span>
        </div>
      </Card>
    </div>
  );
}
