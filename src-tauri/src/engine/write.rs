use super::read::Obligation;
use super::{new_id, Book, EventDraft};
use crate::domain::*;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreatedEvent {
    pub event_id: String,
    pub tag: Option<String>,
    pub tag_upgraded: bool,
    pub warnings: Vec<String>,
}

fn yuan(v: i64) -> String {
    format!("{:.2}", v as f64 / 100.0)
}

fn require_positive(v: i64, label: &str) -> Res<()> {
    if v <= 0 {
        return Err(AppError::validation(format!("{label}必须大于 0")));
    }
    Ok(())
}

fn normalize_date(d: &str) -> String {
    if d.len() >= 10 {
        d[..10].to_string()
    } else {
        today()
    }
}

// ---------------------------------------------------------------------------
// 现货
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotInput {
    pub account_id: String,
    pub amount: i64,
    pub pool: Pool,
    pub accrual_date: String,
    pub budget_month: Option<String>,
    pub tag: Option<String>,
    pub title: Option<String>,
    pub reason: Option<String>,
    pub urgency: Option<String>,
    pub market_price: Option<i64>,
    pub expected_effect: Option<String>,
    pub usage_months: Option<i64>,
    pub necessity: Option<String>,
    pub purpose: Option<String>,
    pub vendor_id: Option<String>,
    pub currency: Option<String>,
    pub fx_rate: Option<String>,
    pub note: Option<String>,
}

impl<'a> Book<'a> {
    pub fn create_spot(&self, input: SpotInput) -> Res<CreatedEvent> {
        let acc = self.account(&input.account_id)?;
        require_positive(input.amount, "金额")?;
        let accrual_date = normalize_date(&input.accrual_date);
        let budget_month = input
            .budget_month
            .clone()
            .filter(|m| !m.is_empty())
            .unwrap_or_else(|| month_of(&accrual_date));
        self.ensure_period(&budget_month)?;
        self.reject_closed(&budget_month)?;

        let auto = self.classify(input.amount)?;
        let rule = self.resolve_tag(&acc.id, input.amount, &budget_month, input.tag.as_deref())?;
        let tag_upgraded = rule.tag != auto.tag;

        let mut warnings = Vec::new();
        if input.pool == Pool::Recurring {
            let bal = self.recurring_balance(&acc.id, &budget_month)?;
            if bal < input.amount {
                warnings.push(format!(
                    "规律预算不足：该月可用 {}，本笔支出 {}，提交后为 {}。可从一次性预算转入补充。",
                    yuan(bal),
                    yuan(input.amount),
                    yuan(bal - input.amount)
                ));
            }
        }

        let draft = EventDraft {
            kind: "spot".into(),
            direction: "expense".into(),
            accrual_date: accrual_date.clone(),
            budget_month: budget_month.clone(),
            cash_date: Some(accrual_date.clone()),
            amount: input.amount,
            cash_amount: input.amount,
            currency: input.currency.clone().unwrap_or_else(|| acc.currency.clone()),
            fx_rate: input.fx_rate.clone(),
            account_id: Some(acc.id.clone()),
            pool: Some(input.pool.as_str().into()),
            tag: Some(rule.tag.clone()),
            counter_delta: 1,
            vendor_id: input.vendor_id.clone(),
            title: input.title.clone(),
            reason: input.reason.clone(),
            urgency: input.urgency.clone(),
            market_price: input.market_price,
            expected_effect: input.expected_effect.clone(),
            usage_months: input.usage_months,
            necessity: input.necessity.clone(),
            purpose: input.purpose.clone(),
            note: input.note.clone(),
            ..Default::default()
        };
        self.validate_required(&rule, &draft)?;

        let event_id = self.insert_event(&draft)?;
        self.post(
            &event_id,
            &acc.id,
            input.pool,
            &budget_month,
            -input.amount,
            "expense",
        )?;
        self.add_cash(&event_id, &acc.id, &accrual_date, -input.amount, "expense")?;
        self.bump_counter(&acc.id, &rule.tag, &budget_month, 1)?;

        Ok(CreatedEvent {
            event_id,
            tag: Some(rule.tag),
            tag_upgraded,
            warnings,
        })
    }
}

