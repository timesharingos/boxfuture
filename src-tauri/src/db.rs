use crate::domain::{AppError, Res};
use rusqlite::Connection;
use std::path::Path;

pub const SCHEMA_VERSION: i64 = 1;

pub fn open(path: &Path) -> Res<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    migrate(&conn)?;
    Ok(conn)
}

pub fn open_memory() -> Res<Connection> {
    let conn = Connection::open_in_memory()?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    migrate(&conn)?;
    Ok(conn)
}

pub fn migrate(conn: &Connection) -> Res<()> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version < 1 {
        conn.execute_batch("BEGIN;")?;
        let result = (|| -> Res<()> {
            conn.execute_batch(include_str!("../migrations/0001_init.sql"))?;
            seed(conn)?;
            conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;
            Ok(())
        })();
        match result {
            Ok(()) => conn.execute_batch("COMMIT;")?,
            Err(e) => {
                let _ = conn.execute_batch("ROLLBACK;");
                return Err(e);
            }
        }
    }
    Ok(())
}

fn seed(conn: &Connection) -> Res<()> {
    let now = crate::domain::now_iso();
    conn.execute(
        "INSERT OR REPLACE INTO currency(code,name,symbol,minor_unit,is_base) VALUES
         ('CNY','人民币','¥',2,1), ('JPY','日元','¥',0,0),
         ('USD','美元','$',2,0), ('EUR','欧元','€',2,0), ('GBP','英镑','£',2,0)",
        [],
    )?;

    // 消费分级（分 = 0.01 元）
    let rules: [(&str, &str, i64, Option<i64>, Option<i64>, Option<&str>, &str, i64); 5] = [
        ("essential", "刚需", 0, Some(5000), None, None, "title", 1),
        ("small", "小额", 5000, Some(15000), Some(30), Some("medium"), "title", 2),
        (
            "medium",
            "中等",
            15000,
            Some(50000),
            None,
            None,
            "reason,urgency,market_price",
            3,
        ),
        (
            "large",
            "大额",
            50000,
            Some(150000),
            None,
            None,
            "expected_effect,usage_months",
            4,
        ),
        (
            "equipment",
            "设备",
            150000,
            None,
            None,
            None,
            "necessity,purpose,usage_months",
            5,
        ),
    ];
    for (tag, label, min, max, limit, upgrade, required, sort) in rules {
        conn.execute(
            "INSERT OR REPLACE INTO tag_rule(tag,label,min_amount,max_amount,monthly_limit,upgrade_to,required_fields,sort)
             VALUES (?,?,?,?,?,?,?,?)",
            rusqlite::params![tag, label, min, max, limit, upgrade, required, sort],
        )?;
    }

    for (k, v) in [
        ("base_currency", "CNY"),
        ("safety_cushion", "0"),
        ("forecast_months", "12"),
        ("attachment_max_mb", "20"),
        ("initialized", "0"),
    ] {
        conn.execute(
            "INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)",
            rusqlite::params![k, v],
        )?;
    }
    let _ = now;
    Ok(())
}

/// 首次运行时创建默认账户（仅一次）。
pub fn setup_defaults(conn: &Connection) -> Res<()> {
    let initialized: String =
        conn.query_row("SELECT value FROM settings WHERE key='initialized'", [], |r| {
            r.get(0)
        })?;
    if initialized == "1" {
        return Ok(());
    }
    let now = crate::domain::now_iso();
    let month = crate::domain::current_month();
    let defaults = [
        ("acc_daily", "日常卡", "bank", 500_000i64, 1),
        ("acc_reserve", "储备卡", "reserve", 0, 2),
        ("acc_invest", "投资账户", "investment", 0, 3),
    ];
    for (id, name, kind, quota, sort) in defaults {
        conn.execute(
            "INSERT OR IGNORE INTO account(id,name,kind,currency,sort,archived,created_at)
             VALUES (?,?,?,'CNY',?,0,?)",
            rusqlite::params![id, name, kind, sort, now],
        )?;
        conn.execute(
            "INSERT OR IGNORE INTO account_quota(account_id,month,amount,created_at) VALUES (?,?,?,?)",
            rusqlite::params![id, month, quota, now],
        )?;
    }
    conn.execute(
        "UPDATE settings SET value='1' WHERE key='initialized'",
        [],
    )?;
    Ok(())
}

pub fn get_setting(conn: &Connection, key: &str) -> Res<Option<String>> {
    let v = conn
        .query_row("SELECT value FROM settings WHERE key=?", [key], |r| r.get::<_, String>(0))
        .ok();
    Ok(v)
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Res<()> {
    conn.execute(
        "INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [key, value],
    )?;
    Ok(())
}

pub fn require_setting(conn: &Connection, key: &str) -> Res<String> {
    get_setting(conn, key)?.ok_or_else(|| AppError::internal(format!("缺少配置项 {key}")))
}

pub fn base_currency(conn: &Connection) -> Res<String> {
    Ok(get_setting(conn, "base_currency")?.unwrap_or_else(|| "CNY".into()))
}
