use crate::domain::*;
use rusqlite::params;
use serde::Serialize;

use crate::engine::Book;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PnlItem {
    pub kind: String,
    pub label: String,
    pub amount: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PnlMonth {
    pub month: String,
    pub income: i64,
    pub expense: i64,
    pub net: i64,
    pub items: Vec<PnlItem>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PnlReport {
    pub from: String,
    pub to: String,
    pub months: Vec<PnlMonth>,
    pub total_income: i64,
    pub total_expense: i64,
    pub total_net: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CashMonth {
    pub month: String,
    pub inflow: i64,
    pub outflow: i64,
    pub net: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CashReport {
    pub months: Vec<CashMonth>,
    pub total_inflow: i64,
    pub total_outflow: i64,
    pub by_account: Vec<AccountCash>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AccountCash {
    pub account_id: String,
    pub account_name: String,
    pub inflow: i64,
    pub outflow: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RealizeMonth {
    pub month: String,
    pub quota: i64,
    pub realized: i64,
    pub ratio: f64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RealizeAccount {
    pub account_id: String,
    pub account_name: String,
    pub quota: i64,
    pub realized: i64,
    pub ratio: f64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RealizeReport {
    pub from: String,
    pub to: String,
    pub months: Vec<RealizeMonth>,
    pub total_quota: i64,
    pub total_realized: i64,
    pub ratio: f64,
    pub by_account: Vec<RealizeAccount>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BudgetRow {
    pub account_id: String,
    pub account_name: String,
    pub quota: i64,
    pub recurring_used: i64,
    pub recurring_balance: i64,
    pub oneoff_in: i64,
    pub oneoff_out: i64,
    pub oneoff_balance: i64,
    pub over: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ForwardRow {
    pub month: String,
    pub futures_balance: i64,
    pub accrual: i64,
    pub total: i64,
    pub items: Vec<ForwardItem>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ForwardItem {
    pub kind: String,
    pub title: String,
    pub account_name: String,
    pub amount: i64,
    pub status: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HabitMonth {
    pub month: String,
    pub orders: i64,
    pub total: i64,
    pub rolled: i64,
    pub cancelled: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VendorStat {
    pub vendor_name: String,
    pub orders: i64,
    pub total: i64,
    pub rolled: i64,
    pub cancelled: i64,
    pub avg_extension_days: f64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HabitReport {
    pub months: Vec<HabitMonth>,
    pub vendors: Vec<VendorStat>,
    pub default_rate: f64,
    pub avg_extension_days: f64,
    pub order_count: i64,
    pub order_total: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CapacityReport {
    pub oneoff_total: i64,
    pub recurring_total: i64,
    pub obligatory_12m: i64,
    pub cushion: i64,
    pub available: i64,
    pub by_month: Vec<CashMonth>,
}

fn kind_label(kind: &str) -> &'static str {
    match kind {
        "spot" => "现货",
        "futures_order" => "期货",
        "income" => "收入",
        "accrual" => "计提",
        "reversal" => "冲销",
        "futures_payment" => "尾款支付",
        "futures_settle" => "尾款核销",
        "futures_rollover" => "展期",
        "futures_cancel" => "取消订单",
        "transfer" => "转账",
        "accrual_settle" => "计提核销",
        "opening" => "期初",
        "period_close" => "月结",
        "freeze" => "冻结",
        "budget_receivable" => "规律预算",
        "budget_realize" => "预算兑现",
        "budget_unrealize" => "兑现撤回",
        _ => "其他",
    }
}

impl<'a> Book<'a> {
    pub fn report_pnl(&self, from: &str, to: &str) -> Res<PnlReport> {
        let start = month_start(from);
        let end = month_end(to);
        let mut months = Vec::new();
        for m in month_range(from, to) {
            months.push(PnlMonth {
                month: m,
                income: 0,
                expense: 0,
                net: 0,
                items: Vec::new(),
            });
        }

        let mut stmt = self.conn.prepare(
            "SELECT kind,direction,accrual_date,amount,meta FROM ledger_event
             WHERE accrual_date>=? AND accrual_date<=?
               AND kind IN ('spot','futures_order','income','reversal','accrual_settle')",
        )?;
        let rows = stmt
            .query_map(params![start, end], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, i64>(3)?,
                    r.get::<_, Option<String>>(4)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        for (kind, direction, date, amount, meta) in rows {
            let m = month_of(&date);
            let idx = match months.iter().position(|x| x.month == m) {
                Some(i) => i,
                None => continue,
            };
            let (sign, bucket) = if kind == "reversal" {
                let orig = meta
                    .as_deref()
                    .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
                    .and_then(|v| v.get("originalKind").and_then(|x| x.as_str()).map(|s| s.to_string()))
                    .unwrap_or_default();
                if orig == "income" {
                    (-1, "income")
                } else {
                    (-1, "expense")
                }
            } else if direction == "income" {
                (1, "income")
            } else if direction == "expense" {
                (1, "expense")
            } else {
                continue;
            };
            let delta = sign * amount;
            {
                let row = &mut months[idx];
                if bucket == "income" {
                    row.income += delta;
                } else {
                    row.expense += delta;
                }
                row.net = row.income - row.expense;
                let label = kind_label(&kind);
                match row.items.iter_mut().find(|i| i.kind == kind) {
                    Some(i) => i.amount += delta,
                    None => row.items.push(PnlItem {
                        kind: kind.clone(),
                        label: label.to_string(),
                        amount: delta,
                    }),
                }
            }
        }

        // 规律预算按「本月应收」计入收入。
        // 当前月及其之前用当月额度；未来月按 100% 兑现（预览口径）展示。
        for row in months.iter_mut() {
            let quota_total: i64 = self
                .accounts(&row.month)?
                .into_iter()
                .filter(|a| !a.archived)
                .map(|a| a.quota)
                .sum();
            if quota_total != 0 {
                row.income += quota_total;
                row.net = row.income - row.expense;
                row.items.push(PnlItem {
                    kind: "budget_receivable".into(),
                    label: kind_label("budget_receivable").to_string(),
                    amount: quota_total,
                });
            }
        }

        let total_income = months.iter().map(|m| m.income).sum();
        let total_expense = months.iter().map(|m| m.expense).sum();
        Ok(PnlReport {
            from: from.to_string(),
            to: to.to_string(),
            months,
            total_income,
            total_expense,
            total_net: total_income - total_expense,
        })
    }

    pub fn report_cash(&self, from: &str, to: &str) -> Res<CashReport> {
        let start = month_start(from);
        let end = month_end(to);
        let mut months = Vec::new();
        for m in month_range(from, to) {
            months.push(CashMonth {
                month: m,
                inflow: 0,
                outflow: 0,
                net: 0,
            });
        }
        let mut stmt = self.conn.prepare(
            "SELECT month, SUM(CASE WHEN amount>0 THEN amount ELSE 0 END),
                    SUM(CASE WHEN amount<0 THEN -amount ELSE 0 END)
             FROM cash_flow WHERE date>=? AND date<=? GROUP BY month",
        )?;
        let rows = stmt
            .query_map(params![start, end], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        for (m, inflow, outflow) in rows {
            if let Some(row) = months.iter_mut().find(|x| x.month == m) {
                row.inflow = inflow;
                row.outflow = outflow;
                row.net = inflow - outflow;
            }
        }
        let by_account = {
            let mut stmt = self.conn.prepare(
                "SELECT c.account_id, a.name,
                        SUM(CASE WHEN c.amount>0 THEN c.amount ELSE 0 END),
                        SUM(CASE WHEN c.amount<0 THEN -c.amount ELSE 0 END)
                 FROM cash_flow c LEFT JOIN account a ON a.id=c.account_id
                 WHERE c.date>=? AND c.date<=? GROUP BY c.account_id ORDER BY a.sort",
            )?;
            let rows = stmt
                .query_map(params![start, end], |r| {
                    Ok(AccountCash {
                        account_id: r.get(0)?,
                        account_name: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                        inflow: r.get(2)?,
                        outflow: r.get(3)?,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            rows
        };
        Ok(CashReport {
            total_inflow: months.iter().map(|m| m.inflow).sum(),
            total_outflow: months.iter().map(|m| m.outflow).sum(),
            months,
            by_account,
        })
    }

    /// 预算兑现比例：本月规律额度 vs 实际兑现
    pub fn report_realization(&self, from: &str, to: &str) -> Res<RealizeReport> {
        let mut months: Vec<RealizeMonth> = month_range(from, to)
            .into_iter()
            .map(|m| RealizeMonth {
                month: m,
                quota: 0,
                realized: 0,
                ratio: 0.0,
            })
            .collect();

        let mut realized_map: std::collections::HashMap<(String, String), i64> =
            std::collections::HashMap::new();
        let mut acc_totals: std::collections::HashMap<String, i64> =
            std::collections::HashMap::new();
        {
            let mut stmt = self.conn.prepare(
                "SELECT account_id,budget_month,
                        SUM(CASE WHEN kind='budget_realize' THEN amount ELSE -amount END)
                 FROM ledger_event
                 WHERE kind IN ('budget_realize','budget_unrealize')
                   AND budget_month>=? AND budget_month<=? AND status<>'void'
                 GROUP BY account_id,budget_month",
            )?;
            let rows = stmt
                .query_map(params![from, to], |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, i64>(2)?,
                    ))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            for (acc, m, amt) in rows {
                *realized_map.entry((acc.clone(), m)).or_insert(0) += amt;
                *acc_totals.entry(acc).or_insert(0) += amt;
            }
        }

        for row in months.iter_mut() {
            let accs = self.accounts(&row.month)?;
            row.quota = accs.iter().filter(|a| !a.archived).map(|a| a.quota).sum();
            row.realized = realized_map
                .iter()
                .filter(|((_, m), _)| m == &row.month)
                .map(|(_, v)| *v)
                .sum();
            row.ratio = if row.quota > 0 {
                row.realized as f64 / row.quota as f64
            } else {
                0.0
            };
        }

        let mut by_account = Vec::new();
        for a in self.accounts(to)? {
            if a.archived {
                continue;
            }
            let mut quota = 0i64;
            for m in month_range(from, to) {
                quota += self.quota_at(&a.id, &m)?;
            }
            let realized = *acc_totals.get(&a.id).unwrap_or(&0);
            by_account.push(RealizeAccount {
                account_id: a.id.clone(),
                account_name: a.name.clone(),
                quota,
                realized,
                ratio: if quota > 0 {
                    realized as f64 / quota as f64
                } else {
                    0.0
                },
            });
        }

        let total_quota: i64 = months.iter().map(|m| m.quota).sum();
        let total_realized: i64 = months.iter().map(|m| m.realized).sum();
        Ok(RealizeReport {
            from: from.to_string(),
            to: to.to_string(),
            months,
            total_quota,
            total_realized,
            ratio: if total_quota > 0 {
                total_realized as f64 / total_quota as f64
            } else {
                0.0
            },
            by_account,
        })
    }

    pub fn report_budget(&self, month: &str) -> Res<Vec<BudgetRow>> {
        let accounts = self.accounts(month)?;
        let mut out = Vec::new();
        for a in accounts.into_iter().filter(|a| !a.archived) {
            let rec_used: i64 = self.conn.query_row(
                "SELECT COALESCE(-SUM(amount),0) FROM posting WHERE account_id=? AND pool='recurring' AND month=? AND amount<0",
                params![a.id, month],
                |r| r.get(0),
            )?;
            let o_in: i64 = self.conn.query_row(
                "SELECT COALESCE(SUM(amount),0) FROM posting WHERE account_id=? AND pool='oneoff' AND month=? AND amount>0",
                params![a.id, month],
                |r| r.get(0),
            )?;
            let o_out: i64 = self.conn.query_row(
                "SELECT COALESCE(-SUM(amount),0) FROM posting WHERE account_id=? AND pool='oneoff' AND month=? AND amount<0",
                params![a.id, month],
                |r| r.get(0),
            )?;
            out.push(BudgetRow {
                account_id: a.id.clone(),
                account_name: a.name.clone(),
                quota: a.quota,
                recurring_used: rec_used,
                recurring_balance: a.recurring_balance,
                oneoff_in: o_in,
                oneoff_out: o_out,
                oneoff_balance: a.oneoff_balance,
                over: a.recurring_balance < 0,
            });
        }
        Ok(out)
    }

    /// 平摊表：从 `from_month`（默认当前月）起算的未来资金需求
    pub fn report_forward(&self, months_ahead: i64, from_month: Option<&str>) -> Res<Vec<ForwardRow>> {
        let start = from_month
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(current_month);
        let mut rows = Vec::new();
        let mut stmt = self.conn.prepare(
            "SELECT o.due_month,o.kind,COALESCE(e.title,''),COALESCE(a.name,''),o.amount,o.status
             FROM obligation o
             LEFT JOIN ledger_event e ON e.id=o.event_id
             LEFT JOIN account a ON a.id=o.account_id
             WHERE o.status IN ('pending','frozen') AND o.due_month>=? AND o.due_month<?
             ORDER BY o.due_month, o.kind",
        )?;
        let all = stmt
            .query_map(
                params![start, month_add(&start, months_ahead as i32)],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, i64>(4)?,
                        r.get::<_, String>(5)?,
                    ))
                },
            )?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        for i in 0..months_ahead {
            let m = month_add(&start, i as i32);
            let items: Vec<ForwardItem> = all
                .iter()
                .filter(|x| x.0 == m)
                .map(|x| ForwardItem {
                    kind: kind_label(&x.1).to_string(),
                    title: x.2.clone(),
                    account_name: x.3.clone(),
                    amount: x.4,
                    status: x.5.clone(),
                })
                .collect();
            let futures_balance: i64 = all
                .iter()
                .filter(|x| x.0 == m && x.1 == "futures_balance")
                .map(|x| x.4)
                .sum();
            let accrual: i64 = all
                .iter()
                .filter(|x| x.0 == m && x.1 == "accrual")
                .map(|x| x.4)
                .sum();
            rows.push(ForwardRow {
                month: m,
                futures_balance,
                accrual,
                total: futures_balance + accrual,
                items,
            });
        }
        Ok(rows)
    }

    /// 预订习惯：以 `to_month`（默认当前月）为终点往前统计
    pub fn report_habit(&self, months_ahead: i64, to_month: Option<&str>) -> Res<HabitReport> {
        let end_month = to_month
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(current_month);
        let start = month_add(&end_month, -(months_ahead as i32 - 1));
        let end_date = month_end(&end_month);
        let mut stmt = self.conn.prepare(
            "SELECT id,accrual_date,amount,meta,vendor_id FROM ledger_event
             WHERE kind='futures_order' AND accrual_date>=? AND accrual_date<=?",
        )?;
        let orders = stmt
            .query_map(params![month_start(&start), end_date], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, Option<String>>(3)?,
                    r.get::<_, Option<String>>(4)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let vendor_names: std::collections::HashMap<String, String> = self
            .list_vendors()?
            .into_iter()
            .collect();

        let mut month_map: std::collections::BTreeMap<String, HabitMonth> =
            std::collections::BTreeMap::new();
        let mut vendor_map: std::collections::BTreeMap<String, (i64, i64, i64, i64, f64, i64)> =
            std::collections::BTreeMap::new();

        let ext_by_vendor = {
            let mut stmt = self.conn.prepare(
                "SELECT COALESCE(e.vendor_id,''), COALESCE(SUM(CAST(json_extract(l.meta,'$.extensionDays') AS INTEGER)),0), COUNT(*)
                 FROM ledger_event l JOIN ledger_event e ON e.id=l.ref_event_id
                 WHERE l.kind='futures_rollover' GROUP BY e.vendor_id",
            )?;
            let rows = stmt
                .query_map([], |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            rows
        };

        let mut total_orders = 0i64;
        let mut total_amount = 0i64;
        let mut defaulted = 0i64;
        for (_id, date, amount, meta, vendor_id) in &orders {
            total_orders += 1;
            total_amount += amount;
            let m = month_of(date);
            let obj = meta
                .as_deref()
                .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
                .unwrap_or(serde_json::Value::Null);
            let rollovers = obj.get("rollovers").and_then(|v| v.as_i64()).unwrap_or(0);
            let status = obj
                .get("orderStatus")
                .and_then(|v| v.as_str())
                .unwrap_or("pending")
                .to_string();
            let cancelled = (status == "cancelled") as i64;
            if rollovers > 0 || cancelled > 0 {
                defaulted += 1;
            }
            let entry = month_map.entry(m.clone()).or_insert_with(|| HabitMonth {
                month: m.clone(),
                orders: 0,
                total: 0,
                rolled: 0,
                cancelled: 0,
            });
            entry.orders += 1;
            entry.total += amount;
            if rollovers > 0 {
                entry.rolled += 1;
            }
            if cancelled > 0 {
                entry.cancelled += 1;
            }

            let vname = vendor_id
                .as_deref()
                .and_then(|v| vendor_names.get(v).cloned())
                .unwrap_or_else(|| "未指定".into());
            let ve = vendor_map
                .entry(vname)
                .or_insert((0, 0, 0, 0, 0.0, 0));
            ve.0 += 1;
            ve.1 += amount;
            if rollovers > 0 {
                ve.2 += 1;
            }
            if cancelled > 0 {
                ve.3 += 1;
            }
        }

        for (vid, days, cnt) in ext_by_vendor {
            let vname = vendor_names
                .get(&vid)
                .cloned()
                .unwrap_or_else(|| "未指定".into());
            let ve = vendor_map.entry(vname).or_insert((0, 0, 0, 0, 0.0, 0));
            ve.4 += days as f64;
            ve.5 += cnt;
        }

        let vendors = vendor_map
            .into_iter()
            .map(|(name, (orders, total, rolled, cancelled, days, cnt))| VendorStat {
                vendor_name: name,
                orders,
                total,
                rolled,
                cancelled,
                avg_extension_days: if cnt > 0 { days / cnt as f64 } else { 0.0 },
            })
            .collect::<Vec<_>>();

        let total_ext_days: f64 = vendors.iter().map(|v| v.avg_extension_days).sum();
        let avg_ext = if vendors.is_empty() {
            0.0
        } else {
            total_ext_days / vendors.len() as f64
        };

        Ok(HabitReport {
            months: month_map.into_values().collect(),
            vendors,
            default_rate: if total_orders > 0 {
                defaulted as f64 / total_orders as f64
            } else {
                0.0
            },
            avg_extension_days: avg_ext,
            order_count: total_orders,
            order_total: total_amount,
        })
    }

    /// 超前消费能力：以 `month`（默认当前月）为基准结算
    pub fn report_capacity(&self, month: Option<&str>) -> Res<CapacityReport> {
        let month = month
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(current_month);
        let mut oneoff_total = 0i64;
        let mut recurring_total = 0i64;
        let mut stmt = self
            .conn
            .prepare("SELECT id FROM account WHERE archived=0")?;
        let ids: Vec<String> = stmt
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        for id in &ids {
            oneoff_total += self.projected_oneoff_balance(id, &month)?;
            recurring_total += self.recurring_balance(id, &month)?.max(0);
        }

        let end = month_add(&month, 12);
        let obligatory: i64 = self.conn.query_row(
            "SELECT COALESCE(SUM(amount-paid_amount),0) FROM obligation
             WHERE status IN ('pending','frozen') AND due_month>=? AND due_month<?",
            params![month, end],
            |r| r.get(0),
        )?;

        let cushion: i64 = crate::db::get_setting(self.conn, "safety_cushion")?
            .and_then(|s| s.parse::<i64>().ok())
            .unwrap_or(0);

        let mut by_month = Vec::new();
        let start = month;
        for i in 0..12 {
            let m = month_add(&start, i);
            let amount: i64 = self.conn.query_row(
                "SELECT COALESCE(SUM(amount-paid_amount),0) FROM obligation
                 WHERE status IN ('pending','frozen') AND due_month=?",
                [&m],
                |r| r.get(0),
            )?;
            by_month.push(CashMonth {
                month: m,
                inflow: 0,
                outflow: amount,
                net: -amount,
            });
        }

        Ok(CapacityReport {
            oneoff_total,
            recurring_total,
            obligatory_12m: obligatory,
            cushion,
            available: oneoff_total + recurring_total - obligatory - cushion,
            by_month,
        })
    }
}
