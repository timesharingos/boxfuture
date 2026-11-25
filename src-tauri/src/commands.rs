use std::collections::BTreeMap;

use serde::Serialize;
use tauri::State;

use crate::db;
use crate::domain::*;
use crate::engine::close::ClosedPeriod;
use crate::engine::read::{
    AccountView, EventDetail, EventView, Obligation, QuotaGrant, QuotaPoint, TagRuleView,
};
use crate::engine::write::*;
use crate::engine::Book;
use crate::reports::*;
use crate::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrencyView {
    pub code: String,
    pub name: String,
    pub symbol: String,
    pub minor_unit: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VendorView {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    pub current_month: String,
    pub today: String,
    pub accounts: Vec<AccountView>,
    pub tag_rules: Vec<TagRuleView>,
    pub settings: BTreeMap<String, String>,
    pub currencies: Vec<CurrencyView>,
    pub vendors: Vec<VendorView>,
    pub auto_closed: Vec<ClosedPeriod>,
    pub current_period_closed: bool,
    pub closed_months: Vec<String>,
    pub db_path: String,
}

#[tauri::command]
pub fn bootstrap(state: State<'_, AppState>) -> Res<Bootstrap> {
    let conn = state.db.lock().unwrap();
    let book = Book::new(&conn);
    let month = current_month();
    let auto_closed = book.ensure_periods()?;
    let accounts = book.accounts(&month)?;
    let tag_rules = book.tag_rule_views(None, &month)?;
    let settings = book.settings_map()?;
    let currencies = book
        .currencies()?
        .into_iter()
        .map(|(code, name, symbol, minor_unit)| CurrencyView {
            code,
            name,
            symbol,
            minor_unit,
        })
        .collect();
    let vendors = book
        .list_vendors()?
        .into_iter()
        .map(|(id, name)| VendorView { id, name })
        .collect();
    let current_period_closed = book.is_closed(&month)?;
    let closed_months = {
        let mut stmt = conn.prepare("SELECT month FROM period WHERE status='closed' ORDER BY month")?;
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        rows
    };
    Ok(Bootstrap {
        current_month: month,
        today: today(),
        accounts,
        tag_rules,
        settings,
        currencies,
        vendors,
        auto_closed,
        current_period_closed,
        closed_months,
        db_path: state.db_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn refresh_periods(state: State<'_, AppState>) -> Res<Vec<ClosedPeriod>> {
    let conn = state.db.lock().unwrap();
    Book::new(&conn).ensure_periods()
}

#[tauri::command]
pub fn close_month(state: State<'_, AppState>, month: String) -> Res<ClosedPeriod> {
    let conn = state.db.lock().unwrap();
    let book = Book::new(&conn);
    book.tx(|| book.close_month(&month, false))
}

#[tauri::command]
pub fn reopen_month(state: State<'_, AppState>, month: String) -> Res<()> {
    let conn = state.db.lock().unwrap();
    let book = Book::new(&conn);
    book.tx(|| book.reopen_month(&month))
}

#[tauri::command]
pub fn list_events(
    state: State<'_, AppState>,
    from_month: Option<String>,
    to_month: Option<String>,
    account_id: Option<String>,
    kind: Option<String>,
    search: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Res<Vec<EventView>> {
    let conn = state.db.lock().unwrap();
    Book::new(&conn).list_events(
        from_month.as_deref(),
        to_month.as_deref(),
        account_id.as_deref(),
        kind.as_deref(),
        search.as_deref(),
        limit.unwrap_or(200),
        offset.unwrap_or(0),
    )
}

#[tauri::command]
pub fn event_detail(state: State<'_, AppState>, id: String) -> Res<EventDetail> {
    let conn = state.db.lock().unwrap();
    Book::new(&conn).event_detail(&id)
}

/// 账本展示用：区间内每账户每月的「规律预算注入」虚拟行（只读，不落库）
#[tauri::command]
pub fn quota_grants(
    state: State<'_, AppState>,
    from_month: String,
    to_month: String,
) -> Res<Vec<QuotaGrant>> {
    let conn = state.db.lock().unwrap();
    Book::new(&conn).quota_grants(&from_month, &to_month)
}

#[tauri::command]
pub fn quota_history(state: State<'_, AppState>, account_id: String) -> Res<Vec<QuotaPoint>> {
    let conn = state.db.lock().unwrap();
    Book::new(&conn).quota_history(&account_id)
}

#[tauri::command]
pub fn create_spot(state: State<'_, AppState>, input: SpotInput) -> Res<CreatedEvent> {
    let conn = state.db.lock().unwrap();
    let book = Book::new(&conn);
    book.tx(|| book.create_spot(input))
}

#[tauri::command]
pub fn create_futures(state: State<'_, AppState>, input: FuturesInput) -> Res<CreatedEvent> {
    let conn = state.db.lock().unwrap();
    let book = Book::new(&conn);
    book.tx(|| book.create_futures(input))
}

#[tauri::command]
pub fn create_accrual(state: State<'_, AppState>, input: AccrualInput) -> Res<CreatedEvent> {
    let conn = state.db.lock().unwrap();
    let book = Book::new(&conn);
    book.tx(|| book.create_accrual(input))
}

#[tauri::command]
pub fn settle_accrual(
    state: State<'_, AppState>,
    obligation_id: String,
    input: SpotInput,
) -> Res<CreatedEvent> {
    let conn = state.db.lock().unwrap();
    let book = Book::new(&conn);
    book.tx(|| book.settle_accrual(input, &obligation_id))
}

#[tauri::command]
pub fn create_transfer(state: State<'_, AppState>, input: TransferInput) -> Res<CreatedEvent> {
    let conn = state.db.lock().unwrap();
    let book = Book::new(&conn);
    book.tx(|| book.create_transfer(input))
}

#[tauri::command]
pub fn create_income(state: State<'_, AppState>, input: IncomeInput) -> Res<CreatedEvent> {
    let conn = state.db.lock().unwrap();
    let book = Book::new(&conn);
    book.tx(|| book.create_income(input))
}

#[tauri::command]
pub fn create_opening(state: State<'_, AppState>, input: OpeningInput) -> Res<CreatedEvent> {
    let conn = state.db.lock().unwrap();
    let book = Book::new(&conn);
    book.tx(|| book.create_opening(input))
}

#[tauri::command]
pub fn create_realize(state: State<'_, AppState>, input: RealizeInput) -> Res<CreatedEvent> {
    let conn = state.db.lock().unwrap();
    let book = Book::new(&conn);
    book.tx(|| book.create_realize(input))
}

#[tauri::command]
pub fn undo_realize(state: State<'_, AppState>, event_id: String) -> Res<CreatedEvent> {
    let conn = state.db.lock().unwrap();
    let book = Book::new(&conn);
    book.tx(|| book.undo_realize(&event_id))
}

#[tauri::command]
pub fn report_realization(
    state: State<'_, AppState>,
    from: String,
    to: String,
) -> Res<RealizeReport> {
    let conn = state.db.lock().unwrap();
    let book = Book::new(&conn);
    book.report_realization(&from, &to)
}

#[tauri::command]
pub fn reverse(state: State<'_, AppState>, input: ReversalInput) -> Res<CreatedEvent> {
    let conn = state.db.lock().unwrap();
    let book = Book::new(&conn);
    book.tx(|| book.reverse(input))
}

#[tauri::command]
pub fn pay_obligation(
    state: State<'_, AppState>,
    obligation_id: String,
    amount: i64,
    date: String,
    note: Option<String>,
) -> Res<CreatedEvent> {
    let conn = state.db.lock().unwrap();
    let book = Book::new(&conn);
    book.tx(|| book.pay_obligation(&obligation_id, amount, &date, note.as_deref()))
}

#[tauri::command]
pub fn settle_obligation(
    state: State<'_, AppState>,
    obligation_id: String,
    new_amount: i64,
    date: String,
    note: Option<String>,
) -> Res<CreatedEvent> {
    let conn = state.db.lock().unwrap();
    let book = Book::new(&conn);
    book.tx(|| book.settle_obligation(&obligation_id, new_amount, &date, note.as_deref()))
}

#[tauri::command]
pub fn rollover_obligation(
    state: State<'_, AppState>,
    obligation_id: String,
    new_month: String,
    date: String,
    note: Option<String>,
) -> Res<CreatedEvent> {
    let conn = state.db.lock().unwrap();
    let book = Book::new(&conn);
    book.tx(|| book.rollover_obligation(&obligation_id, &new_month, &date, note.as_deref()))
}

#[tauri::command]
pub fn cancel_futures(
    state: State<'_, AppState>,
    order_event_id: String,
    reason_kind: String,
    refund: i64,
    date: String,
    note: Option<String>,
) -> Res<CreatedEvent> {
    let conn = state.db.lock().unwrap();
    let book = Book::new(&conn);
    book.tx(|| book.cancel_futures(&order_event_id, &reason_kind, refund, &date, note.as_deref()))
}

#[tauri::command]
pub fn freeze_obligation(
    state: State<'_, AppState>,
    obligation_id: String,
    frozen: bool,
    date: String,
    note: Option<String>,
) -> Res<CreatedEvent> {
    let conn = state.db.lock().unwrap();
    let book = Book::new(&conn);
    book.tx(|| book.freeze_obligation(&obligation_id, frozen, &date, note.as_deref()))
}

#[tauri::command]
pub fn list_obligations(
    state: State<'_, AppState>,
    include_done: Option<bool>,
    kind: Option<String>,
) -> Res<Vec<Obligation>> {
    let conn = state.db.lock().unwrap();
    Book::new(&conn).list_obligations(include_done.unwrap_or(false), kind.as_deref())
}

#[tauri::command]
pub fn create_account(state: State<'_, AppState>, input: AccountInput) -> Res<String> {
    let conn = state.db.lock().unwrap();
    let book = Book::new(&conn);
    book.tx(|| book.create_account(input))
}

#[tauri::command]
pub fn update_account(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    kind: Option<String>,
    note: Option<String>,
    sort: Option<i64>,
) -> Res<()> {
    let conn = state.db.lock().unwrap();
    let book = Book::new(&conn);
    book.tx(|| book.update_account(&id, name, kind, note, sort))
}

#[tauri::command]
pub fn set_account_archived(state: State<'_, AppState>, id: String, archived: bool) -> Res<()> {
    let conn = state.db.lock().unwrap();
    let book = Book::new(&conn);
    book.tx(|| book.set_archived(&id, archived))
}

#[tauri::command]
pub fn set_quota(
    state: State<'_, AppState>,
    account_id: String,
    month: String,
    amount: i64,
) -> Res<String> {
    let conn = state.db.lock().unwrap();
    let book = Book::new(&conn);
    book.tx(|| book.set_quota(&account_id, &month, amount))
}

#[tauri::command]
pub fn accounts(state: State<'_, AppState>, month: Option<String>) -> Res<Vec<AccountView>> {
    let conn = state.db.lock().unwrap();
    Book::new(&conn).accounts(month.as_deref().unwrap_or(&current_month()))
}

#[tauri::command]
pub fn tag_rules(
    state: State<'_, AppState>,
    account_id: Option<String>,
    month: Option<String>,
) -> Res<Vec<TagRuleView>> {
    let conn = state.db.lock().unwrap();
    Book::new(&conn).tag_rule_views(account_id.as_deref(), month.as_deref().unwrap_or(&current_month()))
}

#[tauri::command]
pub fn report_pnl(state: State<'_, AppState>, from: String, to: String) -> Res<PnlReport> {
    let conn = state.db.lock().unwrap();
    Book::new(&conn).report_pnl(&from, &to)
}

#[tauri::command]
pub fn report_cash(state: State<'_, AppState>, from: String, to: String) -> Res<CashReport> {
    let conn = state.db.lock().unwrap();
    Book::new(&conn).report_cash(&from, &to)
}

#[tauri::command]
pub fn report_budget(state: State<'_, AppState>, month: String) -> Res<Vec<BudgetRow>> {
    let conn = state.db.lock().unwrap();
    Book::new(&conn).report_budget(&month)
}

#[tauri::command]
pub fn report_forward(
    state: State<'_, AppState>,
    months: i64,
    from_month: Option<String>,
) -> Res<Vec<ForwardRow>> {
    let conn = state.db.lock().unwrap();
    Book::new(&conn).report_forward(months, from_month.as_deref())
}

#[tauri::command]
pub fn report_habit(
    state: State<'_, AppState>,
    months: i64,
    to_month: Option<String>,
) -> Res<HabitReport> {
    let conn = state.db.lock().unwrap();
    Book::new(&conn).report_habit(months, to_month.as_deref())
}

#[tauri::command]
pub fn report_capacity(state: State<'_, AppState>, month: Option<String>) -> Res<CapacityReport> {
    let conn = state.db.lock().unwrap();
    Book::new(&conn).report_capacity(month.as_deref())
}

#[tauri::command]
pub fn save_setting(state: State<'_, AppState>, key: String, value: String) -> Res<()> {
    let conn = state.db.lock().unwrap();
    db::set_setting(&conn, &key, &value)?;
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentResult {
    pub id: String,
    pub file_name: String,
    pub size: i64,
}

#[tauri::command]
pub fn add_attachment(
    state: State<'_, AppState>,
    event_id: String,
    source_path: String,
) -> Res<AttachmentResult> {
    let conn = state.db.lock().unwrap();
    let book = Book::new(&conn);
    book.event(&event_id)?;

    let src = std::path::Path::new(&source_path);
    let file_name = src
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .ok_or_else(|| AppError::validation("无法识别文件名"))?;
    let meta = std::fs::metadata(src)?;
    let max_mb: i64 = db::get_setting(&conn, "attachment_max_mb")?
        .and_then(|s| s.parse().ok())
        .unwrap_or(20);
    if meta.len() > (max_mb as u64) * 1024 * 1024 {
        return Err(AppError::validation(format!(
            "附件超过 {max_mb} MB 上限"
        )));
    }

    let dir = state.data_dir.join("attachments");
    std::fs::create_dir_all(&dir)?;
    let ext = src
        .extension()
        .map(|s| format!(".{}", s.to_string_lossy()))
        .unwrap_or_default();
    let stored_name = format!("{}{}", crate::engine::new_id(), ext);
    std::fs::copy(src, dir.join(&stored_name))?;

    let id = crate::engine::new_id();
    conn.execute(
        "INSERT INTO attachment(id,event_id,file_name,stored_name,mime,size,created_at) VALUES (?,?,?,?,?,?,?)",
        rusqlite::params![
            id,
            event_id,
            file_name,
            stored_name,
            mime_of(&file_name),
            meta.len() as i64,
            now_iso()
        ],
    )?;

    Ok(AttachmentResult {
        id,
        file_name,
        size: meta.len() as i64,
    })
}

fn mime_of(name: &str) -> &'static str {
    let lower = name.to_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".pdf") {
        "application/pdf"
    } else {
        "application/octet-stream"
    }
}

#[tauri::command]
pub fn open_attachment(state: State<'_, AppState>, stored_name: String) -> Res<()> {
    let path = state.data_dir.join("attachments").join(stored_name);
    if !path.exists() {
        return Err(AppError::not_found("附件文件不存在"));
    }
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(path.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| AppError::internal(format!("无法打开附件：{e}")))?;
    }
    Ok(())
}

#[tauri::command]
pub fn backup_database(state: State<'_, AppState>, dest: String) -> Res<String> {
    let conn = state.db.lock().unwrap();
    let dest_path = std::path::PathBuf::from(&dest);
    if let Some(parent) = dest_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let _ = std::fs::remove_file(&dest_path);
    conn.execute("VACUUM INTO ?1", [dest_path.to_string_lossy().to_string()])?;
    Ok(dest)
}
