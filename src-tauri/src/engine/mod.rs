pub mod close;
pub mod read;
pub mod write;

use crate::domain::*;
use rusqlite::{params, Connection, OptionalExtension};

pub struct Book<'a> {
    pub conn: &'a Connection,
}

impl<'a> Book<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    // -----------------------------------------------------------------
    // 期间
    // -----------------------------------------------------------------

    pub fn ensure_period(&self, month: &str) -> Res<()> {
        self.conn.execute(
            "INSERT OR IGNORE INTO period(month,status) VALUES (?,'open')",
            [month],
        )?;
        Ok(())
    }

    pub fn period_status(&self, month: &str) -> Res<String> {
        let s: Option<String> = self
            .conn
            .query_row("SELECT status FROM period WHERE month=?", [month], |r| r.get(0))
            .optional()?;
        Ok(s.unwrap_or_else(|| "open".into()))
    }

    pub fn is_closed(&self, month: &str) -> Res<bool> {
        Ok(self.period_status(month)? == "closed")
    }

    /// 内部调整（冲销/核销/展期）的目标月：若已结账则重定向到当前月。
    pub fn target_open_month(&self, month: &str) -> Res<String> {
        if self.is_closed(month)? {
            Ok(current_month())
        } else {
            Ok(month.to_string())
        }
    }

    /// 用户新录入的交易：禁止落到已结账月份。
    pub fn reject_closed(&self, month: &str) -> Res<()> {
        if self.is_closed(month)? {
            return Err(AppError::conflict(format!(
                "{month} 已结账，不能直接补录。请先「重开上月」，或把交易记到当前月。"
            )));
        }
        Ok(())
    }

    // -----------------------------------------------------------------
    // 余额
    // -----------------------------------------------------------------

    pub fn quota_at(&self, account_id: &str, month: &str) -> Res<i64> {
        let v: Option<i64> = self
            .conn
            .query_row(
                "SELECT amount FROM account_quota WHERE account_id=? AND month<=? ORDER BY month DESC LIMIT 1",
                params![account_id, month],
                |r| r.get(0),
            )
            .optional()?;
        Ok(v.unwrap_or(0))
    }

    /// 规律预算该月可用 = 额度 + 该月所有规律分录
    pub fn recurring_balance(&self, account_id: &str, month: &str) -> Res<i64> {
        let sum: i64 = self.conn.query_row(
            "SELECT COALESCE(SUM(amount),0) FROM posting WHERE account_id=? AND pool='recurring' AND month=?",
            params![account_id, month],
            |r| r.get(0),
        )?;
        Ok(self.quota_at(account_id, month)? + sum)
    }

    /// 一次性预算余额 = 截至该月（含）所有一次性分录累计
    pub fn oneoff_balance(&self, account_id: &str, as_of_month: &str) -> Res<i64> {
        let sum: i64 = self.conn.query_row(
            "SELECT COALESCE(SUM(amount),0) FROM posting WHERE account_id=? AND pool='oneoff' AND month<=?",
            params![account_id, as_of_month],
            |r| r.get(0),
        )?;
        Ok(sum)
    }

    /// 该账户最早有额度或分录的月份，用于投影起点
    pub fn activity_start_month(&self, account_id: &str) -> Res<Option<String>> {
        let v: Option<String> = self
            .conn
            .query_row(
                "SELECT MIN(m) FROM (
                     SELECT month AS m FROM account_quota WHERE account_id=?1
                     UNION ALL
                     SELECT month AS m FROM posting WHERE account_id=?1
                 )",
                [account_id],
                |r| r.get(0),
            )
            .optional()?
            .flatten();
        Ok(v)
    }

    /// 「结算到某月」时的一次性余额：
    /// 已结账月份用真实结转分录，未结账月份按规律结余**模拟结转**。
    pub fn projected_oneoff_balance(&self, account_id: &str, month: &str) -> Res<i64> {
        let mut total = self.oneoff_balance(account_id, month)?;
        if let Some(mut cur) = self.activity_start_month(account_id)? {
            while cur.as_str() < month {
                if !self.is_closed(&cur)? {
                    total += self.recurring_balance(account_id, &cur)?;
                }
                cur = month_add(&cur, 1);
            }
        }
        Ok(total)
    }

    // -----------------------------------------------------------------
    // 分录 / 现金流 / 计数器
    // -----------------------------------------------------------------

    pub fn post(
        &self,
        event_id: &str,
        account_id: &str,
        pool: Pool,
        month: &str,
        amount: i64,
        kind: &str,
    ) -> Res<()> {
        if amount == 0 {
            return Ok(());
        }
        self.conn.execute(
            "INSERT INTO posting(id,event_id,account_id,pool,month,amount,kind) VALUES (?,?,?,?,?,?,?)",
            params![
                new_id(),
                event_id,
                account_id,
                pool.as_str(),
                month,
                amount,
                kind
            ],
        )?;
        Ok(())
    }

    pub fn add_cash(
        &self,
        event_id: &str,
        account_id: &str,
        date: &str,
        amount: i64,
        kind: &str,
    ) -> Res<()> {
        if amount == 0 {
            return Ok(());
        }
        self.conn.execute(
            "INSERT INTO cash_flow(id,event_id,account_id,date,month,amount,kind) VALUES (?,?,?,?,?,?,?)",
            params![
                new_id(),
                event_id,
                account_id,
                date,
                month_of(date),
                amount,
                kind
            ],
        )?;
        Ok(())
    }

    pub fn counter_used(&self, account_id: &str, tag: &str, month: &str) -> Res<i64> {
        let v: Option<i64> = self
            .conn
            .query_row(
                "SELECT used FROM counter_usage WHERE account_id=? AND tag=? AND month=?",
                params![account_id, tag, month],
                |r| r.get(0),
            )
            .optional()?;
        Ok(v.unwrap_or(0))
    }

    pub fn bump_counter(&self, account_id: &str, tag: &str, month: &str, delta: i64) -> Res<()> {
        if delta == 0 {
            return Ok(());
        }
        self.conn.execute(
            "INSERT INTO counter_usage(account_id,tag,month,used) VALUES (?,?,?,?)
             ON CONFLICT(account_id,tag,month) DO UPDATE SET used=MAX(0, used + ?)",
            params![account_id, tag, month, delta.max(0), delta],
        )?;
        Ok(())
    }

    // -----------------------------------------------------------------
    // 消费分级
    // -----------------------------------------------------------------

    pub fn tag_rules(&self) -> Res<Vec<TagRule>> {
        let mut stmt = self.conn.prepare(
            "SELECT tag,label,min_amount,max_amount,monthly_limit,upgrade_to,required_fields,sort
             FROM tag_rule ORDER BY sort",
        )?;
        let rows = stmt
            .query_map([], |r| {
                let required: String = r.get(6)?;
                Ok(TagRule {
                    tag: r.get(0)?,
                    label: r.get(1)?,
                    min_amount: r.get(2)?,
                    max_amount: r.get(3)?,
                    monthly_limit: r.get(4)?,
                    upgrade_to: r.get(5)?,
                    required_fields: required
                        .split(',')
                        .filter(|s| !s.trim().is_empty())
                        .map(|s| s.trim().to_string())
                        .collect(),
                    sort: r.get(7)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn tag_rule(&self, tag: &str) -> Res<TagRule> {
        self.tag_rules()?
            .into_iter()
            .find(|r| r.tag == tag)
            .ok_or_else(|| AppError::validation(format!("未知的消费分级 {tag}")))
    }

    /// 按金额自动判定分级
    pub fn classify(&self, amount: i64) -> Res<TagRule> {
        let rules = self.tag_rules()?;
        let mut chosen = rules.last().cloned();
        for r in &rules {
            let upper_ok = match r.max_amount {
                Some(max) => amount < max,
                None => true,
            };
            if amount >= r.min_amount && upper_ok {
                chosen = Some(r.clone());
                break;
            }
        }
        chosen.ok_or_else(|| AppError::validation("无法判定消费分级，请检查分级配置"))
    }

    /// 判定分级 + 计数器校验（超限自动升级），返回最终分级。
    pub fn resolve_tag(
        &self,
        account_id: &str,
        amount: i64,
        month: &str,
        forced: Option<&str>,
    ) -> Res<TagRule> {
        let mut rule = match forced {
            Some(t) if !t.is_empty() && t != "auto" => self.tag_rule(t)?,
            _ => self.classify(amount)?,
        };
        if let (Some(limit), Some(upgrade)) = (rule.monthly_limit, rule.upgrade_to.clone()) {
            let used = self.counter_used(account_id, &rule.tag, month)?;
            if used + 1 > limit {
                rule = self.tag_rule(&upgrade)?;
            }
        }
        Ok(rule)
    }

    /// 必填项硬校验
    pub fn validate_required(&self, rule: &TagRule, d: &EventDraft) -> Res<()> {
        let mut missing: Vec<String> = Vec::new();
        for key in &rule.required_fields {
            let filled = match key.as_str() {
                "title" => d.title.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false),
                "reason" => d.reason.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false),
                "urgency" => d.urgency.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false),
                "market_price" => d.market_price.map(|v| v > 0).unwrap_or(false),
                "expected_effect" => d
                    .expected_effect
                    .as_deref()
                    .map(|s| !s.trim().is_empty())
                    .unwrap_or(false),
                "usage_months" => d.usage_months.map(|v| v > 0).unwrap_or(false),
                "necessity" => d.necessity.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false),
                "purpose" => d.purpose.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false),
                _ => true,
            };
            if !filled {
                missing.push(field_label(key).to_string());
            }
        }
        if !missing.is_empty() {
            return Err(AppError::validation(format!(
                "「{}」等级要求填写：{}",
                rule.label,
                missing.join("、")
            )));
        }
        Ok(())
    }

    // -----------------------------------------------------------------
    // Q8 统一调整规则
    //   delta < 0：额外占用，先扣一次性，不足再扣规律（规律可为负）
    //   delta > 0：预算释放，一律进一次性
    // -----------------------------------------------------------------

    pub fn adjust(&self, event_id: &str, account_id: &str, month: &str, delta: i64) -> Res<()> {
        if delta == 0 {
            return Ok(());
        }
        if delta > 0 {
            self.post(event_id, account_id, Pool::OneOff, month, delta, "release")?;
            return Ok(());
        }
        let need = -delta;
        let oneoff = self.oneoff_balance(account_id, month)?.max(0);
        let take = oneoff.min(need);
        self.post(event_id, account_id, Pool::OneOff, month, -take, "expense")?;
        if take < need {
            self.post(
                event_id,
                account_id,
                Pool::Recurring,
                month,
                -(need - take),
                "expense",
            )?;
        }
        Ok(())
    }

    // -----------------------------------------------------------------
    // 账户
    // -----------------------------------------------------------------

    pub fn account(&self, id: &str) -> Res<Account> {
        self.conn
            .query_row(
                "SELECT id,name,kind,currency,cycle_start_day,sort,archived,note FROM account WHERE id=?",
                [id],
                |r| {
                    Ok(Account {
                        id: r.get(0)?,
                        name: r.get(1)?,
                        kind: r.get(2)?,
                        currency: r.get(3)?,
                        cycle_start_day: r.get(4)?,
                        sort: r.get(5)?,
                        archived: r.get::<_, i64>(6)? != 0,
                        note: r.get(7)?,
                    })
                },
            )
            .optional()?
            .ok_or_else(|| AppError::not_found(format!("账户 {id} 不存在")))
    }

    // -----------------------------------------------------------------
    // 事务
    // -----------------------------------------------------------------

    pub fn tx<T>(&self, f: impl FnOnce() -> Res<T>) -> Res<T> {
        let tx = self.conn.unchecked_transaction()?;
        match f() {
            Ok(v) => {
                tx.commit()?;
                Ok(v)
            }
            Err(e) => {
                drop(tx);
                Err(e)
            }
        }
    }

    pub fn audit(&self, action: &str, entity: &str, entity_id: &str, detail: &str) -> Res<()> {
        self.conn.execute(
            "INSERT INTO audit_log(at,action,entity,entity_id,detail) VALUES (?,?,?,?,?)",
            params![now_iso(), action, entity, entity_id, detail],
        )?;
        Ok(())
    }
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

