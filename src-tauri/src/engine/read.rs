use crate::domain::*;
use rusqlite::{OptionalExtension, Row};
use serde::Serialize;

use super::Book;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EventView {
    pub id: String,
    pub seq: i64,
    pub kind: String,
    pub direction: String,
    pub accrual_date: String,
    pub budget_month: String,
    pub cash_date: Option<String>,
    pub amount: i64,
    pub cash_amount: i64,
    pub currency: String,
    pub account_id: Option<String>,
    pub account_name: Option<String>,
    pub to_account_id: Option<String>,
    pub to_account_name: Option<String>,
    pub pool: Option<String>,
    pub to_pool: Option<String>,
    pub tag: Option<String>,
    pub tag_label: Option<String>,
    pub counter_delta: i64,
    pub vendor_id: Option<String>,
    pub vendor_name: Option<String>,
    pub title: Option<String>,
    pub reason: Option<String>,
    pub urgency: Option<String>,
    pub market_price: Option<i64>,
    pub expected_effect: Option<String>,
    pub usage_months: Option<i64>,
    pub necessity: Option<String>,
    pub purpose: Option<String>,
    pub status: String,
    pub note: Option<String>,
    pub meta: Option<String>,
    pub ref_event_id: Option<String>,
    pub obligation_id: Option<String>,
    pub created_at: String,
    pub fx_rate: Option<String>,
    pub original_amount: Option<i64>,
}

const EVENT_SELECT: &str = "SELECT e.id,e.seq,e.kind,e.direction,e.accrual_date,e.budget_month,e.cash_date,
    e.amount,e.cash_amount,e.currency,e.account_id,a.name,e.to_account_id,b.name,
    e.pool,e.to_pool,e.tag,t.label,e.counter_delta,e.vendor_id,v.name,
    e.title,e.reason,e.urgency,e.market_price,e.expected_effect,e.usage_months,
    e.necessity,e.purpose,e.status,e.note,e.meta,e.ref_event_id,e.obligation_id,e.created_at,
    e.fx_rate,e.original_amount
 FROM ledger_event e
 LEFT JOIN account a ON a.id=e.account_id
 LEFT JOIN account b ON b.id=e.to_account_id
 LEFT JOIN tag_rule t ON t.tag=e.tag
 LEFT JOIN vendor v ON v.id=e.vendor_id";

