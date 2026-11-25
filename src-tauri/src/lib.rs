pub mod commands;
pub mod db;
pub mod domain;
pub mod engine;
pub mod reports;

use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub db_path: std::path::PathBuf,
    pub data_dir: std::path::PathBuf,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // 数据目录：BOXFUTURE_DATA_DIR（便携模式）优先，否则用系统 AppData
            let dir = match std::env::var("BOXFUTURE_DATA_DIR") {
                Ok(v) if !v.trim().is_empty() => std::path::PathBuf::from(v.trim()),
                _ => app
                    .path()
                    .data_dir()
                    .map_err(|e| -> Box<dyn std::error::Error> { Box::new(e) })?
                    .join("boxfuture"),
            };
            std::fs::create_dir_all(&dir)?;
            std::fs::create_dir_all(dir.join("attachments"))?;
            let db_path = dir.join("boxfuture.db");
            let conn = db::open(&db_path)?;
            db::setup_defaults(&conn)?;

            app.manage(AppState {
                db: Mutex::new(conn),
                db_path,
                data_dir: dir,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::refresh_periods,
            commands::close_month,
            commands::reopen_month,
            commands::list_events,
            commands::event_detail,
            commands::quota_grants,
            commands::quota_history,
            commands::create_spot,
            commands::create_futures,
            commands::create_accrual,
            commands::settle_accrual,
            commands::create_transfer,
            commands::create_income,
            commands::create_opening,
            commands::reverse,
            commands::pay_obligation,
            commands::settle_obligation,
            commands::rollover_obligation,
            commands::cancel_futures,
            commands::freeze_obligation,
            commands::list_obligations,
            commands::create_account,
            commands::update_account,
            commands::set_account_archived,
            commands::set_quota,
            commands::accounts,
            commands::tag_rules,
            commands::report_pnl,
            commands::report_cash,
            commands::report_budget,
            commands::report_forward,
            commands::report_habit,
            commands::report_capacity,
            commands::save_setting,
            commands::add_attachment,
            commands::open_attachment,
            commands::backup_database,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