pub fn field_label(key: &str) -> &'static str {
    match key {
        "title" => "项目",
        "reason" => "消费理由",
        "urgency" => "时效性",
        "market_price" => "市场均价",
        "expected_effect" => "预期使用效果",
        "usage_months" => "使用时长",
        "necessity" => "采购必要性",
        "purpose" => "预期目的",
        _ => "必填项",
    }
}

#[derive(Debug, Clone)]
pub struct TagRule {
    pub tag: String,
    pub label: String,
    pub min_amount: i64,
    pub max_amount: Option<i64>,
    pub monthly_limit: Option<i64>,
    pub upgrade_to: Option<String>,
    pub required_fields: Vec<String>,
    pub sort: i64,
}

#[derive(Debug, Clone)]
pub struct Account {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub currency: String,
    pub cycle_start_day: i64,
    pub sort: i64,
    pub archived: bool,
    pub note: Option<String>,
}

// ---------------------------------------------------------------------------
// 事件草稿
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default)]
pub struct EventDraft {
    pub kind: String,
    pub direction: String,
    pub ref_event_id: Option<String>,
    pub obligation_id: Option<String>,
    pub parent_event_id: Option<String>,
    pub accrual_date: String,
    pub budget_month: String,
    pub cash_date: Option<String>,
    pub amount: i64,
    pub cash_amount: i64,
    pub currency: String,
    pub fx_rate: Option<String>,
    pub original_amount: Option<i64>,
    pub account_id: Option<String>,
    pub to_account_id: Option<String>,
    pub pool: Option<String>,
    pub to_pool: Option<String>,
    pub tag: Option<String>,
    pub counter_delta: i64,
    pub vendor_id: Option<String>,
    pub title: Option<String>,
    pub reason: Option<String>,
    pub urgency: Option<String>,
    pub market_price: Option<i64>,
    pub expected_effect: Option<String>,
    pub usage_months: Option<i64>,
    pub necessity: Option<String>,
    pub purpose: Option<String>,
    pub status: Option<String>,
    pub note: Option<String>,
    pub meta: Option<String>,
}