fn row_to_event(r: &Row) -> rusqlite::Result<EventView> {
    Ok(EventView {
        id: r.get(0)?,
        seq: r.get(1)?,
        kind: r.get(2)?,
        direction: r.get(3)?,
        accrual_date: r.get(4)?,
        budget_month: r.get(5)?,
        cash_date: r.get(6)?,
        amount: r.get(7)?,
        cash_amount: r.get(8)?,
        currency: r.get(9)?,
        account_id: r.get(10)?,
        account_name: r.get(11)?,
        to_account_id: r.get(12)?,
        to_account_name: r.get(13)?,
        pool: r.get(14)?,
        to_pool: r.get(15)?,
        tag: r.get(16)?,
        tag_label: r.get(17)?,
        counter_delta: r.get(18)?,
        vendor_id: r.get(19)?,
        vendor_name: r.get(20)?,
        title: r.get(21)?,
        reason: r.get(22)?,
        urgency: r.get(23)?,
        market_price: r.get(24)?,
        expected_effect: r.get(25)?,
        usage_months: r.get(26)?,
        necessity: r.get(27)?,
        purpose: r.get(28)?,
        status: r.get(29)?,
        note: r.get(30)?,
        meta: r.get(31)?,
        ref_event_id: r.get(32)?,
        obligation_id: r.get(33)?,
        created_at: r.get(34)?,
        fx_rate: r.get(35)?,
        original_amount: r.get(36)?,
    })
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Obligation {
    pub id: String,
    pub event_id: String,
    pub account_id: String,
    pub account_name: Option<String>,
    pub kind: String,
    pub due_month: String,
    pub due_date: Option<String>,
    pub amount: i64,
    pub paid_amount: i64,
    pub pool: Option<String>,
    pub tag: Option<String>,
    pub status: String,
    pub note: Option<String>,
    pub title: Option<String>,
    pub vendor_name: Option<String>,
    pub rollovers: i64,
}

const OBLIGATION_SELECT: &str = "SELECT o.id,o.event_id,o.account_id,a.name,o.kind,o.due_month,o.due_date,
    o.amount,o.paid_amount,o.pool,o.tag,o.status,o.note,e.title,v.name
 FROM obligation o
 LEFT JOIN account a ON a.id=o.account_id
 LEFT JOIN ledger_event e ON e.id=o.event_id
 LEFT JOIN vendor v ON v.id=e.vendor_id";

fn row_to_obligation(r: &Row) -> rusqlite::Result<Obligation> {
    Ok(Obligation {
        id: r.get(0)?,
        event_id: r.get(1)?,
        account_id: r.get(2)?,
        account_name: r.get(3)?,
        kind: r.get(4)?,
        due_month: r.get(5)?,
        due_date: r.get(6)?,
        amount: r.get(7)?,
        paid_amount: r.get(8)?,
        pool: r.get(9)?,
        tag: r.get(10)?,
        status: r.get(11)?,
        note: r.get(12)?,
        title: r.get(13)?,
        vendor_name: r.get(14)?,
        rollovers: 0,
    })
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PostingView {
    pub month: String,
    pub pool: String,
    pub amount: i64,
    pub kind: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CashView {
    pub date: String,
    pub amount: i64,
    pub kind: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LineView {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub qty: f64,
    pub unit_price: i64,
    pub amount: i64,
    pub currency: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentView {
    pub id: String,
    pub file_name: String,
    pub stored_name: String,
    pub size: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EventDetail {
    pub event: EventView,
    pub postings: Vec<PostingView>,
    pub cash: Vec<CashView>,
    pub lines: Vec<LineView>,
    pub obligations: Vec<Obligation>,
    pub related: Vec<EventView>,
    pub attachments: Vec<AttachmentView>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AccountView {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub currency: String,
    pub sort: i64,
    pub archived: bool,
    pub note: Option<String>,
    pub quota: i64,
    pub recurring_balance: i64,
    pub oneoff_balance: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TagRuleView {
    pub tag: String,
    pub label: String,
    pub min_amount: i64,
    pub max_amount: Option<i64>,
    pub monthly_limit: Option<i64>,
    pub upgrade_to: Option<String>,
    pub required_fields: Vec<String>,
    pub used: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuotaGrant {
    pub account_id: String,
    pub account_name: String,
    pub month: String,
    pub amount: i64,
    /// 该月尚未到达（属于投影）
    pub is_future: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuotaPoint {
    pub month: String,
    pub amount: i64,
}

impl<'a> Book<'a> {
    /// 账本展示用：每个账户在区间内每月的「规律预算注入」虚拟行
    pub fn quota_grants(&self, from_month: &str, to_month: &str) -> Res<Vec<QuotaGrant>> {
        let names: Vec<(String, String)> = {
            let mut stmt = self
                .conn
                .prepare("SELECT id,name FROM account WHERE archived=0 ORDER BY sort")?;
            let rows = stmt
                .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            rows
        };
        let today_month = current_month();
        let mut out = Vec::new();
        for (id, name) in names {
            let mut cur = from_month.to_string();
            let mut guard = 0;
            while cur.as_str() <= to_month && guard < 120 {
                let amount = self.quota_at(&id, &cur)?;
                if amount != 0 {
                    out.push(QuotaGrant {
                        account_id: id.clone(),
                        account_name: name.clone(),
                        month: cur.clone(),
                        amount,
                        is_future: cur.as_str() > today_month.as_str(),
                    });
                }
                cur = month_add(&cur, 1);
                guard += 1;
            }
        }
        Ok(out)
    }

    /// 某账户的额度变更历史（按生效月份）
    pub fn quota_history(&self, account_id: &str) -> Res<Vec<QuotaPoint>> {
        let mut stmt = self
            .conn
            .prepare("SELECT month,amount FROM account_quota WHERE account_id=? ORDER BY month")?;
        let rows = stmt
            .query_map([account_id], |r| {
                Ok(QuotaPoint {
                    month: r.get(0)?,
                    amount: r.get(1)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }
}

impl<'a> Book<'a> {
    pub fn obligation(&self, id: &str) -> Res<Obligation> {
        let sql = format!("{OBLIGATION_SELECT} WHERE o.id=?");
        self.conn
            .query_row(&sql, [id], row_to_obligation)
            .optional()?
            .ok_or_else(|| AppError::not_found("义务不存在"))
    }

    pub fn obligation_by_event(&self, event_id: &str) -> Res<Option<Obligation>> {
        let sql = format!("{OBLIGATION_SELECT} WHERE o.event_id=? ORDER BY o.created_at LIMIT 1");
        Ok(self
            .conn
            .query_row(&sql, [event_id], row_to_obligation)
            .optional()?)
    }

    pub fn list_obligations(&self, include_done: bool, kind: Option<&str>) -> Res<Vec<Obligation>> {
        let mut sql = format!("{OBLIGATION_SELECT} WHERE 1=1");
        if !include_done {
            sql.push_str(" AND o.status IN ('pending','frozen')");
        }
        if let Some(k) = kind {
            sql.push_str(&format!(" AND o.kind='{k}'"));
        }
        sql.push_str(" ORDER BY o.due_month, o.created_at");
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt
            .query_map([], row_to_obligation)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn list_events(
        &self,
        from_month: Option<&str>,
        to_month: Option<&str>,
        account_id: Option<&str>,
        kind: Option<&str>,
        search: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Res<Vec<EventView>> {
        let mut sql = String::from(EVENT_SELECT);
        sql.push_str(" WHERE 1=1");
        let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        if let Some(f) = from_month {
            sql.push_str(" AND e.budget_month>=?");
            args.push(Box::new(f.to_string()));
        }
        if let Some(t) = to_month {
            sql.push_str(" AND e.budget_month<=?");
            args.push(Box::new(t.to_string()));
        }
        if let Some(a) = account_id {
            sql.push_str(" AND (e.account_id=? OR e.to_account_id=?)");
            args.push(Box::new(a.to_string()));
            args.push(Box::new(a.to_string()));
        }
        if let Some(k) = kind {
            if k != "all" {
                sql.push_str(" AND e.kind=?");
                args.push(Box::new(k.to_string()));
            }
        }
        if let Some(s) = search {
            if !s.trim().is_empty() {
                sql.push_str(" AND (COALESCE(e.title,'')||COALESCE(e.note,'')||COALESCE(e.reason,'')) LIKE ?");
                args.push(Box::new(format!("%{}%", s.trim())));
            }
        }
        sql.push_str(" ORDER BY e.accrual_date DESC, e.seq DESC LIMIT ? OFFSET ?");
        args.push(Box::new(limit));
        args.push(Box::new(offset));

        let mut stmt = self.conn.prepare(&sql)?;
        let refs: Vec<&dyn rusqlite::ToSql> = args
            .iter()
            .map(|b| &**b as &dyn rusqlite::ToSql)
            .collect();
        let rows = stmt
            .query_map(refs.as_slice(), row_to_event)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn event(&self, id: &str) -> Res<EventView> {
        let sql = format!("{EVENT_SELECT} WHERE e.id=?");
        self.conn
            .query_row(&sql, [id], row_to_event)
            .optional()?
            .ok_or_else(|| AppError::not_found("交易不存在"))
    }

    pub fn event_detail(&self, id: &str) -> Res<EventDetail> {
        let event = self.event(id)?;

        let postings = {
            let mut stmt = self.conn.prepare(
                "SELECT month,pool,amount,kind FROM posting WHERE event_id=? ORDER BY month,pool",
            )?;
            let rows = stmt
                .query_map([id], |r| {
                    Ok(PostingView {
                        month: r.get(0)?,
                        pool: r.get(1)?,
                        amount: r.get(2)?,
                        kind: r.get(3)?,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            rows
        };
        let cash = {
            let mut stmt = self.conn.prepare(
                "SELECT date,amount,kind FROM cash_flow WHERE event_id=? ORDER BY date",
            )?;
            let rows = stmt
                .query_map([id], |r| {
                    Ok(CashView {
                        date: r.get(0)?,
                        amount: r.get(1)?,
                        kind: r.get(2)?,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            rows
        };
        let lines = {
            let mut stmt = self.conn.prepare(
                "SELECT id,kind,name,qty,unit_price,amount,currency,note FROM order_line WHERE event_id=? ORDER BY sort",
            )?;
            let rows = stmt
                .query_map([id], |r| {
                    Ok(LineView {
                        id: r.get(0)?,
                        kind: r.get(1)?,
                        name: r.get(2)?,
                        qty: r.get(3)?,
                        unit_price: r.get(4)?,
                        amount: r.get(5)?,
                        currency: r.get(6)?,
                        note: r.get(7)?,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            rows
        };
        let obligations = {
            let sql = format!("{OBLIGATION_SELECT} WHERE o.event_id=? ORDER BY o.created_at");
            let mut stmt = self.conn.prepare(&sql)?;
            let rows = stmt
                .query_map([id], row_to_obligation)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            rows
        };
        let related = {
            let sql = format!("{EVENT_SELECT} WHERE e.ref_event_id=? OR e.id IN (SELECT ref_event_id FROM ledger_event WHERE id=?) ORDER BY e.seq");
            let mut stmt = self.conn.prepare(&sql)?;
            let rows = stmt
                .query_map([id, id], row_to_event)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            rows
        };
        let attachments = {
            let mut stmt = self.conn.prepare(
                "SELECT id,file_name,stored_name,size,created_at FROM attachment WHERE event_id=? ORDER BY created_at",
            )?;
            let rows = stmt
                .query_map([id], |r| {
                    Ok(AttachmentView {
                        id: r.get(0)?,
                        file_name: r.get(1)?,
                        stored_name: r.get(2)?,
                        size: r.get(3)?,
                        created_at: r.get(4)?,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            rows
        };

        Ok(EventDetail {
            event,
            postings,
            cash,
            lines,
            obligations,
            related,
            attachments,
        })
    }

    pub fn accounts(&self, month: &str) -> Res<Vec<AccountView>> {
        let base = {
            let mut stmt = self
                .conn
                .prepare("SELECT id,name,kind,currency,sort,archived,note FROM account ORDER BY sort,created_at")?;
            let rows = stmt
                .query_map([], |r| {
                    Ok(AccountView {
                        id: r.get(0)?,
                        name: r.get(1)?,
                        kind: r.get(2)?,
                        currency: r.get(3)?,
                        sort: r.get(4)?,
                        archived: r.get::<_, i64>(5)? != 0,
                        note: r.get(6)?,
                        quota: 0,
                        recurring_balance: 0,
                        oneoff_balance: 0,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            rows
        };
        let mut out = Vec::new();
        for mut a in base {
            a.quota = self.quota_at(&a.id, month)?;
            a.recurring_balance = self.recurring_balance(&a.id, month)?;
            // 展示口径：结算到该月（未结账月份按规律结余模拟结转）
            a.oneoff_balance = self.projected_oneoff_balance(&a.id, month)?;
            out.push(a);
        }
        Ok(out)
    }

    pub fn tag_rule_views(&self, account_id: Option<&str>, month: &str) -> Res<Vec<TagRuleView>> {
        let rules = self.tag_rules()?;
        let mut out = Vec::new();
        for r in rules {
            let used = match account_id {
                Some(a) => self.counter_used(a, &r.tag, month)?,
                None => 0,
            };
            out.push(TagRuleView {
                tag: r.tag,
                label: r.label,
                min_amount: r.min_amount,
                max_amount: r.max_amount,
                monthly_limit: r.monthly_limit,
                upgrade_to: r.upgrade_to,
                required_fields: r.required_fields,
                used,
            });
        }
        Ok(out)
    }

    pub fn settings_map(&self) -> Res<std::collections::BTreeMap<String, String>> {
        let mut stmt = self.conn.prepare("SELECT key,value FROM settings")?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows.into_iter().collect())
    }

    pub fn list_vendors(&self) -> Res<Vec<(String, String)>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id,name FROM vendor ORDER BY name")?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn currencies(&self) -> Res<Vec<(String, String, String, i64)>> {
        let mut stmt = self
            .conn
            .prepare("SELECT code,name,symbol,minor_unit FROM currency ORDER BY is_base DESC, code")?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, i64>(3)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }
}