// ---------------------------------------------------------------------------
// 期货
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OrderLineInput {
    pub kind: String, // item | fee
    pub name: String,
    pub qty: Option<f64>,
    pub unit_price: Option<i64>,
    pub amount: Option<i64>,
    pub currency: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FuturesInput {
    pub account_id: String,
    pub pool: Pool,
    /// 尾款账户（不填则同定金账户）
    pub balance_account_id: Option<String>,
    /// 尾款预算池（不填则同定金池）
    pub balance_pool: Option<Pool>,
    pub total: Option<i64>,
    pub deposit: i64,
    pub accrual_date: String,
    pub balance_month: String,
    pub tag: Option<String>,
    pub title: Option<String>,
    pub vendor_id: Option<String>,
    pub vendor_name: Option<String>,
    pub lines: Option<Vec<OrderLineInput>>,
    pub currency: Option<String>,
    pub fx_rate: Option<String>,
    pub original_total: Option<i64>,
    pub order_deadline: Option<String>,
    pub reason: Option<String>,
    pub urgency: Option<String>,
    pub market_price: Option<i64>,
    pub expected_effect: Option<String>,
    pub usage_months: Option<i64>,
    pub necessity: Option<String>,
    pub purpose: Option<String>,
    pub note: Option<String>,
}

pub fn line_amount(l: &OrderLineInput) -> i64 {
    match l.amount {
        Some(a) if a > 0 => a,
        _ => {
            let qty = l.qty.unwrap_or(1.0);
            (qty * l.unit_price.unwrap_or(0) as f64).round() as i64
        }
    }
}

impl<'a> Book<'a> {
    pub fn ensure_vendor(&self, id: Option<&str>, name: Option<&str>) -> Res<Option<String>> {
        if let Some(id) = id {
            if !id.is_empty() {
                return Ok(Some(id.to_string()));
            }
        }
        let name = match name {
            Some(n) if !n.trim().is_empty() => n.trim(),
            _ => return Ok(None),
        };
        let existing: Option<String> = self
            .conn
            .query_row("SELECT id FROM vendor WHERE name=?", [name], |r| r.get(0))
            .optional()?;
        if let Some(id) = existing {
            return Ok(Some(id));
        }
        let id = new_id();
        self.conn.execute(
            "INSERT INTO vendor(id,name,created_at) VALUES (?,?,?)",
            params![id, name, now_iso()],
        )?;
        Ok(Some(id))
    }

    pub fn create_futures(&self, input: FuturesInput) -> Res<CreatedEvent> {
        // 定金与尾款可以落在不同账户、不同预算池
        let acc = self.account(&input.account_id)?;
        let bal_acc = match input.balance_account_id.as_deref() {
            Some(id) if !id.trim().is_empty() => self.account(id.trim())?,
            _ => acc.clone(),
        };
        let bal_pool = input.balance_pool.unwrap_or(input.pool);
        let accrual_date = normalize_date(&input.accrual_date);
        let deposit_month = month_of(&accrual_date);
        let balance_month = if input.balance_month.is_empty() {
            deposit_month.clone()
        } else {
            input.balance_month.clone()
        };
        self.ensure_period(&deposit_month)?;
        self.ensure_period(&balance_month)?;
        self.reject_closed(&deposit_month)?;
        self.reject_closed(&balance_month)?;

        let lines = input.lines.clone().unwrap_or_default();
        let total = if !lines.is_empty() {
            lines.iter().map(line_amount).sum::<i64>()
        } else {
            input.total.unwrap_or(0)
        };
        require_positive(total, "订单总额")?;
        if input.deposit < 0 || input.deposit > total {
            return Err(AppError::validation("定金必须在 0 与订单总额之间"));
        }
        let balance = total - input.deposit;

        let auto = self.classify(total)?;
        let rule = self.resolve_tag(&acc.id, total, &deposit_month, input.tag.as_deref())?;
        let tag_upgraded = rule.tag != auto.tag;

        let vendor_id = self.ensure_vendor(input.vendor_id.as_deref(), input.vendor_name.as_deref())?;

        let mut meta = serde_json::Map::new();
        if let Some(d) = &input.order_deadline {
            meta.insert("orderDeadline".into(), serde_json::Value::String(d.clone()));
        }
        meta.insert(
            "deposit".into(),
            serde_json::Value::Number(input.deposit.into()),
        );
        meta.insert(
            "balance".into(),
            serde_json::Value::Number(balance.into()),
        );
        meta.insert("depositMonth".into(), serde_json::Value::String(deposit_month.clone()));
        meta.insert("balanceMonth".into(), serde_json::Value::String(balance_month.clone()));
        meta.insert("orderStatus".into(), serde_json::Value::String("pending".into()));
        meta.insert(
            "rollovers".into(),
            serde_json::Value::Number(0.into()),
        );

        let draft = EventDraft {
            kind: "futures_order".into(),
            direction: "expense".into(),
            accrual_date: accrual_date.clone(),
            budget_month: deposit_month.clone(),
            cash_date: Some(accrual_date.clone()),
            amount: total,
            cash_amount: input.deposit,
            currency: input.currency.clone().unwrap_or_else(|| acc.currency.clone()),
            fx_rate: input.fx_rate.clone(),
            original_amount: input.original_total,
            account_id: Some(acc.id.clone()),
            to_account_id: Some(bal_acc.id.clone()),
            pool: Some(input.pool.as_str().into()),
            to_pool: Some(bal_pool.as_str().into()),
            tag: Some(rule.tag.clone()),
            counter_delta: 1,
            vendor_id: vendor_id.clone(),
            title: input.title.clone(),
            reason: input.reason.clone(),
            urgency: input.urgency.clone(),
            market_price: input.market_price,
            expected_effect: input.expected_effect.clone(),
            usage_months: input.usage_months,
            necessity: input.necessity.clone(),
            purpose: input.purpose.clone(),
            note: input.note.clone(),
            meta: Some(serde_json::Value::Object(meta).to_string()),
            ..Default::default()
        };
        self.validate_required(&rule, &draft)?;

        let event_id = self.insert_event(&draft)?;

        // 定金：计入定金月
        self.post(
            &event_id,
            &acc.id,
            input.pool,
            &deposit_month,
            -input.deposit,
            "expense",
        )?;
        if input.deposit > 0 {
            self.add_cash(&event_id, &acc.id, &accrual_date, -input.deposit, "expense")?;
        }

        // 尾款：锁定尾款月，并登记义务（记在尾款账户/池上）
        if balance > 0 {
            self.post(
                &event_id,
                &bal_acc.id,
                bal_pool,
                &balance_month,
                -balance,
                "expense",
            )?;
            let ob_id = new_id();
            let now = now_iso();
            self.conn.execute(
                "INSERT INTO obligation(id,event_id,account_id,kind,due_month,amount,paid_amount,pool,tag,status,created_at,updated_at)
                 VALUES (?,?,?,'futures_balance',?,?,0,?,?,'pending',?,?)",
                params![
                    ob_id,
                    event_id,
                    bal_acc.id,
                    balance_month,
                    balance,
                    bal_pool.as_str(),
                    rule.tag,
                    now,
                    now
                ],
            )?;
        }

        self.bump_counter(&acc.id, &rule.tag, &deposit_month, 1)?;

        // 明细
        for (i, l) in lines.iter().enumerate() {
            self.conn.execute(
                "INSERT INTO order_line(id,event_id,kind,name,qty,unit_price,amount,currency,note,sort)
                 VALUES (?,?,?,?,?,?,?,?,?,?)",
                params![
                    new_id(),
                    event_id,
                    l.kind,
                    l.name,
                    l.qty.unwrap_or(1.0),
                    l.unit_price.unwrap_or(0),
                    line_amount(l),
                    l.currency,
                    l.note,
                    i as i64
                ],
            )?;
        }

        let mut warnings = Vec::new();
        if balance > 0 {
            let bal = self.recurring_balance(&bal_acc.id, &balance_month)?;
            if bal_pool == Pool::Recurring && bal < 0 {
                warnings.push(format!(
                    "{} 的规律预算在锁定尾款后为 {}，将转入负结转。",
                    balance_month,
                    yuan(bal)
                ));
            }
        }

        Ok(CreatedEvent {
            event_id,
            tag: Some(rule.tag),
            tag_upgraded,
            warnings,
        })
    }

    // -- 尾款支付 ---------------------------------------------------------

    pub fn pay_obligation(
        &self,
        obligation_id: &str,
        amount: i64,
        date: &str,
        note: Option<&str>,
    ) -> Res<CreatedEvent> {
        let ob = self.obligation(obligation_id)?;
        if ob.status == "cancelled" || ob.status == "settled" {
            return Err(AppError::conflict("该义务已结束，不能支付"));
        }
        require_positive(amount, "支付金额")?;
        let remaining = ob.amount - ob.paid_amount;
        if amount > remaining {
            return Err(AppError::validation(format!(
                "支付金额超过未付余额 {}",
                yuan(remaining)
            )));
        }
        let date = normalize_date(date);
        let event_id = self.insert_event(&EventDraft {
            kind: "futures_payment".into(),
            direction: "neutral".into(),
            ref_event_id: Some(ob.event_id.clone()),
            obligation_id: Some(ob.id.clone()),
            accrual_date: date.clone(),
            budget_month: month_of(&date),
            cash_date: Some(date.clone()),
            amount,
            cash_amount: amount,
            account_id: Some(ob.account_id.clone()),
            pool: ob.pool.clone(),
            tag: ob.tag.clone(),
            note: note.map(|s| s.to_string()),
            ..Default::default()
        })?;
        self.add_cash(&event_id, &ob.account_id, &date, -amount, "futures_payment")?;

        let paid = ob.paid_amount + amount;
        let status = if paid >= ob.amount { "paid" } else { "pending" };
        self.conn.execute(
            "UPDATE obligation SET paid_amount=?, status=?, updated_at=? WHERE id=?",
            params![paid, status, now_iso(), ob.id],
        )?;
        Ok(CreatedEvent {
            event_id,
            tag: None,
            tag_upgraded: false,
            warnings: Vec::new(),
        })
    }

    /// 核销：修改尾款预估金额（重算预算锁定）
    pub fn settle_obligation(
        &self,
        obligation_id: &str,
        new_amount: i64,
        date: &str,
        note: Option<&str>,
    ) -> Res<CreatedEvent> {
        let ob = self.obligation(obligation_id)?;
        if ob.status == "cancelled" {
            return Err(AppError::conflict("该义务已取消"));
        }
        if ob.kind != "futures_balance" {
            return Err(AppError::validation("只有期货尾款可以这样核销，计提请使用专用的核销入口"));
        }
        if new_amount < ob.paid_amount {
            return Err(AppError::validation(format!(
                "新金额不能低于已支付金额 {}",
                yuan(ob.paid_amount)
            )));
        }
        let date = normalize_date(date);
        let delta = new_amount - ob.amount;
        let month = self.target_open_month(&ob.due_month)?;
        let pool = Pool::parse(ob.pool.as_deref().unwrap_or("recurring"))
            .ok_or_else(|| AppError::internal("义务的预算池数据异常"))?;

        let event_id = self.insert_event(&EventDraft {
            kind: "futures_settle".into(),
            direction: "neutral".into(),
            ref_event_id: Some(ob.event_id.clone()),
            obligation_id: Some(ob.id.clone()),
            accrual_date: date.clone(),
            budget_month: month.clone(),
            amount: new_amount,
            account_id: Some(ob.account_id.clone()),
            pool: ob.pool.clone(),
            tag: ob.tag.clone(),
            note: note.map(|s| s.to_string()),
            meta: Some(
                serde_json::json!({ "previousAmount": ob.amount, "delta": delta }).to_string(),
            ),
            ..Default::default()
        })?;

        if delta != 0 {
            self.post(&event_id, &ob.account_id, pool, &month, -delta, "relock")?;
        }
        self.conn.execute(
            "UPDATE obligation SET amount=?, status=?, updated_at=? WHERE id=?",
            params![
                new_amount,
                if ob.paid_amount >= new_amount { "paid" } else { "pending" },
                now_iso(),
                ob.id
            ],
        )?;
        Ok(CreatedEvent {
            event_id,
            tag: None,
            tag_upgraded: false,
            warnings: Vec::new(),
        })
    }

    /// 展期：把尾款锁定的预算移动到新的尾款月
    pub fn rollover_obligation(
        &self,
        obligation_id: &str,
        new_month: &str,
        date: &str,
        note: Option<&str>,
    ) -> Res<CreatedEvent> {
        let ob = self.obligation(obligation_id)?;
        if ob.status != "pending" && ob.status != "frozen" {
            return Err(AppError::conflict("只能展期尚未付清的尾款"));
        }
        if new_month <= ob.due_month.as_str() {
            return Err(AppError::validation("新的尾款月必须晚于原尾款月"));
        }
        self.ensure_period(new_month)?;
        self.reject_closed(new_month)?;
        let date = normalize_date(date);
        let from_month = self.target_open_month(&ob.due_month)?;
        let pool = Pool::parse(ob.pool.as_deref().unwrap_or("recurring"))
            .ok_or_else(|| AppError::internal("义务的预算池数据异常"))?;
        let extension_days = days_between(&month_start(&ob.due_month), &month_start(new_month));

        let event_id = self.insert_event(&EventDraft {
            kind: "futures_rollover".into(),
            direction: "neutral".into(),
            ref_event_id: Some(ob.event_id.clone()),
            obligation_id: Some(ob.id.clone()),
            accrual_date: date.clone(),
            budget_month: new_month.to_string(),
            amount: ob.amount,
            account_id: Some(ob.account_id.clone()),
            pool: ob.pool.clone(),
            note: note.map(|s| s.to_string()),
            meta: Some(
                serde_json::json!({
                    "fromMonth": ob.due_month,
                    "toMonth": new_month,
                    "extensionDays": extension_days
                })
                .to_string(),
            ),
            ..Default::default()
        })?;

        self.post(&event_id, &ob.account_id, pool, &from_month, ob.amount, "release")?;
        self.post(&event_id, &ob.account_id, pool, new_month, -ob.amount, "expense")?;
        self.conn.execute(
            "UPDATE obligation SET due_month=?, updated_at=? WHERE id=?",
            params![new_month, now_iso(), ob.id],
        )?;
        // 展期次数写回订单 meta
        self.bump_meta_counter(&ob.event_id, "rollovers")?;

        Ok(CreatedEvent {
            event_id,
            tag: None,
            tag_upgraded: false,
            warnings: Vec::new(),
        })
    }

    fn bump_meta_counter(&self, event_id: &str, key: &str) -> Res<()> {
        let meta: Option<String> = self
            .conn
            .query_row("SELECT meta FROM ledger_event WHERE id=?", [event_id], |r| r.get::<_, Option<String>>(0))
            .optional()?
            .flatten();
        let mut obj: serde_json::Map<String, serde_json::Value> = meta
            .and_then(|m| serde_json::from_str::<serde_json::Value>(&m).ok())
            .and_then(|v| v.as_object().cloned())
            .unwrap_or_default();
        let cur = obj.get(key).and_then(|v| v.as_i64()).unwrap_or(0);
        obj.insert(key.into(), serde_json::Value::Number((cur + 1).into()));
        self.conn.execute(
            "UPDATE ledger_event SET meta=? WHERE id=?",
            params![serde_json::Value::Object(obj).to_string(), event_id],
        )?;
        Ok(())
    }

    /// 取消订单：释放未付锁定，登记可选退款
    pub fn cancel_futures(
        &self,
        order_event_id: &str,
        reason_kind: &str,
        refund: i64,
        date: &str,
        note: Option<&str>,
    ) -> Res<CreatedEvent> {
        let ob: Option<Obligation> = self.obligation_by_event(order_event_id)?;
        let date = normalize_date(date);
        let query = "SELECT account_id,pool,amount FROM ledger_event WHERE id=?";
        let (account_id, pool_s, amount): (String, Option<String>, i64) = self
            .conn
            .query_row(query, [order_event_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .optional()?
            .ok_or_else(|| AppError::not_found("订单不存在"))?;

        let pool = Pool::parse(pool_s.as_deref().unwrap_or("recurring"))
            .ok_or_else(|| AppError::internal("订单的预算池数据异常"))?;

        let event_id = self.insert_event(&EventDraft {
            kind: "futures_cancel".into(),
            direction: "neutral".into(),
            ref_event_id: Some(order_event_id.to_string()),
            accrual_date: date.clone(),
            budget_month: month_of(&date),
            amount,
            account_id: Some(account_id.clone()),
            pool: pool_s.clone(),
            note: note.map(|s| s.to_string()),
            meta: Some(
                serde_json::json!({ "reasonKind": reason_kind, "refund": refund }).to_string(),
            ),
            ..Default::default()
        })?;

        if let Some(ob) = &ob {
            let unpaid = ob.amount - ob.paid_amount;
            if unpaid > 0 {
                let m = self.target_open_month(&ob.due_month)?;
                // 尾款锁在「尾款账户 + 尾款池」上，释放也要回到原处
                let ob_pool = ob
                    .pool
                    .as_deref()
                    .and_then(Pool::parse)
                    .unwrap_or(pool);
                self.post(&event_id, &ob.account_id, ob_pool, &m, unpaid, "release")?;
            }
            self.conn.execute(
                "UPDATE obligation SET status='cancelled', updated_at=? WHERE id=?",
                params![now_iso(), ob.id],
            )?;
        }
        if refund > 0 {
            let m = month_of(&date);
            self.post(&event_id, &account_id, Pool::OneOff, &m, refund, "release")?;
            self.add_cash(&event_id, &account_id, &date, refund, "refund")?;
        }
        self.mark_order_status(order_event_id, "cancelled")?;
        Ok(CreatedEvent {
            event_id,
            tag: None,
            tag_upgraded: false,
            warnings: Vec::new(),
        })
    }

    fn mark_order_status(&self, order_event_id: &str, status: &str) -> Res<()> {
        let meta: Option<String> = self
            .conn
            .query_row("SELECT meta FROM ledger_event WHERE id=?", [order_event_id], |r| r.get::<_, Option<String>>(0))
            .optional()?
            .flatten();
        let mut obj: serde_json::Map<String, serde_json::Value> = meta
            .and_then(|m| serde_json::from_str::<serde_json::Value>(&m).ok())
            .and_then(|v| v.as_object().cloned())
            .unwrap_or_default();
        obj.insert("orderStatus".into(), serde_json::Value::String(status.into()));
        self.conn.execute(
            "UPDATE ledger_event SET meta=? WHERE id=?",
            params![serde_json::Value::Object(obj).to_string(), order_event_id],
        )?;
        Ok(())
    }

    /// 冻结 / 解冻未来义务：预算保持锁定
    pub fn freeze_obligation(
        &self,
        obligation_id: &str,
        frozen: bool,
        date: &str,
        note: Option<&str>,
    ) -> Res<CreatedEvent> {
        let ob = self.obligation(obligation_id)?;
        if ob.status == "paid" || ob.status == "cancelled" || ob.status == "settled" {
            return Err(AppError::conflict("该义务已结束，无法冻结"));
        }
        let date = normalize_date(date);
        let event_id = self.insert_event(&EventDraft {
            kind: "freeze".into(),
            direction: "neutral".into(),
            ref_event_id: Some(ob.event_id.clone()),
            obligation_id: Some(ob.id.clone()),
            accrual_date: date.clone(),
            budget_month: ob.due_month.clone(),
            amount: ob.amount,
            account_id: Some(ob.account_id.clone()),
            pool: ob.pool.clone(),
            note: note.map(|s| s.to_string()),
            meta: Some(serde_json::json!({ "frozen": frozen }).to_string()),
            ..Default::default()
        })?;
        self.conn.execute(
            "UPDATE obligation SET status=?, updated_at=? WHERE id=?",
            params![if frozen { "frozen" } else { "pending" }, now_iso(), ob.id],
        )?;
        Ok(CreatedEvent {
            event_id,
            tag: None,
            tag_upgraded: false,
            warnings: Vec::new(),
        })
    }
}

// ---------------------------------------------------------------------------
// 计提
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccrualInput {
    pub account_id: String,
    pub amount: i64,
    pub pool: Pool,
    pub accrual_date: String,
    pub budget_month: Option<String>,
    pub title: Option<String>,
    pub reason: Option<String>,
    pub note: Option<String>,
}

impl<'a> Book<'a> {
    pub fn create_accrual(&self, input: AccrualInput) -> Res<CreatedEvent> {
        let acc = self.account(&input.account_id)?;
        require_positive(input.amount, "计提金额")?;
        let accrual_date = normalize_date(&input.accrual_date);
        let budget_month = input
            .budget_month
            .clone()
            .filter(|m| !m.is_empty())
            .unwrap_or_else(|| month_of(&accrual_date));
        self.ensure_period(&budget_month)?;
        self.reject_closed(&budget_month)?;

        let draft = EventDraft {
            kind: "accrual".into(),
            direction: "expense".into(),
            accrual_date: accrual_date.clone(),
            budget_month: budget_month.clone(),
            amount: input.amount,
            account_id: Some(acc.id.clone()),
            pool: Some(input.pool.as_str().into()),
            title: input.title.clone(),
            reason: input.reason.clone(),
            note: input.note.clone(),
            status: Some("estimated".into()),
            ..Default::default()
        };
        let event_id = self.insert_event(&draft)?;
        self.post(
            &event_id,
            &acc.id,
            input.pool,
            &budget_month,
            -input.amount,
            "expense",
        )?;

        let ob_id = new_id();
        let now = now_iso();
        self.conn.execute(
            "INSERT INTO obligation(id,event_id,account_id,kind,due_month,amount,paid_amount,pool,status,note,created_at,updated_at)
             VALUES (?,?,?,'accrual',?,?,0,?,'pending',?,?,?)",
            params![
                ob_id,
                event_id,
                acc.id,
                budget_month,
                input.amount,
                input.pool.as_str(),
                input.note,
                now,
                now
            ],
        )?;

        Ok(CreatedEvent {
            event_id,
            tag: None,
            tag_upgraded: false,
            warnings: Vec::new(),
        })
    }

    /// 计提核销：释放估计值 → 生成真实现货交易
    pub fn settle_accrual(&self, input: SpotInput, obligation_id: &str) -> Res<CreatedEvent> {
        let ob = self.obligation(obligation_id)?;
        if ob.kind != "accrual" {
            return Err(AppError::validation("该义务不是计提"));
        }
        if ob.status != "pending" && ob.status != "frozen" {
            return Err(AppError::conflict("该计提已结束，不能重复核销"));
        }
        require_positive(input.amount, "实际金额")?;

        let release_month = self.target_open_month(&ob.due_month)?;
        let now_date = normalize_date(&input.accrual_date);
        let settle_event = self.insert_event(&EventDraft {
            kind: "accrual_settle".into(),
            direction: "neutral".into(),
            ref_event_id: Some(ob.event_id.clone()),
            obligation_id: Some(ob.id.clone()),
            accrual_date: now_date.clone(),
            budget_month: release_month.clone(),
            amount: input.amount,
            account_id: Some(ob.account_id.clone()),
            pool: ob.pool.clone(),
            note: input.note.clone(),
            meta: Some(serde_json::json!({ "estimated": ob.amount }).to_string()),
            ..Default::default()
        })?;
        // 释放原计提（按 Q8：释放一律进一次性）
        self.post(
            &settle_event,
            &ob.account_id,
            Pool::OneOff,
            &release_month,
            ob.amount,
            "release",
        )?;

        // 生成真实现货
        let created = self.create_spot(input)?;
        self.conn.execute(
            "UPDATE obligation SET status='settled', updated_at=? WHERE id=?",
            params![now_iso(), ob.id],
        )?;
        self.set_event_status(&ob.event_id, "settled")?;
        Ok(created)
    }
}

// ---------------------------------------------------------------------------
// 转账 / 收入
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferInput {
    pub from_account_id: String,
    pub to_account_id: String,
    pub amount: i64,
    pub from_pool: Pool,
    pub to_pool: Pool,
    pub date: String,
    pub note: Option<String>,
}

impl<'a> Book<'a> {
    pub fn create_transfer(&self, input: TransferInput) -> Res<CreatedEvent> {
        require_positive(input.amount, "转账金额")?;
        if input.from_account_id == input.to_account_id && input.from_pool == input.to_pool {
            return Err(AppError::validation("转出与转入完全相同，没有意义"));
        }
        if input.from_pool == Pool::OneOff && input.to_pool == Pool::Recurring {
            return Err(AppError::validation(
                "一次性预算不可转回规律预算（不可再生资源不得再生）",
            ));
        }
        let from = self.account(&input.from_account_id)?;
        let to = self.account(&input.to_account_id)?;
        let date = normalize_date(&input.date);
        let month = month_of(&date);
        self.ensure_period(&month)?;
        self.reject_closed(&month)?;

        let event_id = self.insert_event(&EventDraft {
            kind: "transfer".into(),
            direction: "neutral".into(),
            accrual_date: date.clone(),
            budget_month: month.clone(),
            cash_date: Some(date.clone()),
            amount: input.amount,
            cash_amount: input.amount,
            account_id: Some(from.id.clone()),
            to_account_id: Some(to.id.clone()),
            pool: Some(input.from_pool.as_str().into()),
            to_pool: Some(input.to_pool.as_str().into()),
            note: input.note.clone(),
            ..Default::default()
        })?;
        self.post(&event_id, &from.id, input.from_pool, &month, -input.amount, "transfer_out")?;
        self.post(&event_id, &to.id, input.to_pool, &month, input.amount, "transfer_in")?;
        self.add_cash(&event_id, &from.id, &date, -input.amount, "transfer_out")?;
        self.add_cash(&event_id, &to.id, &date, input.amount, "transfer_in")?;

        Ok(CreatedEvent {
            event_id,
            tag: None,
            tag_upgraded: false,
            warnings: Vec::new(),
        })
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomeInput {
    pub account_id: String,
    pub amount: i64,
    pub pool: Pool,
    pub income_kind: String, // regular | oneoff
    pub date: String,
    pub title: Option<String>,
    pub note: Option<String>,
}

impl<'a> Book<'a> {
    pub fn create_income(&self, input: IncomeInput) -> Res<CreatedEvent> {
        let acc = self.account(&input.account_id)?;
        require_positive(input.amount, "收入金额")?;
        if input.income_kind == "oneoff" && input.pool != Pool::OneOff {
            return Err(AppError::validation("一次性收入只能进入一次性预算"));
        }
        let date = normalize_date(&input.date);
        let month = month_of(&date);
        self.ensure_period(&month)?;
        self.reject_closed(&month)?;

        let event_id = self.insert_event(&EventDraft {
            kind: "income".into(),
            direction: "income".into(),
            accrual_date: date.clone(),
            budget_month: month.clone(),
            cash_date: Some(date.clone()),
            amount: input.amount,
            cash_amount: input.amount,
            account_id: Some(acc.id.clone()),
            pool: Some(input.pool.as_str().into()),
            title: input.title.clone(),
            meta: Some(serde_json::json!({ "incomeKind": input.income_kind }).to_string()),
            note: input.note.clone(),
            ..Default::default()
        })?;
        self.post(&event_id, &acc.id, input.pool, &month, input.amount, "income")?;
        self.add_cash(&event_id, &acc.id, &date, input.amount, "income")?;

        Ok(CreatedEvent {
            event_id,
            tag: None,
            tag_upgraded: false,
            warnings: Vec::new(),
        })
    }
}

// ---------------------------------------------------------------------------
// 冲销
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReversalInput {
    pub event_id: String,
    pub amount: i64,
    pub date: String,
    pub reason: Option<String>,
    pub refund_amount: Option<i64>,
    pub title: Option<String>,
}

impl<'a> Book<'a> {
    pub fn reverse(&self, input: ReversalInput) -> Res<CreatedEvent> {
        let (kind, direction, account_id, counter_delta, budget_month, pool_s): (
            String,
            String,
            Option<String>,
            i64,
            String,
            Option<String>,
        ) = self
            .conn
            .query_row(
                "SELECT kind,direction,account_id,counter_delta,budget_month,pool FROM ledger_event WHERE id=?",
                [&input.event_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
            )
            .optional()?
            .ok_or_else(|| AppError::not_found("原交易不存在"))?;

        match kind.as_str() {
            "spot" | "futures_order" | "accrual" | "income" | "transfer" | "accrual_settle" => {}
            _ => {
                return Err(AppError::conflict(
                    "该类型交易不支持直接冲销（核销、展期、冻结请使用各自的反向操作）",
                ))
            }
        }
        if input.amount < 0 {
            return Err(AppError::validation("冲销金额不能为负"));
        }
        let account_id = account_id.ok_or_else(|| AppError::internal("原交易缺少账户"))?;
        let consumed: i64 = self.conn.query_row(
            "SELECT COALESCE(SUM(amount),0) FROM posting WHERE event_id=?",
            [&input.event_id],
            |r| r.get(0),
        )?;
        // 支出类：consumed 为负；收入类：consumed 为正
        let magnitude = if direction == "expense" { -consumed } else { consumed };
        if magnitude <= 0 {
            return Err(AppError::conflict("原交易没有可冲销的预算影响"));
        }
        let already: i64 = self
            .conn
            .query_row(
                "SELECT COALESCE(SUM(amount),0) FROM ledger_event WHERE kind='reversal' AND ref_event_id=? AND status<>'void'",
                [&input.event_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let remaining = (magnitude - already).max(0);
        let release = input.amount.min(remaining);
        let excess = input.amount - release;

        let date = normalize_date(&input.date);
        let month = month_of(&date);
        self.ensure_period(&month)?;

        let pool = pool_s
            .as_deref()
            .and_then(Pool::parse)
            .unwrap_or(Pool::Recurring);

        let reversal_direction = if direction == "expense" {
            "income".to_string()
        } else {
            "expense".to_string()
        };
        let event_id = self.insert_event(&EventDraft {
            kind: "reversal".into(),
            direction: reversal_direction,
            ref_event_id: Some(input.event_id.clone()),
            accrual_date: date.clone(),
            budget_month: month.clone(),
            amount: input.amount,
            account_id: Some(account_id.clone()),
            pool: Some(pool.as_str().into()),
            title: input.title.clone(),
            reason: input.reason.clone(),
            meta: Some(
                serde_json::json!({ "released": release, "excess": excess, "originalKind": kind })
                    .to_string(),
            ),
            ..Default::default()
        })?;

        if release > 0 {
            if direction == "expense" {
                // 退款：一律进一次性。跨账户的交易（如定金/尾款分属不同账户）
                // 按各账户实际占用比例分别退回，避免全部挤到定金账户。
                let mut by_account: Vec<(String, i64)> = {
                    let mut stmt = self.conn.prepare(
                        "SELECT account_id, COALESCE(-SUM(amount),0) FROM posting
                         WHERE event_id=? GROUP BY account_id ORDER BY account_id",
                    )?;
                    let rows = stmt
                        .query_map([&input.event_id], |r| {
                            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
                        })?
                        .collect::<rusqlite::Result<Vec<_>>>()?;
                    rows
                };
                by_account.sort_by(|a, b| b.1.cmp(&a.1));
                let mut left = release;
                for (acct, used) in by_account {
                    if left <= 0 {
                        break;
                    }
                    let take = used.max(0).min(left);
                    if take > 0 {
                        self.adjust(&event_id, &acct, &month, take)?;
                        left -= take;
                    }
                }
                if left > 0 {
                    self.adjust(&event_id, &account_id, &month, left)?;
                }
            } else {
                // 冲销收入：先扣一次性，不足扣规律
                self.adjust(&event_id, &account_id, &month, -release)?;
            }
        }

        let refund = input.refund_amount.unwrap_or_else(|| {
            if direction == "expense" {
                release
            } else {
                0
            }
        });
        if refund != 0 {
            self.add_cash(
                &event_id,
                &account_id,
                &date,
                if direction == "expense" { refund } else { -refund },
                "refund",
            )?;
        }

        // 撤销计数器
        if counter_delta > 0 {
            if let Some(tag) = self.conn.query_row(
                "SELECT tag FROM ledger_event WHERE id=?",
                [&input.event_id],
                |r| r.get::<_, Option<String>>(0),
            ).optional()?.flatten() {
                let m = if self.is_closed(&budget_month)? {
                    current_month()
                } else {
                    budget_month.clone()
                };
                self.bump_counter(&account_id, &tag, &m, -counter_delta)?;
            }
        }

        // 超出部分当新支出
        if excess > 0 {
            let rule = self.classify(excess)?;
            let spot_id = self.insert_event(&EventDraft {
                kind: "spot".into(),
                direction: "expense".into(),
                accrual_date: date.clone(),
                budget_month: month.clone(),
                cash_date: Some(date.clone()),
                amount: excess,
                cash_amount: excess,
                account_id: Some(account_id.clone()),
                pool: Some(Pool::Recurring.as_str().into()),
                tag: Some(rule.tag.clone()),
                counter_delta: 1,
                title: Some(format!("冲销超额部分（{}）", input.title.clone().unwrap_or_default())),
                parent_event_id: Some(event_id.clone()),
                ..Default::default()
            })?;
            let need = excess;
            let oneoff = self.oneoff_balance(&account_id, &month)?.max(0);
            let take = oneoff.min(need);
            self.post(&spot_id, &account_id, Pool::OneOff, &month, -take, "expense")?;
            if take < need {
                self.post(
                    &spot_id,
                    &account_id,
                    Pool::Recurring,
                    &month,
                    -(need - take),
                    "expense",
                )?;
            }
            self.add_cash(&spot_id, &account_id, &date, -excess, "expense")?;
            self.bump_counter(&account_id, &rule.tag, &month, 1)?;
        }

        let new_status = if already + input.amount >= magnitude {
            "reversed"
        } else {
            "partially_reversed"
        };
        self.set_event_status(&input.event_id, new_status)?;

        Ok(CreatedEvent {
            event_id,
            tag: None,
            tag_upgraded: false,
            warnings: if excess > 0 {
                vec![format!(
                    "冲销金额超过原交易预算影响，超出部分 {} 已记为新的支出。",
                    yuan(excess)
                )]
            } else {
                Vec::new()
            },
        })
    }
}

// ---------------------------------------------------------------------------
// 账户 / 额度
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountInput {
    pub name: String,
    pub kind: Option<String>,
    pub currency: Option<String>,
    pub sort: Option<i64>,
    pub note: Option<String>,
    pub initial_quota: Option<i64>,
    /// 初始一次性预算（正数=期初余额，负数=期初欠款）
    pub initial_oneoff: Option<i64>,
    pub initial_month: Option<String>,
}

impl<'a> Book<'a> {
    pub fn create_account(&self, input: AccountInput) -> Res<String> {
        if input.name.trim().is_empty() {
            return Err(AppError::validation("账户名称不能为空"));
        }
        let id = new_id();
        let now = now_iso();
        let month = input.initial_month.unwrap_or_else(current_month);
        self.ensure_period(&month)?;
        self.reject_closed(&month)?;

        self.conn.execute(
            "INSERT INTO account(id,name,kind,currency,sort,archived,note,created_at) VALUES (?,?,?,?,?,0,?,?)",
            params![
                id,
                input.name.trim(),
                input.kind.unwrap_or_else(|| "bank".into()),
                input.currency.unwrap_or_else(|| "CNY".into()),
                input.sort.unwrap_or(99),
                input.note,
                now
            ],
        )?;

        // 初始规律额度：直接从创建月份生效（这是"初始值"，不适用"次月生效"规则）
        if let Some(q) = input.initial_quota {
            self.conn.execute(
                "INSERT OR REPLACE INTO account_quota(account_id,month,amount,created_at) VALUES (?,?,?,?)",
                params![id, month, q, now],
            )?;
        }

        // 初始一次性预算：记一笔期初事件，进入一次性资金池
        if let Some(v) = input.initial_oneoff {
            if v != 0 {
                let event_id = self.insert_event(&EventDraft {
                    kind: "opening".into(),
                    direction: "neutral".into(),
                    accrual_date: month_start(&month),
                    budget_month: month.clone(),
                    amount: v,
                    account_id: Some(id.clone()),
                    pool: Some(Pool::OneOff.as_str().into()),
                    note: Some("账户初始一次性预算".into()),
                    ..Default::default()
                })?;
                self.post(&event_id, &id, Pool::OneOff, &month, v, "opening")?;
            }
        }

        Ok(id)
    }

    pub fn update_account(
        &self,
        id: &str,
        name: Option<String>,
        kind: Option<String>,
        note: Option<String>,
        sort: Option<i64>,
    ) -> Res<()> {
        let acc = self.account(id)?;
        self.conn.execute(
            "UPDATE account SET name=?,kind=?,note=?,sort=? WHERE id=?",
            params![
                name.unwrap_or(acc.name),
                kind.unwrap_or(acc.kind),
                note.or(acc.note),
                sort.unwrap_or(acc.sort),
                id
            ],
        )?;
        Ok(())
    }

    pub fn set_archived(&self, id: &str, archived: bool) -> Res<()> {
        self.conn.execute(
            "UPDATE account SET archived=? WHERE id=?",
            params![if archived { 1 } else { 0 }, id],
        )?;
        Ok(())
    }

    /// 修改规律预算额度：**从所选月份的下个月起生效**。
    /// 同一生效月份重复修改会就地覆盖（后改的赢）。
    /// 返回实际生效月份。
    pub fn set_quota(&self, account_id: &str, month: &str, amount: i64) -> Res<String> {
        self.account(account_id)?;
        let effective = month_add(month, 1);
        self.ensure_period(&effective)?;
        if self.is_closed(&effective)? {
            return Err(AppError::conflict(format!(
                "{effective} 已结账，不能追溯修改额度；请选择未结账的月份"
            )));
        }
        self.conn.execute(
            "INSERT INTO account_quota(account_id,month,amount,created_at) VALUES (?,?,?,?)
             ON CONFLICT(account_id,month) DO UPDATE SET amount=excluded.amount",
            params![account_id, effective, amount, now_iso()],
        )?;
        Ok(effective)
    }
}

// ---------------------------------------------------------------------------
// 期初余额
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpeningInput {
    pub account_id: String,
    pub pool: Pool,
    pub amount: i64,
    pub date: String,
    pub note: Option<String>,
}

impl<'a> Book<'a> {
    pub fn create_opening(&self, input: OpeningInput) -> Res<CreatedEvent> {
        let acc = self.account(&input.account_id)?;
        let date = normalize_date(&input.date);
        let month = month_of(&date);
        self.ensure_period(&month)?;
        self.reject_closed(&month)?;
        let event_id = self.insert_event(&EventDraft {
            kind: "opening".into(),
            direction: "neutral".into(),
            accrual_date: date.clone(),
            budget_month: month.clone(),
            amount: input.amount,
            account_id: Some(acc.id.clone()),
            pool: Some(input.pool.as_str().into()),
            note: input.note.clone(),
            ..Default::default()
        })?;
        self.post(&event_id, &acc.id, input.pool, &month, input.amount, "opening")?;
        Ok(CreatedEvent {
            event_id,
            tag: None,
            tag_upgraded: false,
            warnings: Vec::new(),
        })
    }
}