impl<'a> Book<'a> {
    pub fn insert_event(&self, d: &EventDraft) -> Res<String> {
        let id = new_id();
        self.conn.execute(
            "INSERT INTO ledger_event(
                id,kind,direction,ref_event_id,obligation_id,parent_event_id,
                accrual_date,budget_month,cash_date,amount,cash_amount,currency,fx_rate,original_amount,
                account_id,to_account_id,pool,to_pool,tag,counter_delta,vendor_id,title,reason,urgency,
                market_price,expected_effect,usage_months,necessity,purpose,status,note,meta,created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            params![
                id,
                d.kind,
                d.direction,
                d.ref_event_id,
                d.obligation_id,
                d.parent_event_id,
                d.accrual_date,
                d.budget_month,
                d.cash_date,
                d.amount,
                d.cash_amount,
                if d.currency.is_empty() {
                    "CNY".to_string()
                } else {
                    d.currency.clone()
                },
                d.fx_rate,
                d.original_amount,
                d.account_id,
                d.to_account_id,
                d.pool,
                d.to_pool,
                d.tag,
                d.counter_delta,
                d.vendor_id,
                d.title,
                d.reason,
                d.urgency,
                d.market_price,
                d.expected_effect,
                d.usage_months,
                d.necessity,
                d.purpose,
                d.status.clone().unwrap_or_else(|| "normal".into()),
                d.note,
                d.meta,
                now_iso(),
            ],
        )?;
        Ok(id)
    }

    pub fn set_event_status(&self, id: &str, status: &str) -> Res<()> {
        self.conn
            .execute("UPDATE ledger_event SET status=? WHERE id=?", params![status, id])?;
        Ok(())
    }
}
