use serde::{Deserialize, Serialize};

pub type Res<T> = std::result::Result<T, AppError>;

/// 统一错误类型：前端可直接读取 code / message 展示。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    pub message: String,
}

impl AppError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
    pub fn validation(m: impl Into<String>) -> Self {
        Self::new("validation", m)
    }
    pub fn not_found(m: impl Into<String>) -> Self {
        Self::new("not_found", m)
    }
    pub fn conflict(m: impl Into<String>) -> Self {
        Self::new("conflict", m)
    }
    pub fn internal(m: impl Into<String>) -> Self {
        Self::new("internal", m)
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl std::error::Error for AppError {}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        Self::new("db", e.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        Self::new("json", e.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        Self::new("io", e.to_string())
    }
}

// ---------------------------------------------------------------------------
// 预算池
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Pool {
    #[serde(rename = "recurring")]
    Recurring,
    #[serde(rename = "oneoff")]
    OneOff,
}

impl Pool {
    pub fn as_str(&self) -> &'static str {
        match self {
            Pool::Recurring => "recurring",
            Pool::OneOff => "oneoff",
        }
    }
    pub fn parse(s: &str) -> Option<Pool> {
        match s {
            "recurring" => Some(Pool::Recurring),
            "oneoff" => Some(Pool::OneOff),
            _ => None,
        }
    }
    pub fn label(&self) -> &'static str {
        match self {
            Pool::Recurring => "规律预算",
            Pool::OneOff => "一次性预算",
        }
    }
}

// ---------------------------------------------------------------------------
// 月份与日期工具
// ---------------------------------------------------------------------------

/// "YYYY-MM"
pub fn month_of(date: &str) -> String {
    if date.len() >= 7 {
        date[..7].to_string()
    } else {
        date.to_string()
    }
}

pub fn current_month() -> String {
    chrono::Local::now().format("%Y-%m").to_string()
}

pub fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

pub fn now_iso() -> String {
    chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

fn parse_month(m: &str) -> (i32, u32) {
    let mut it = m.split('-');
    let y = it.next().and_then(|v| v.parse::<i32>().ok()).unwrap_or(2000);
    let mo = it.next().and_then(|v| v.parse::<u32>().ok()).unwrap_or(1);
    (y, mo.clamp(1, 12))
}

fn fmt_month(y: i32, m: u32) -> String {
    let (y, m) = if m == 0 {
        (y - 1, 12)
    } else if m > 12 {
        (y + 1, 1)
    } else {
        (y, m)
    };
    format!("{:04}-{:02}", y, m)
}

pub fn month_add(month: &str, delta: i32) -> String {
    let (y, m) = parse_month(month);
    let total = y * 12 + (m as i32 - 1) + delta;
    let ny = total.div_euclid(12);
    let nm = (total.rem_euclid(12) + 1) as u32;
    fmt_month(ny, nm)
}

pub fn month_diff(a: &str, b: &str) -> i32 {
    let (ay, am) = parse_month(a);
    let (by, bm) = parse_month(b);
    (ay * 12 + am as i32) - (by * 12 + bm as i32)
}

pub fn month_start(month: &str) -> String {
    format!("{}-01", month)
}

pub fn month_end(month: &str) -> String {
    let next = month_add(month, 1);
    let d = chrono::NaiveDate::parse_from_str(&month_start(&next), "%Y-%m-%d")
        .unwrap_or_else(|_| chrono::Local::now().date_naive());
    (d - chrono::Duration::days(1)).format("%Y-%m-%d").to_string()
}

pub fn month_range(from: &str, to: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = from.to_string();
    while cur <= to.to_string() {
        out.push(cur.clone());
        cur = month_add(&cur, 1);
    }
    out
}

pub fn days_between(a: &str, b: &str) -> i64 {
    let da = chrono::NaiveDate::parse_from_str(a, "%Y-%m-%d").ok();
    let db = chrono::NaiveDate::parse_from_str(b, "%Y-%m-%d").ok();
    match (da, db) {
        (Some(x), Some(y)) => y.signed_duration_since(x).num_days(),
        _ => 0,
    }
}
