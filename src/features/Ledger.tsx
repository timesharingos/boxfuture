import { t } from "../lib/i18n";
import { useMemo, useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import {
  useBootstrap,
  useEventDetail,
  useEvents,
  useInvalidateAll,
  useQuotaGrants,
  useQuotaHistory,
} from "../lib/queries";
import { api, errorMessage } from "../lib/ipc";
import {
  addMonths,
  cls,
  kindLabel,
  monthLabel,
  obligationStatusLabel,
  poolLabel,
  statusLabel,
  todayStr,
  yuan,
} from "../lib/format";
import type { EventDetail, EventView, Obligation, QuotaGrant } from "../lib/types";
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  MoneyInput,
  Modal,
  Select,
  Textarea,
  toast,
} from "../components/ui";
import { useMonth } from "../App";

const KINDS = [
  { value: "all", label: "全部类型" },
  { value: "spot", label: "现货" },
  { value: "futures_order", label: "期货订单" },
  { value: "futures_payment", label: "尾款支付" },
  { value: "futures_rollover", label: "展期" },
  { value: "accrual", label: "计提" },
  { value: "income", label: "收入" },
  { value: "transfer", label: "转账" },
  { value: "reversal", label: "冲销" },
  { value: "opening", label: "期初" },
  { value: "quota_grant", label: "预算注入" },
  { value: "budget_realize", label: "预算兑现" },
  { value: "period_close", label: "月结" },
];

function statusTone(status: string): "slate" | "sky" | "amber" | "emerald" | "rose" | "violet" {
  if (status === "reversed" || status === "void") return "rose";
  if (status === "partially_reversed") return "amber";
  if (status === "settled") return "emerald";
  if (status === "estimated") return "violet";
  return "slate";
}

type Row =
  | { key: string; date: string; seq: number; type: "event"; event: EventView }
  | { key: string; date: string; seq: number; type: "grant"; grant: QuotaGrant };

