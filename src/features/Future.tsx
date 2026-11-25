import { useState } from "react";
import { t } from "../lib/i18n";
import { useBootstrap, useForward, useInvalidateAll, useObligations } from "../lib/queries";
import { api, errorMessage } from "../lib/ipc";
import {
  monthLabel,
  obligationStatusLabel,
  poolLabel,
  shortMonth,
  todayStr,
  yuan,
} from "../lib/format";
import type { Obligation } from "../lib/types";
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  Modal,
  MoneyInput,
  Select,
  Textarea,
  toast,
} from "../components/ui";
import { PayModal, RolloverModal, SettleModal } from "./Ledger";
import { EMPTY_META, TagFields, type MetaState } from "./NewEntry";
import { useMonth } from "../App";

export default function Future() {
  const { month } = useMonth();
  const obligations = useObligations(true);
  const forward = useForward(12, month);
  const [statusFilter, setStatusFilter] = useState("open");
  const [paying, setPaying] = useState<Obligation | null>(null);
  const [settling, setSettling] = useState<Obligation | null>(null);
  const [rolling, setRolling] = useState<Obligation | null>(null);
  const [accrualSettle, setAccrualSettle] = useState<Obligation | null>(null);

  const rows = (obligations.data ?? []).filter((o) => {
    if (statusFilter === "open") return o.status === "pending" || o.status === "frozen";
    if (statusFilter === "all") return true;
    return o.status === statusFilter;
  });

  const maxTotal = Math.max(1, ...(forward.data ?? []).map((f) => f.total));

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="section-title">{t("未来 12 个月资金需求")}</div>
          <div className="text-[11px] text-slate-500">
            合计 {yuan((forward.data ?? []).reduce((s, f) => s + f.total, 0))}
          </div>
        </div>
        <Card className="card-pad">
          <div className="flex h-[150px] items-end gap-2">
            {(forward.data ?? []).map((f) => (
              <div key={f.month} className="group flex flex-1 flex-col items-center gap-1">
                <div className="relative w-full">
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-sky-700/60 to-sky-400/80 group-hover:from-sky-600 group-hover:to-sky-300"
                    style={{ height: `${Math.max(2, (f.total / maxTotal) * 118)}px` }}
                  />
                  {f.total > 0 && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] text-slate-500 opacity-0 group-hover:opacity-100">
                      {yuan(f.total)}
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-slate-600">{shortMonth(f.month)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2">
          <div className="section-title">{t("义务清单")}</div>
          <Select
            className="w-[110px] input-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="open">{t("未结清")}</option>
            <option value="all">{t("全部")}</option>
            <option value="pending">{t("待付")}</option>
            <option value="frozen">{t("已冻结")}</option>
            <option value="paid">{t("已付")}</option>
            <option value="settled">{t("已核销")}</option>
            <option value="cancelled">{t("已取消")}</option>
          </Select>
          <span className="text-[11px] text-slate-500">{t("{{n}} 笔", { n: rows.length })}</span>
        </div>

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
                <th className="text-right">{t("已付")}</th>
                <th className="text-right">{t("未付")}</th>
                <th>{t("状态")}</th>
                <th className="text-right">{t("操作")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const unpaid = o.amount - o.paidAmount;
                const done = o.status === "paid" || o.status === "settled" || o.status === "cancelled";
                return (
                  <tr key={o.id}>
                    <td className="num text-slate-300">{o.dueMonth}</td>
                    <td className="max-w-[220px] truncate text-slate-200">{o.title ?? "—"}</td>
                    <td className="text-slate-500">{o.vendorName ?? "—"}</td>
                    <td className="text-slate-400">{o.accountName ?? "—"}</td>
                    <td className="text-slate-400">
                      {t(o.kind === "accrual" ? "计提" : "尾款")} · {t(poolLabel(o.pool))}
                    </td>
                    <td className="num text-right">{yuan(o.amount)}</td>
                    <td className="num text-right text-emerald-400">{yuan(o.paidAmount)}</td>
                    <td className="num text-right text-amber-300">{yuan(unpaid)}</td>
                    <td>
                      <Badge
                        tone={
                          o.status === "frozen"
                            ? "sky"
                            : o.status === "paid"
                              ? "emerald"
                              : o.status === "cancelled"
                                ? "rose"
                                : "amber"
                        }
                      >
                        {t(obligationStatusLabel(o.status))}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        {!done && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                try {
                                  await api.freezeObligation(
                                    o.id,
                                    o.status !== "frozen",
                                    todayStr(),
                                  );
                                  toast(o.status === "frozen" ? "已解冻" : "已冻结（预算仍锁定）", "success");
                                } catch (e) {
                                  toast(errorMessage(e), "error");
                                }
                              }}
                            >
                              {t(o.status === "frozen" ? "解冻" : "冻结")}
                            </Button>
                            {o.kind === "accrual" ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setAccrualSettle(o)}
                              >{t("核销")}</Button>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setSettling(o)}
                                >{t("核销")}</Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setRolling(o)}
                                >{t("展期")}</Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => setPaying(o)}
                            >{t("支付")}</Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10}>
                    <Empty title={t("没有义务记录")} hint={t("期货尾款与计提会自动出现在这里")} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="section-title mb-2">{t("按月汇总")}</div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("月份")}</th>
                <th className="text-right">{t("期货尾款")}</th>
                <th className="text-right">{t("计提")}</th>
                <th className="text-right">{t("合计")}</th>
                <th>{t("明细")}</th>
              </tr>
            </thead>
            <tbody>
              {(forward.data ?? []).map((f) => (
                <tr key={f.month}>
                  <td className="num text-slate-300">{f.month}</td>
                  <td className="num text-right">{yuan(f.futuresBalance)}</td>
                  <td className="num text-right">{yuan(f.accrual)}</td>
                  <td className="num text-right font-medium text-amber-300">{yuan(f.total)}</td>
                  <td className="max-w-[520px] truncate text-[11px] text-slate-500">
                    {f.items.map((i) => `${i.title} ${yuan(i.amount)}`).join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {paying && <PayModal ob={paying} onClose={() => setPaying(null)} />}
      {settling && <SettleModal ob={settling} onClose={() => setSettling(null)} />}
      {rolling && <RolloverModal ob={rolling} onClose={() => setRolling(null)} />}
      {accrualSettle && (
        <AccrualSettleModal ob={accrualSettle} onClose={() => setAccrualSettle(null)} />
      )}
    </div>
  );
}

function AccrualSettleModal({ ob, onClose }: { ob: Obligation; onClose: () => void }) {
  const boot = useBootstrap();
  const invalidate = useInvalidateAll();
  const [amount, setAmount] = useState(ob.amount);
  const [pool, setPool] = useState<"recurring" | "oneoff">("oneoff");
  const [date, setDate] = useState(todayStr());
  const [meta, setMeta] = useState<MetaState>(EMPTY_META);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open
      title={`核销计提 · ${monthLabel(ob.dueMonth)}`}
      onClose={onClose}
      width={680}
      footer={
        <>
          <Button onClick={onClose}>{t("取消")}</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.settleAccrual(ob.id, {
                  accountId: ob.accountId,
                  amount,
                  pool,
                  accrualDate: date,
                  budgetMonth: date.slice(0, 7),
                  tag: "auto",
                  title: meta.title || ob.title,
                  reason: meta.reason || null,
                  urgency: meta.urgency || null,
                  marketPrice: meta.marketPrice || null,
                  expectedEffect: meta.expectedEffect || null,
                  usageMonths: meta.usageMonths || null,
                  necessity: meta.necessity || null,
                  purpose: meta.purpose || null,
                  note: note || null,
                });
                toast("计提已核销，生成一笔真实现货交易", "success");
                invalidate();
                onClose();
              } catch (e) {
                toast(errorMessage(e), "error");
              } finally {
                setBusy(false);
              }
            }}
          >{t("确认核销")}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded border border-slate-800 px-3 py-2 text-[11px] text-slate-400">
          原计提 {yuan(ob.amount)}（锁定在 {monthLabel(ob.dueMonth)}）。核销会先释放这笔估计值，
          再按实际金额生成一笔现货交易（占用计数器、按实际金额判分级）。
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t("实际金额")} required>
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
          <Field label={t("实际发生的预算池")}>
            <Select value={pool} onChange={(e) => setPool(e.target.value as "recurring" | "oneoff")}>
              <option value="oneoff">{t("一次性预算")}</option>
              <option value="recurring">{t("规律预算")}</option>
            </Select>
          </Field>
          <Field label={t("发生日期")} required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <TagFields rules={boot.data?.tagRules ?? []} amount={amount} meta={meta} setMeta={setMeta} />
        <Field label={t("备注")}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
