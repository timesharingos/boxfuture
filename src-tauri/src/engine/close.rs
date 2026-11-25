use super::{Book, EventDraft};
use crate::domain::*;
use rusqlite::{params, OptionalExtension};
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CarryoverItem {
    pub account_id: String,
    pub account_name: String,
    pub amount: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClosedPeriod {
    pub month: String,
    pub items: Vec<CarryoverItem>,
    pub total: i64,
    pub closed_at: String,
}

impl<'a> Book<'a> {
    /// 启动时补齐期间，并自动结账所有早于当前月的未结账月份。
    pub fn ensure_periods(&self) -> Res<Vec<ClosedPeriod>> {
        let cur = current_month();
        self.ensure_period(&cur)?;

        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT month FROM posting WHERE month < ? ORDER BY month",
        )?;
        let months: Vec<String> = stmt
            .query_map([&cur], |r| r.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let mut closed = Vec::new();
        for m in months {
            if self.period_status(&m)? != "closed" {
                closed.push(self.close_month(&m, true)?);
            }
        }
        Ok(closed)
    }

    pub fn close_month(&self, month: &str, _auto: bool) -> Res<ClosedPeriod> {
        if self.is_closed(month)? {
            return Err(AppError::conflict(format!("{month} 已结账")));
        }
        self.ensure_period(month)?;

        let accounts: Vec<(String, String)> = {
            let mut stmt = self
                .conn
                .prepare("SELECT id,name FROM account WHERE archived=0 ORDER BY sort")?;
            let rows = stmt
                .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            rows
        };

        let event_id = self.insert_event(&EventDraft {
            kind: "period_close".into(),
            direction: "neutral".into(),
            accrual_date: month_end(month),
            budget_month: month.to_string(),
            amount: 0,
            note: Some(format!("{month} 月结")),
            ..Default::default()
        })?;

        let mut items = Vec::new();
        for (id, name) in accounts {
            let bal = self.recurring_balance(&id, month)?;
            if bal != 0 {
                self.post(&event_id, &id, Pool::OneOff, month, bal, "carryover")?;
            }
            items.push(CarryoverItem {
                account_id: id,
                account_name: name,
                amount: bal,
            });
        }
        let total: i64 = items.iter().map(|i| i.amount).sum();
        let closed_at = now_iso();
        self.conn.execute(
            "UPDATE period SET status='closed', closed_at=?, close_event_id=?, carryover_json=?, reopened_at=NULL WHERE month=?",
            params![
                closed_at,
                event_id,
                serde_json::to_string(&items)?,
                month
            ],
        )?;
        Ok(ClosedPeriod {
            month: month.to_string(),
            items,
            total,
            closed_at,
        })
    }

    pub fn reopen_month(&self, month: &str) -> Res<()> {
        if !self.is_closed(month)? {
            return Err(AppError::conflict(format!("{month} 尚未结账")));
        }
        let last_closed: Option<String> = self
            .conn
            .query_row(
                "SELECT month FROM period WHERE status='closed' ORDER BY month DESC LIMIT 1",
                [],
                |r| r.get(0),
            )
            .optional()?;
        if last_closed.as_deref() != Some(month) {
            return Err(AppError::conflict(
                "只能重开最近一个已结账月份，更早的月份需要先重开后面所有月份",
            ));
        }
        let close_event: Option<String> = self
            .conn
            .query_row(
                "SELECT close_event_id FROM period WHERE month=?",
                [month],
                |r| r.get(0),
            )
            .optional()?
            .flatten();
        if let Some(ev) = close_event {
            self.conn
                .execute("DELETE FROM posting WHERE event_id=?", [&ev])?;
            self.set_event_status(&ev, "superseded")?;
        }
        self.conn.execute(
            "UPDATE period SET status='open', reopened_at=?, carryover_json=NULL, close_event_id=NULL WHERE month=?",
            params![now_iso(), month],
        )?;
        self.audit("reopen_month", "period", month, "重开已结账月份")?;
        Ok(())
    }

    /// 新建一个跨月结转提示用的手工结账
    pub fn close_current_month(&self) -> Res<ClosedPeriod> {
        let m = current_month();
        self.close_month(&m, false)
    }
}