export default function Ledger() {
  const { month } = useMonth();
  const boot = useBootstrap();
  const [from, setFrom] = useState(addMonths(month, -2));
  const [to, setTo] = useState(month);
  const [accountId, setAccountId] = useState("");
  const [kind, setKind] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [grantAccount, setGrantAccount] = useState<{ id: string; name: string } | null>(null);

  const events = useEvents({
    fromMonth: from || undefined,
    toMonth: to || undefined,
    accountId: accountId || undefined,
    kind,
    search: search || undefined,
    limit: 400,
  });

  const accounts = (boot.data?.accounts ?? []).filter((a) => !a.archived);

  // 每月「规律预算注入」是展示用的虚拟行，不落库
  const grantsEnabled = (kind === "all" || kind === "quota_grant") && !search.trim();
  const grants = useQuotaGrants(from, to, grantsEnabled);

  const rows = useMemo<Row[]>(() => {
    const list: Row[] = [];
    if (kind !== "quota_grant") {
      for (const e of events.data ?? []) {
        list.push({ key: e.id, date: e.accrualDate, seq: e.seq, type: "event", event: e });
      }
    }
    if (grantsEnabled) {
      for (const g of grants.data ?? []) {
        list.push({
          key: `quota:${g.accountId}:${g.month}`,
          date: `${g.month}-01`,
          seq: 0,
          type: "grant",
          grant: g,
        });
      }
    }
    list.sort((a, b) => (a.date === b.date ? b.seq - a.seq : a.date < b.date ? 1 : -1));
    return list;
  }, [events.data, grants.data, grantsEnabled, kind]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t("起始月")}>
          <Input
            type="month"
            className="w-[130px]"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label={t("结束月")}>
          <Input
            type="month"
            className="w-[130px]"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <Field label={t("账户")}>
          <Select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-[140px]"
          >
            <option value="">{t("全部账户")}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("类型")}>
          <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-[130px]">
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {t(k.label)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("搜索")}>
          <Input
            className="w-[200px]"
            placeholder={t("项目 / 备注 / 理由")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        <div className="ml-auto text-[11px] text-slate-500">
          {t("{{n}} 条（最多 400）", { n: rows.length })}
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("日期")}</th>
              <th>{t("类型")}</th>
              <th>{t("项目")}</th>
              <th>{t("账户")}</th>
              <th>{t("池")}</th>
              <th>{t("分级")}</th>
              <th className="text-right">{t("金额")}</th>
              <th>{t("预算月")}</th>
              <th>{t("状态")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) =>
              row.type === "grant" ? (
                <tr
                  key={row.key}
                  className="cursor-pointer bg-sky-950/10"
                  onClick={() =>
                    setGrantAccount({ id: row.grant.accountId, name: row.grant.accountName })
                  }
                >
                  <td className="num text-slate-400">{row.date}</td>
                  <td>
                    <Badge tone="sky">{t("预算注入")}</Badge>
                  </td>
                  <td className="text-slate-300">
                    {t("规律预算注入")}
                    {row.grant.isFuture && (
                      <span className="ml-1 text-[11px] text-slate-600">{t("（预计）")}</span>
                    )}
                  </td>
                  <td className="text-slate-400">{row.grant.accountName}</td>
                  <td className="text-slate-400">{t("规律")}</td>
                  <td className="text-slate-500">—</td>
                  <td className="num text-right text-sky-300">+{yuan(row.grant.amount)}</td>
                  <td className="num text-slate-500">{row.grant.month}</td>
                  <td>
                    <Badge tone="slate">{t("虚拟")}</Badge>
                  </td>
                </tr>
              ) : (
                <tr
                  key={row.key}
                  className="cursor-pointer"
                  onClick={() => setSelected(row.event.id)}
                >
                  <td className="num text-slate-400">{row.event.accrualDate}</td>
                  <td>
                    <Badge tone={row.event.kind === "futures_order" ? "violet" : "slate"}>
                      {t(kindLabel(row.event.kind))}
                    </Badge>
                  </td>
                  <td className="max-w-[260px] truncate text-slate-200">
                    {row.event.title ?? row.event.note ?? "—"}
                    {row.event.vendorName && (
                      <span className="ml-1 text-[11px] text-slate-600">
                        {row.event.vendorName}
                      </span>
                    )}
                  </td>
                  <td className="text-slate-400">
                    {row.event.accountName ?? "—"}
                    {row.event.toAccountName && (
                      <span className="text-slate-500"> → {row.event.toAccountName}</span>
                    )}
                  </td>
                  <td className="text-slate-400">{t(poolLabel(row.event.pool))}</td>
                  <td className="text-slate-400">{row.event.tagLabel ?? "—"}</td>
                  <td
                    className={cls(
                      "num text-right",
                      row.event.direction === "income" && "text-emerald-400",
                      row.event.direction === "expense" && "text-slate-100",
                    )}
                  >
                    {row.event.direction === "income"
                      ? "+"
                      : row.event.direction === "expense"
                        ? "−"
                        : ""}
                    {yuan(row.event.amount)}
                  </td>
                  <td className="num text-slate-500">{row.event.budgetMonth}</td>
                  <td>
                    <Badge tone={statusTone(row.event.status)}>
                      {t(statusLabel(row.event.status))}
                    </Badge>
                  </td>
                </tr>
              ),
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <Empty title={t("没有交易记录")} hint={t("从「记一笔」开始")} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && <EventDrawer id={selected} onClose={() => setSelected(null)} />}
      {grantAccount && (
        <QuotaHistoryModal
          accountId={grantAccount.id}
          accountName={grantAccount.name}
          onClose={() => setGrantAccount(null)}
        />
      )}
    </div>
  );
}

