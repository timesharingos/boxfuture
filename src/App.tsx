import { createContext, useContext, useState } from "react";
import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { useAccounts, useBootstrap, useInvalidateAll } from "./lib/queries";
import { errorMessage } from "./lib/ipc";
import { currentMonthStr, monthLabel } from "./lib/format";
import { useT } from "./lib/i18n";
import { Toaster, Button, toast } from "./components/ui";
import Dashboard from "./features/Dashboard";
import NewEntry from "./features/NewEntry";
import Ledger from "./features/Ledger";
import Budget from "./features/Budget";
import Future from "./features/Future";
import Accounts from "./features/Accounts";
import Reports from "./features/Reports";
import SettingsPage from "./features/Settings";

interface MonthCtx {
  month: string;
  setMonth: (m: string) => void;
}
const MonthContext = createContext<MonthCtx>({ month: currentMonthStr(), setMonth: () => {} });
export function useMonth() {
  return useContext(MonthContext);
}

const NAV = [
  { to: "/", label: "仪表盘", icon: "M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" },
  { to: "/entry", label: "记一笔", icon: "M12 5v14M5 12h14" },
  {
    to: "/ledger",
    label: "账本",
    icon: "M4 5h16M4 12h16M4 19h10",
  },
  {
    to: "/budget",
    label: "预算",
    icon: "M4 19V9m5 10V5m5 14v-7m5 7V8",
  },
  {
    to: "/future",
    label: "未来义务",
    icon: "M12 3v18M5 8l7-5 7 5M5 16l7 5 7-5",
  },
  {
    to: "/accounts",
    label: "账户",
    icon: "M3 7h18v12H3zM3 7l3-3h12l3 3",
  },
  {
    to: "/reports",
    label: "报表",
    icon: "M4 20V4m0 16h16M8 16l4-6 3 3 4-7",
  },
  {
    to: "/settings",
    label: "设置",
    icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 01-.1 1.2l2 1.6-2 3.4-2.3-.9a7 7 0 01-2 1.2L14.2 21h-4l-.4-2.5a7 7 0 01-2-1.2l-2.3.9-2-3.4 2-1.6A7 7 0 015 12",
  },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export default function App() {
  const { t, lang, setLang } = useT();
  const [month, setMonth] = useState(currentMonthStr());
  const navigate = useNavigate();
  const bootstrap = useBootstrap();
  const monthAccounts = useAccounts(month);
  const invalidate = useInvalidateAll();

  return (
    <MonthContext.Provider value={{ month, setMonth }}>
      <div className="flex h-full">
        <aside className="flex w-[188px] shrink-0 flex-col border-r border-slate-800 bg-[#0a0e15]">
          <div className="flex items-center gap-2 px-4 py-4">
            <div className="h-6 w-6 rounded bg-gradient-to-br from-sky-400 to-sky-600" />
            <div>
              <div className="text-[13px] font-semibold tracking-wide text-slate-100">boxfuture</div>
              <div className="text-[10px] text-slate-600">{t("权责发生制记账")}</div>
            </div>
          </div>
          <nav className="flex flex-1 flex-col gap-0.5 px-2">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                className={({ isActive }) =>
                  "nav-item " + (isActive ? "nav-item-active" : "")
                }
              >
                <Icon d={n.icon} />
                {t(n.label)}
              </NavLink>
            ))}
          </nav>
          <div className="border-t border-slate-800 px-3 py-2">
            <button
              className="btn btn-primary w-full"
              onClick={() => navigate("/entry")}
            >
              + {t("记一笔")}
            </button>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800 px-4">
            <div className="flex items-center gap-3">
              <input
                type="month"
                className="input num w-[140px]"
                value={month}
                onChange={(e) => setMonth(e.target.value || currentMonthStr())}
              />
              {bootstrap.data?.closedMonths?.includes(month) && (
                <span className="badge bg-amber-500/15 text-amber-300">
                  {month === bootstrap.data?.currentMonth
                    ? t("本月已结账")
                    : t("{{m}} 已结账", { m: monthLabel(month) })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {monthAccounts.data && (
                <span className="text-[11px] text-slate-600">
                  {t("{{m}} 规律总额", { m: monthLabel(month) })}{" "}
                  {(
                    monthAccounts.data
                      .filter((a) => !a.archived)
                      .reduce((s, a) => s + a.recurringBalance, 0) / 100
                  ).toFixed(2)}
                </span>
              )}
              <button
                className="btn btn-sm"
                title={lang === "zh" ? "Switch to English" : "切换到中文"}
                onClick={() => setLang(lang === "zh" ? "en" : "zh")}
              >
                {lang === "zh" ? "EN" : "中文"}
              </button>
              <Button
                size="sm"
                onClick={() => {
                  invalidate();
                  toast(t("已刷新"), "success");
                }}
              >
                {t("刷新")}
              </Button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-auto p-5">
            {bootstrap.isError && (
              <div className="card card-pad mb-4 border-rose-800/60 text-rose-300">
                {t("初始化失败：")}
                {errorMessage(bootstrap.error)}
              </div>
            )}
            {bootstrap.data?.autoClosed && bootstrap.data.autoClosed.length > 0 && (
              <div className="card card-pad mb-4 border-sky-800/60 bg-sky-950/20 text-[12px] text-sky-200">
                <div className="font-medium">{t("已自动结账")}</div>
                {bootstrap.data.autoClosed.map((p) => (
                  <div key={p.month} className="mt-1 text-sky-300/80">
                    {t("{{m}}：规律结余结转至一次性预算 合计 {{x}}", {
                      m: monthLabel(p.month),
                      x: (p.total / 100).toFixed(2),
                    })}
                    {p.items.length > 0 && (
                      <span className="ml-2 text-sky-400/60">
                        {p.items.map((i) => `${i.accountName} ${(i.amount / 100).toFixed(2)}`).join(" / ")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/entry" element={<NewEntry />} />
              <Route path="/ledger" element={<Ledger />} />
              <Route path="/budget" element={<Budget />} />
              <Route path="/future" element={<Future />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </div>
        </main>
      </div>
      <Toaster />
    </MonthContext.Provider>
  );
}
