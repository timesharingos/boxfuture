import { t } from "../lib/i18n";
import { useState } from "react";
import { useBootstrap, useInvalidateAll } from "../lib/queries";
import { api, errorMessage } from "../lib/ipc";
import { monthLabel, yuan } from "../lib/format";
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
import { useMonth } from "../App";

const KIND_OPTIONS = [
  { value: "bank", label: "银行卡" },
  { value: "cash", label: "现金" },
  { value: "reserve", label: "储备" },
  { value: "investment", label: "投资" },
  { value: "credit", label: "信用/负债" },
];

export default function Accounts() {
  const boot = useBootstrap();
  const { month } = useMonth();
  const invalidate = useInvalidateAll();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<{
    id: string;
    name: string;
    kind: string;
    note: string;
    sort: number;
  } | null>(null);

  const accounts = boot.data?.accounts ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[12px] text-slate-400">
          {t("逻辑账户内部包含两个资金池：规律（每月重置）与一次性（不可再生）")}
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          {t("+ 新建账户")}
        </Button>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("账户")}</th>
              <th>{t("类型")}</th>
              <th className="text-right">{t("{{m}} 规律额度", { m: monthLabel(month) })}</th>
              <th className="text-right">{t("规律可用")}</th>
              <th className="text-right">{t("一次性余额")}</th>
              <th>{t("备注")}</th>
              <th className="text-right">{t("操作")}</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className={a.archived ? "opacity-50" : ""}>
                <td className="text-slate-200">
                  {a.name}
                  {a.archived && (
                    <Badge tone="slate" className="ml-2">
                      {t("已归档")}
                    </Badge>
                  )}
                </td>
                <td className="text-slate-400">
                  {t(KIND_OPTIONS.find((k) => k.value === a.kind)?.label ?? a.kind)}
                </td>
                <td className="num text-right">{yuan(a.quota)}</td>
                <td
                  className={
                    "num text-right " + (a.recurringBalance < 0 ? "text-rose-400" : "")
                  }
                >
                  {yuan(a.recurringBalance)}
                </td>
                <td className="num text-right">{yuan(a.oneoffBalance)}</td>
                <td className="max-w-[200px] truncate text-slate-500">{a.note ?? "—"}</td>
                <td>
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setEditing({
                          id: a.id,
                          name: a.name,
                          kind: a.kind,
                          note: a.note ?? "",
                          sort: a.sort,
                        })
                      }
                    >
                      {t("编辑")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        try {
                          await api.setAccountArchived(a.id, !a.archived);
                          invalidate();
                        } catch (e) {
                          toast(errorMessage(e), "error");
                        }
                      }}
                    >
                      {t(a.archived ? "恢复" : "归档")}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <Empty title={t("还没有账户")} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Card className="card-pad text-[11px] leading-relaxed text-slate-500">
        <div className="mb-1 font-medium text-slate-400">{t("关于归档")}</div>
        {t("归档的账户不再参与月结与统计，但历史记录完整保留。已归档账户不能新建交易。")}
      </Card>

      <CreateAccountModal open={creating} onClose={() => setCreating(false)} month={month} />
      {editing && <EditAccountModal editing={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CreateAccountModal({
  open,
  onClose,
  month,
}: {
  open: boolean;
  onClose: () => void;
  month: string;
}) {
  const invalidate = useInvalidateAll();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("bank");
  const [quota, setQuota] = useState(0);
  const [oneoff, setOneoff] = useState(0);
  const [note, setNote] = useState("");

  return (
    <Modal
      open={open}
      title={t("新建逻辑账户")}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t("取消")}</Button>
          <Button
            variant="primary"
            onClick={async () => {
              if (!name.trim()) return toast(t("请输入账户名称"), "error");
              try {
                await api.createAccount({
                  name,
                  kind,
                  initialQuota: quota,
                  initialOneoff: oneoff,
                  initialMonth: month,
                  note: note || null,
                });
                toast(t("账户已创建"), "success");
                invalidate();
                setName("");
                setQuota(0);
                setOneoff(0);
                setNote("");
                onClose();
              } catch (e) {
                toast(errorMessage(e), "error");
              }
            }}
          >
            {t("创建")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("名称")} required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("如：日常卡")}
            />
          </Field>
          <Field label={t("类型")}>
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              {KIND_OPTIONS.map((k) => (
                <option key={k.value} value={k.value}>
                  {t(k.label)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={t("{{m}} 起的规律预算", { m: monthLabel(month) })}
            hint={t("创建当月即刻生效；0 表示不使用规律预算")}
          >
            <MoneyInput value={quota} onChange={setQuota} />
          </Field>
          <Field label={t("初始一次性预算")} hint={t("正数为期初余额，负数为期初欠款")}>
            <MoneyInput value={oneoff} onChange={setOneoff} />
          </Field>
        </div>
        <Field label={t("备注")}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function EditAccountModal({
  editing,
  onClose,
}: {
  editing: { id: string; name: string; kind: string; note: string; sort: number };
  onClose: () => void;
}) {
  const invalidate = useInvalidateAll();
  const [draft, setDraft] = useState(editing);

  return (
    <Modal
      open
      title={t("编辑账户")}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t("取消")}</Button>
          <Button
            variant="primary"
            onClick={async () => {
              try {
                await api.updateAccount({
                  id: draft.id,
                  name: draft.name,
                  kind: draft.kind,
                  note: draft.note,
                  sort: draft.sort,
                });
                toast(t("已保存"), "success");
                invalidate();
                onClose();
              } catch (e) {
                toast(errorMessage(e), "error");
              }
            }}
          >
            {t("保存")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("名称")}>
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field label={t("类型")}>
            <Select
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
            >
              {KIND_OPTIONS.map((k) => (
                <option key={k.value} value={k.value}>
                  {t(k.label)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t("排序")}>
          <Input
            type="number"
            value={draft.sort}
            onChange={(e) => setDraft({ ...draft, sort: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label={t("备注")}>
          <Textarea
            value={draft.note}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          />
        </Field>
      </div>
    </Modal>
  );
}