/** 规律预算的额度变更历史（配额是配置，这里只读展示） */
function QuotaHistoryModal({
  accountId,
  accountName,
  onClose,
}: {
  accountId: string;
  accountName: string;
  onClose: () => void;
}) {
  const history = useQuotaHistory(accountId);

  return (
    <Modal
      open
      title={t("规律预算注入 · {{name}}", { name: accountName })}
      onClose={onClose}
      width={520}
      footer={
        <Button size="sm" onClick={onClose}>
          {t("关闭")}
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="rounded border border-sky-800/50 bg-sky-950/20 px-3 py-2 text-[11px] leading-relaxed text-sky-200">
          {t("每月初系统会把该账户的规律预算注入本月额度（相当于「本月第一笔可支配额」）。它属于")}
          <b>{t("预算分配")}</b>
          {t("，不是收入——不计入利润表与现金流量表；月末未花完的部分会结转进一次性预算。")}
        </div>

        <div>
          <div className="section-title mb-1">{t("额度变更历史（生效月份）")}</div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("生效月份")}</th>
                  <th className="text-right">{t("每月额度")}</th>
                </tr>
              </thead>
              <tbody>
                {(history.data ?? []).map((p) => (
                  <tr key={p.month}>
                    <td className="num text-slate-300">{monthLabel(p.month)}</td>
                    <td className="num text-right text-sky-300">{yuan(p.amount)}</td>
                  </tr>
                ))}
                {(history.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={2} className="text-slate-600">
                      {t("暂无额度记录")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-1 text-[11px] text-slate-600">
            {t("修改额度从下个月生效；同一生效月份重复修改会覆盖前一次。")}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function EventDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const detail = useEventDetail(id);
  const [action, setAction] = useState<null | "reverse" | "pay" | "settle" | "rollover" | "cancel">(
    null,
  );
  const [obFor, setObFor] = useState<Obligation | null>(null);

  const d = detail.data;
  if (!d) {
    return (
      <Modal open title={t("加载中…")} onClose={onClose} width={720}>
        <div className="py-8 text-center text-slate-500">{t("读取中")}</div>
      </Modal>
    );
  }
  const e = d.event;
  const canReverse = [
    "spot",
    "futures_order",
    "accrual",
    "income",
    "transfer",
    "accrual_settle",
  ].includes(e.kind);
  const openObs = d.obligations.filter((o) => o.status === "pending" || o.status === "frozen");

  return (
    <>
      <Modal
        open
        title={
          <span className="flex items-center gap-2">
            {t(kindLabel(e.kind))}
            <Badge tone={statusTone(e.status)}>{t(statusLabel(e.status))}</Badge>
            <span className="text-[11px] font-normal text-slate-500">#{e.seq}</span>
          </span>
        }
        onClose={onClose}
        width={760}
        footer={
          <>
            <Button size="sm" onClick={onClose}>
              {t("关闭")}
            </Button>
            {canReverse && (
              <Button size="sm" variant="warn" onClick={() => setAction("reverse")}>
                {t("冲销")}
              </Button>
            )}
            {e.kind === "budget_realize" && (
              <Button
                size="sm"
                variant="warn"
                onClick={async () => {
                  try {
                    await api.undoRealize(e.id);
                    toast(t("已撤回该笔兑现"), "success");
                    onClose();
                  } catch (err) {
                    toast(errorMessage(err), "error");
                  }
                }}
              >
                {t("撤回兑现")}
              </Button>
            )}
            {e.kind === "futures_order" && e.status !== "reversed" && (
              <Button size="sm" variant="danger" onClick={() => setAction("cancel")}>
                {t("取消订单")}
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3 text-[12px]">
            <Info label={t("金额")} value={yuan(e.amount)} mono />
            <Info
              label={e.kind === "futures_order" ? t("定金账户") : t("账户")}
              value={e.accountName ?? "—"}
            />
            <Info
              label={e.kind === "futures_order" ? t("定金预算池") : t("预算池")}
              value={t(poolLabel(e.pool))}
            />
            {e.kind === "futures_order" && (
              <>
                <Info label={t("尾款账户")} value={e.toAccountName ?? t("同定金账户")} />
                <Info label={t("尾款预算池")} value={t(poolLabel(e.toPool))} />
              </>
            )}
            <Info label={t("预算月")} value={e.budgetMonth} mono />
            <Info label={t("权责日")} value={e.accrualDate} mono />
            <Info label={t("现金日")} value={e.cashDate ?? t("未收付")} mono />
            <Info label={t("分级")} value={e.tagLabel ? t(e.tagLabel) : "—"} />
            <Info label={t("供应商")} value={e.vendorName ?? "—"} />
          </div>
          {e.originalAmount != null && (
            <div className="text-[12px] text-slate-400">
              {t("原币")} {e.originalAmount} {e.currency}
              {e.fxRate && (
                <span className="ml-2">
                  {t("汇率")} {e.fxRate}
                </span>
              )}
            </div>
          )}

          {(e.title || e.reason || e.urgency || e.expectedEffect || e.necessity || e.purpose) && (
            <Card className="card-pad space-y-1 text-[12px]">
              {e.title && <Row k={t("项目")} v={e.title} />}
              {e.reason && <Row k={t("消费理由")} v={e.reason} />}
              {e.urgency && <Row k={t("时效性")} v={e.urgency} />}
              {e.marketPrice != null && <Row k={t("市场均价")} v={yuan(e.marketPrice)} />}
              {e.expectedEffect && <Row k={t("预期使用效果")} v={e.expectedEffect} />}
              {e.usageMonths != null && (
                <Row k={t("使用时长")} v={t("{{n}} 个月", { n: e.usageMonths })} />
              )}
              {e.necessity && <Row k={t("采购必要性")} v={e.necessity} />}
              {e.purpose && <Row k={t("预期目的")} v={e.purpose} />}
              {e.note && <Row k={t("备注")} v={e.note} />}
            </Card>
          )}

          {d.lines.length > 0 && (
            <div>
              <div className="section-title mb-1">{t("订单明细")}</div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("类型")}</th>
                    <th>{t("名称")}</th>
                    <th className="text-right">{t("数量")}</th>
                    <th className="text-right">{t("单价")}</th>
                    <th className="text-right">{t("小计")}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.lines.map((l) => (
                    <tr key={l.id}>
                      <td>{l.kind === "fee" ? t("费用") : t("商品")}</td>
                      <td>{l.name}</td>
                      <td className="num text-right">{l.qty}</td>
                      <td className="num text-right">{yuan(l.unitPrice)}</td>
                      <td className="num text-right">{yuan(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="section-title mb-1">{t("预算分录")}</div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("月份")}</th>
                    <th>{t("池")}</th>
                    <th className="text-right">{t("影响")}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.postings.map((p, i) => (
                    <tr key={i}>
                      <td className="num">{p.month}</td>
                      <td>{t(poolLabel(p.pool))}</td>
                      <td
                        className={cls(
                          "num text-right",
                          p.amount > 0 ? "text-emerald-400" : "text-slate-200",
                        )}
                      >
                        {p.amount > 0 ? "+" : ""}
                        {yuan(p.amount)}
                      </td>
                    </tr>
                  ))}
                  {d.postings.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-slate-600">
                        {t("无预算影响")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div>
              <div className="section-title mb-1">{t("现金流")}</div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("日期")}</th>
                    <th className="text-right">{t("金额")}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.cash.map((c, i) => (
                    <tr key={i}>
                      <td className="num">{c.date}</td>
                      <td
                        className={cls(
                          "num text-right",
                          c.amount > 0 ? "text-emerald-400" : "text-rose-300",
                        )}
                      >
                        {c.amount > 0 ? "+" : ""}
                        {yuan(c.amount)}
                      </td>
                    </tr>
                  ))}
                  {d.cash.length === 0 && (
                    <tr>
                      <td colSpan={2} className="text-slate-600">
                        {t("暂无现金流动")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {openObs.length > 0 && (
            <div>
              <div className="section-title mb-1">{t("未付义务")}</div>
              {openObs.map((o) => (
                <div
                  key={o.id}
                  className="mb-1 flex items-center justify-between rounded border border-slate-800 px-3 py-2 text-[12px]"
                >
                  <div>
                    <span className="text-slate-300">
                      {t(o.kind === "accrual" ? "计提" : "尾款")} · {monthLabel(o.dueMonth)}
                    </span>
                    <span className="ml-2 text-slate-500">
                      {t("已付 {{a}} / {{b}}", { a: yuan(o.paidAmount), b: yuan(o.amount) })}
                    </span>
                    <Badge tone={o.status === "frozen" ? "sky" : "amber"} className="ml-2">
                      {t(obligationStatusLabel(o.status))}
                    </Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        try {
                          await api.freezeObligation(o.id, o.status !== "frozen", todayStr());
                          toast(
                            t(o.status === "frozen" ? "已解冻" : "已冻结"),
                            "success",
                          );
                        } catch (err) {
                          toast(errorMessage(err), "error");
                        }
                      }}
                    >
                      {t(o.status === "frozen" ? "解冻" : "冻结")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setObFor(o);
                        setAction("settle");
                      }}
                    >
                      {t("核销")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setObFor(o);
                        setAction("rollover");
                      }}
                    >
                      {t("展期")}
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        setObFor(o);
                        setAction("pay");
                      }}
                    >
                      {t("支付")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Attachments eventId={e.id} items={d.attachments} />

          {d.related.length > 0 && (
            <div>
              <div className="section-title mb-1">{t("关联事件（审计）")}</div>
              <div className="space-y-1">
                {d.related.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-[12px] text-slate-400">
                    <span className="num text-slate-600">#{r.seq}</span>
                    <Badge tone="slate">{t(kindLabel(r.kind))}</Badge>
                    <span className="num">{r.accrualDate}</span>
                    <span className="num">{yuan(r.amount)}</span>
                    <span className="text-slate-600">{t(statusLabel(r.status))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {action === "reverse" && <ReverseModal event={e} onClose={() => setAction(null)} />}
      {action === "pay" && obFor && <PayModal ob={obFor} onClose={() => setAction(null)} />}
      {action === "settle" && obFor && <SettleModal ob={obFor} onClose={() => setAction(null)} />}
      {action === "rollover" && obFor && (
        <RolloverModal ob={obFor} onClose={() => setAction(null)} />
      )}
      {action === "cancel" && <CancelModal event={e} onClose={() => setAction(null)} />}
    </>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-600">{label}</div>
      <div className={cls("mt-0.5 text-slate-200", mono && "num")}>{value}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-24 shrink-0 text-slate-500">{k}</span>
      <span className="text-slate-300">{v}</span>
    </div>
  );
}

function Attachments({
  eventId,
  items,
}: {
  eventId: string;
  items: EventDetail["attachments"];
}) {
  const invalidate = useInvalidateAll();
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div className="section-title">{t("附件")}</div>
        <Button
          size="sm"
          onClick={async () => {
            try {
              const picked = await openFileDialog({
                multiple: false,
                filters: [
                  { name: t("图片/PDF"), extensions: ["png", "jpg", "jpeg", "webp", "pdf"] },
                ],
              });
              if (!picked || Array.isArray(picked)) return;
              await api.addAttachment(eventId, picked);
              invalidate();
              toast(t("附件已添加"), "success");
            } catch (err) {
              toast(errorMessage(err), "error");
            }
          }}
        >
          {t("+ 添加附件")}
        </Button>
      </div>
      {items.length === 0 ? (
        <div className="text-[11px] text-slate-600">
          {t("支持订单截图、商品链接截图、PDF")}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((a) => (
            <button
              key={a.id}
              className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-sky-600"
              onClick={() =>
                api.openAttachment(a.storedName).catch((err) => toast(errorMessage(err), "error"))
              }
            >
              {a.fileName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 操作弹窗
// ---------------------------------------------------------------------------

function ReverseModal({ event, onClose }: { event: EventView; onClose: () => void }) {
  const invalidate = useInvalidateAll();
  const [amount, setAmount] = useState(event.amount);
  const [refund, setRefund] = useState(event.amount);
  const [date, setDate] = useState(todayStr());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open
      title={`${t("冲销")} · ${t(kindLabel(event.kind))}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t("取消")}</Button>
          <Button
            variant="warn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api.reverse({
                  eventId: event.id,
                  amount,
                  date,
                  reason: reason || null,
                  refundAmount: refund,
                  title: event.title,
                });
                r.warnings.forEach((w) => toast(w, "info"));
                toast(t("冲销完成"), "success");
                invalidate();
                onClose();
              } catch (e) {
                toast(errorMessage(e), "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("确认冲销")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded border border-amber-800/50 bg-amber-950/20 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
          {t("冲销不修改原记录：它会追加一条反向事件。退款一律进入")}
          <b>{t("一次性预算")}</b>
          {t("；超过原金额的部分会自动作为一笔新支出。计数器会同时恢复。")}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={t("冲销金额")}
            required
            hint={t("原交易 {{x}}", { x: yuan(event.amount) })}
          >
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
          <Field label={t("实际退款金额")} hint={t("没钱退回时填 0")}>
            <MoneyInput value={refund} onChange={setRefund} />
          </Field>
          <Field label={t("冲销日期")} required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t("冲销理由")}>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

export function PayModal({ ob, onClose }: { ob: Obligation; onClose: () => void }) {
  const invalidate = useInvalidateAll();
  const remaining = ob.amount - ob.paidAmount;
  const [amount, setAmount] = useState(remaining);
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open
      title={t("支付尾款 · {{m}}", { m: monthLabel(ob.dueMonth) })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t("取消")}</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.payObligation(ob.id, amount, date, note || undefined);
                toast(t("支付已记录（仅影响现金流，预算已锁定）"), "success");
                invalidate();
                onClose();
              } catch (e) {
                toast(errorMessage(e), "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("确认支付")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="text-[12px] text-slate-400">
          {t("应付 {{a}}，已付 {{b}}，未付", {
            a: yuan(ob.amount),
            b: yuan(ob.paidAmount),
          })}{" "}
          <b className="text-amber-300">{yuan(remaining)}</b>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("本次支付金额")} required>
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
          <Field label={t("支付日期")} required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label={t("备注")}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export function SettleModal({ ob, onClose }: { ob: Obligation; onClose: () => void }) {
  const invalidate = useInvalidateAll();
  const [value, setValue] = useState(ob.amount);
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const delta = value - ob.amount;

  return (
    <Modal
      open
      title={t("核销尾款（改预估金额）")}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t("取消")}</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.settleObligation(ob.id, value, date, note || undefined);
                toast(t("核销完成，预算已重算"), "success");
                invalidate();
                onClose();
              } catch (e) {
                toast(errorMessage(e), "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("确认核销")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="text-[12px] text-slate-400">
          {t("原预估 {{a}}，已付 {{b}}", { a: yuan(ob.amount), b: yuan(ob.paidAmount) })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("新的尾款金额")} required>
            <MoneyInput value={value} onChange={setValue} />
          </Field>
          <Field label={t("核销日期")} required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <div className="rounded border border-slate-800 px-3 py-2 text-[11px] text-slate-400">
          {t("差额 {{x}} 将按原预算池从 {{m}} 调整（若该月已结账则记入当前月）。", {
            x: `${delta >= 0 ? "+" : ""}${yuan(delta)}`,
            m: monthLabel(ob.dueMonth),
          })}
        </div>
        <Field label={t("备注")}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export function RolloverModal({ ob, onClose }: { ob: Obligation; onClose: () => void }) {
  const invalidate = useInvalidateAll();
  const [month, setMonth] = useState(addMonths(ob.dueMonth, 1));
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open
      title={t("展期尾款")}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t("取消")}</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.rolloverObligation(ob.id, month, date, note || undefined);
                toast(t("已展期到 {{m}}", { m: monthLabel(month) }), "success");
                invalidate();
                onClose();
              } catch (e) {
                toast(errorMessage(e), "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("确认展期")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="text-[12px] text-slate-400">
          {t("原尾款月 {{a}}，金额 {{b}}", {
            a: monthLabel(ob.dueMonth),
            b: yuan(ob.amount),
          })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("新的尾款月")} required>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </Field>
          <Field label={t("操作日期")} required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <div className="text-[11px] text-slate-500">
          {t("展期会生成「释放原月 + 锁定新月」两条分录，并计入平均延期天数；不可冲销，只能反向展期。")}
        </div>
        <Field label={t("原因")}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function CancelModal({ event, onClose }: { event: EventView; onClose: () => void }) {
  const invalidate = useInvalidateAll();
  const [reasonKind, setReasonKind] = useState("self");
  const [refund, setRefund] = useState(0);
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open
      title={t("取消期货订单")}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t("取消")}</Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.cancelFutures(event.id, reasonKind, refund, date, note || undefined);
                toast(t("订单已取消，未付锁定已释放"), "success");
                invalidate();
                onClose();
              } catch (e) {
                toast(errorMessage(e), "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("确认取消")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("取消原因")}>
            <Select value={reasonKind} onChange={(e) => setReasonKind(e.target.value)}>
              <option value="self">{t("自己取消")}</option>
              <option value="vendor">{t("商家跳票 / 违约")}</option>
            </Select>
          </Field>
          <Field label={t("退款金额")} hint={t("退回一次性预算，可为 0")}>
            <MoneyInput value={refund} onChange={setRefund} />
          </Field>
        </div>
        <Field label={t("取消日期")}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t("备注")}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="text-[11px] text-slate-500">
          {t("取消会计入跳票率统计（自己取消与商家违约都算「未按最初约定」）。")}
        </div>
      </div>
    </Modal>
  );
}
