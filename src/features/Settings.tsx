import { t } from "../lib/i18n";
import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { useBootstrap, useInvalidateAll } from "../lib/queries";
import { api, errorMessage } from "../lib/ipc";
import { fieldLabel, yuan } from "../lib/format";
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  MoneyInput,
  SectionTitle,
  toast,
} from "../components/ui";

export default function SettingsPage() {
  const boot = useBootstrap();
  const invalidate = useInvalidateAll();
  const [cushion, setCushion] = useState<number | null>(null);
  const [forecast, setForecast] = useState<string | null>(null);
  const [maxMb, setMaxMb] = useState<string | null>(null);

  if (!boot.data) return <Empty title={t("加载中…")} />;
  const s = boot.data.settings;
  const cushionValue = cushion ?? Number(s.safety_cushion ?? "0");
  const forecastValue = forecast ?? s.forecast_months ?? "12";
  const maxMbValue = maxMb ?? s.attachment_max_mb ?? "20";

  async function saveSetting(key: string, value: string, label: string) {
    try {
      await api.saveSetting(key, value);
      toast(`${label} 已保存`, "success");
      invalidate();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  async function backup() {
    try {
      const dest = await save({
        defaultPath: `boxfuture-backup-${boot.data?.today}.db`,
        filters: [{ name: "SQLite", extensions: ["db"] }],
      });
      if (!dest) return;
      await api.backupDatabase(dest);
      toast("备份已导出", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <div className="grid grid-cols-2 gap-5">
      <div className="space-y-4">
        <div>
          <SectionTitle>{t("预算参数")}</SectionTitle>
          <Card className="card-pad space-y-3">
            <Field
              label={t("安全垫（元）")}
              hint={t("计算「超前消费能力」时保留的安全余量")}
            >
              <div className="flex gap-2">
                <MoneyInput value={cushionValue} onChange={setCushion} />
                <Button
                  onClick={() => saveSetting("safety_cushion", String(cushionValue), "安全垫")}
                >{t("保存")}</Button>
              </div>
            </Field>
            <Field label={t("未来义务预测月数")} hint={t("仪表盘与平摊表展示的月数")}>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={forecastValue}
                  onChange={(e) => setForecast(e.target.value)}
                />
                <Button
                  onClick={() => saveSetting("forecast_months", forecastValue, "预测月数")}
                >{t("保存")}</Button>
              </div>
            </Field>
            <Field label={t("单个附件大小上限（MB）")}>
              <div className="flex gap-2">
                <Input type="number" value={maxMbValue} onChange={(e) => setMaxMb(e.target.value)} />
                <Button onClick={() => saveSetting("attachment_max_mb", maxMbValue, "附件上限")}>{t("保存")}</Button>
              </div>
            </Field>
          </Card>
        </div>

        <div>
          <SectionTitle>{t("数据")}</SectionTitle>
          <Card className="card-pad space-y-2">
            <div className="text-[11px] text-slate-500">{t("数据库位置")}</div>
            <div className="break-all rounded bg-slate-950/60 px-2 py-1.5 font-mono text-[11px] text-slate-400">
              {boot.data.dbPath}
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="primary" onClick={backup}>{t("导出备份")}</Button>
            </div>
            <div className="pt-1 text-[11px] leading-relaxed text-slate-600">
              {t("备份为 SQLite 快照；附件位于同目录的 attachments 文件夹，需要一并复制。所有交易均为追加式存储，不会物理删除。")}
            </div>
          </Card>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <SectionTitle>{t("消费分级（只读）")}</SectionTitle>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("分级")}</th>
                  <th className="text-right">{t("区间（元）")}</th>
                  <th className="text-right">{t("月度次数")}</th>
                  <th>{t("必填项")}</th>
                </tr>
              </thead>
              <tbody>
                {boot.data.tagRules.map((r) => (
                  <tr key={r.tag}>
                    <td className="text-slate-200">
                      {r.label}
                      {r.monthlyLimit != null && <Badge tone="amber" className="ml-1">{t("限额")}</Badge>}
                    </td>
                    <td className="num text-right text-slate-400">
                      {yuan(r.minAmount)} ~ {r.maxAmount == null ? "∞" : yuan(r.maxAmount)}
                    </td>
                    <td className="num text-right text-slate-400">
                      {r.monthlyLimit ?? "—"}
                    </td>
                    <td className="text-[11px] text-slate-500">
                      {r.requiredFields.map(fieldLabel).join("、") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <SectionTitle>{t("账本原则")}</SectionTitle>
          <Card className="card-pad space-y-1.5 text-[11px] leading-relaxed text-slate-400">
            <div>· 交易只追加，修改通过冲销 / 核销 / 展期等反向事件完成。</div>
            <div>· 规律预算按月重置，结余自动转入一次性预算。</div>
            <div>· 一次性预算不可再生，不能转回规律预算。</div>
            <div>· 已结账月份锁定，补录需先「重开上月」。</div>
            <div>· 预算释放（退款 / 冲销）一律回到一次性预算。</div>
            <div>· 额外成本先扣一次性，不足再扣规律预算（规律可为负）。</div>
            <div>· 消费分级按金额自动判定，必填项未填无法保存。</div>
          </Card>
        </div>

        <div>
          <SectionTitle>{t("币种")}</SectionTitle>
          <Card className="card-pad">
            <div className="flex flex-wrap gap-2">
              {boot.data.currencies.map((c) => (
                <Badge key={c.code} tone={c.code === "CNY" ? "sky" : "slate"}>
                  {c.code} {c.name}（{c.minorUnit} 位小数）
                </Badge>
              ))}
            </div>
            <div className="mt-2 text-[11px] text-slate-600">{t("首版以人民币为本位币；外币金额仅作为订单元数据记录，汇率手工填写。")}</div>
          </Card>
        </div>
      </div>
    </div>
  );
}
