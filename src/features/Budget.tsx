import { useState } from "react";
import { t } from "../lib/i18n";
import { useBootstrap, useBudget, useInvalidateAll, useRealization } from "../lib/queries";
import { api, errorMessage } from "../lib/ipc";
import { addMonths, monthLabel, yuan } from "../lib/format";
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  Modal,
  MoneyInput,
  toast,
} from "../components/ui";
import { useMonth } from "../App";

export default function Budget() {
  const { month, setMonth } = useMonth();
  const boot = useBootstrap();
  const budget = useBudget(month);
  const realization = useRealization(month, month);
  const invalidate = useInvalidateAll();
  const [editing, setEditing] = useState<{ id: string; name: string; quota: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = budget.data ?? [];
  const totals = rows.reduce(
    (acc, r) => ({
      quota: acc.quota + r.quota,
      used: acc.used + r.recurringUsed,
      left: acc.left + r.recurringBalance,
      oneoff: acc.oneoff + r.oneoffBalance,
    }),
    { quota: 0, used: 0, left: 0, oneoff: 0 },
  );

  async function doClose() {
    setBusy(true);
    try {
      const r = await api.closeMonth(month);
      toast(
        `${monthLabel(month)} 已结账，结转 ${yuan(r.total)} 到一次性预算`,
        "success",
      );
      invalidate();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function doReopen() {
    setBusy(true);
    try {
      await api.reopenMonth(month);
      toast("已重开该月，可补录交易", "success");
      invalidate();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  const closed = boot.data?.closedMonths?.includes(month) ?? false;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => setMonth(addMonths(month, -1))}>
          {t("← 上一月")}
        </Button>
        <Input
          type="month"
          className="w-[140px]"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
        <Button size="sm" onClick={() => setMonth(addMonths(month, 1))}>{t("下一月 →")}</Button>
        <div className="ml-3 text-[12px] text-slate-400">{monthLabel(month)}</div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="warn" onClick={doClose} disabled={busy || closed}>{t("手动结账")}</Button>
          <Button size="sm" onClick={doReopen} disabled={busy || !closed}>{t("重开该月")}</Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Summary label={t("规律额度合计")} value={yuan(totals.quota)} />
        <Summary label={t("规律已用")} value={yuan(totals.used)} />
        <Summary
          label={t("规律剩余")}
          value={yuan(totals.left)}
          tone={totals.left < 0 ? "danger" : "ok"}
        />
        <Summary label={t("一次性余额合计")} value={yuan(totals.oneoff)} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Summary
          label={t("预算兑现比例")}
          value={`${Math.round((realization.data?.ratio ?? 0) * 100)}%`}
          tone={(realization.data?.ratio ?? 0) >= 1 ? "ok" : undefined}
        />
        <Summary label={t("已兑现")} value={yuan(realization.data?.totalRealized ?? 0)} />
        <Summary
          label={t("欠兑现")}
          value={yuan((realization.data?.totalQuota ?? 0) - (realization.data?.totalRealized ?? 0))}
          tone={
            (realization.data?.totalQuota ?? 0) > (realization.data?.totalRealized ?? 0)
              ? "danger"
              : "ok"
          }
        />
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("账户")}</th>
              <th className="text-right">{t("规律额度")}</th>
              <th className="text-right">{t("规律已用")}</th>
              <th className="text-right">{t("规律可用")}</th>
              <th className="text-right">{t("一次性流入")}</th>
              <th className="text-right">{t("一次性流出")}</th>
              <th className="text-right">{t("一次性余额（结算至该月）")}</th>
              <th className="w-[80px]"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.accountId}>
                <td className="text-slate-200">
                  {r.accountName}
                  {r.over && <Badge tone="rose" className="ml-2">{t("超支")}</Badge>}
                </td>
                <td className="num text-right">{yuan(r.quota)}</td>
                <td className="num text-right text-slate-400">{yuan(r.recurringUsed)}</td>
                <td
                  className={
                    "num text-right " + (r.recurringBalance < 0 ? "text-rose-400" : "text-slate-100")
                  }
                >
                  {yuan(r.recurringBalance)}
                </td>
                <td className="num text-right text-emerald-400">{yuan(r.oneoffIn)}</td>
                <td className="num text-right text-rose-300">{yuan(r.oneoffOut)}</td>
                <td className="num text-right">{yuan(r.oneoffBalance)}</td>
                <td>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setEditing({ id: r.accountId, name: r.accountName, quota: r.quota })
                    }
                  >{t("改额度")}</Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <Empty title={t("没有账户")} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Card className="card-pad text-[11px] leading-relaxed text-slate-500">
        <div className="mb-1 font-medium text-slate-400">{t("结转规则")}</div>
        <div>
          {t(
            "月末自动结账：每个账户的「规律可用」会整体转入同账户的一次性预算（正数增加、负数扣减），规律预算按月重置到额度。已结账月份默认锁定，如需补录请使用「重开上月」。",
          )}
        </div>
      </Card>

      {closed && (
        <div className="text-[11px] text-amber-400">
          {monthLabel(month)} 已结账；新增交易会被拒绝，需先在「预算 → 重开上月」里重开该月。
        </div>
      )}

      <Modal
        open={!!editing}
        title={`修改规律额度 · ${editing?.name ?? ""}`}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>{t("取消")}</Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!editing) return;
                try {
                  const effective = await api.setQuota(editing.id, month, editing.quota);
                  toast(
                    `已设置：自 ${monthLabel(effective)} 起额度为 ${yuan(editing.quota)}`,
                    "success",
                  );
                  invalidate();
                  setEditing(null);
                } catch (e) {
                  toast(errorMessage(e), "error");
                }
              }}
            >{t("保存")}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded border border-sky-800/50 bg-sky-950/20 px-3 py-2 text-[11px] leading-relaxed text-sky-200">
            {t("修改")}
            <b>{t("从下个月起生效")}</b>
            {t("：当前选择的 {{m}} 额度不变，新额度自 {{n}} 开始计算。同一个生效月份再次修改会直接覆盖。", {
              m: monthLabel(month),
              n: monthLabel(addMonths(month, 1)),
            })}
          </div>
          <Field
            label={`自 ${monthLabel(addMonths(month, 1))} 起的规律额度`}
            hint={t("后续月份沿用，直到再次修改")}
          >
            <MoneyInput
              value={editing?.quota ?? 0}
              onChange={(v) => setEditing((prev) => (prev ? { ...prev, quota: v } : prev))}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "ok";
}) {
  return (
    <Card className="card-pad">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div
        className={
          "num mt-1 text-xl font-semibold " +
          (tone === "danger" ? "text-rose-400" : tone === "ok" ? "text-emerald-400" : "text-slate-100")
        }
      >
        {value}
      </div>
    </Card>
  );
}
