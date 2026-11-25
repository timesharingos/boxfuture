use boxfuture_lib::db;
use boxfuture_lib::domain::*;
use boxfuture_lib::engine::write::*;
use boxfuture_lib::engine::Book;
use rusqlite::Connection;

fn setup() -> Connection {
    let conn = db::open_memory().unwrap();
    db::setup_defaults(&conn).unwrap();
    conn
}

fn spot(amount: i64, pool: Pool, month: Option<String>) -> SpotInput {
    SpotInput {
        account_id: "acc_daily".into(),
        amount,
        pool,
        accrual_date: today(),
        budget_month: month,
        tag: None,
        title: Some("测试项目".into()),
        reason: Some("测试理由".into()),
        urgency: Some("不急".into()),
        market_price: Some(amount),
        expected_effect: Some("够用".into()),
        usage_months: Some(12),
        necessity: Some("必要".into()),
        purpose: Some("测试".into()),
        vendor_id: None,
        currency: None,
        fx_rate: None,
        note: None,
    }
}

#[test]
fn spot_posts_budget_and_counter() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();
    let before = book.recurring_balance("acc_daily", &m).unwrap();
    let created = book.tx(|| book.create_spot(spot(10_000, Pool::Recurring, None))).unwrap();
    assert_eq!(created.tag.as_deref(), Some("small"));
    assert_eq!(book.recurring_balance("acc_daily", &m).unwrap(), before - 10_000);
    assert_eq!(book.counter_used("acc_daily", "small", &m).unwrap(), 1);
}

#[test]
fn spot_requires_tag_fields() {
    let conn = setup();
    let book = Book::new(&conn);
    let mut input = spot(400_000, Pool::OneOff, None); // 4000 元 → 设备
    input.necessity = None;
    let err = book.tx(|| book.create_spot(input)).unwrap_err();
    assert_eq!(err.code, "validation");
    assert!(err.message.contains("采购必要性"), "{}", err.message);
}

#[test]
fn small_limit_upgrades_to_medium() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();
    for _ in 0..30 {
        book.tx(|| book.create_spot(spot(6_000, Pool::OneOff, None))).unwrap();
    }
    assert_eq!(book.counter_used("acc_daily", "small", &m).unwrap(), 30);

    // 第 31 笔会自动升级为中等，必须补填中等字段
    let mut input = spot(6_000, Pool::OneOff, None);
    input.reason = None;
    assert!(book.tx(|| book.create_spot(input)).is_err());

    let created = book
        .tx(|| book.create_spot(spot(6_000, Pool::OneOff, None)))
        .unwrap();
    assert_eq!(created.tag.as_deref(), Some("medium"));
    assert!(created.tag_upgraded);
}

#[test]
fn futures_lock_balance_month() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();
    let next = month_add(&m, 1);

    let input = FuturesInput {
        account_id: "acc_daily".into(),
        pool: Pool::OneOff,
        balance_account_id: None,
        balance_pool: None,
        total: Some(200_000),
        deposit: 50_000,
        accrual_date: today(),
        balance_month: next.clone(),
        tag: None,
        title: Some("限定手办".into()),
        vendor_id: None,
        vendor_name: Some("测试会社".into()),
        lines: None,
        currency: None,
        fx_rate: None,
        original_total: None,
        order_deadline: None,
        reason: Some("收藏".into()),
        urgency: Some("限定".into()),
        market_price: Some(200_000),
        expected_effect: Some("摆设".into()),
        usage_months: Some(60),
        necessity: Some("想要".into()),
        purpose: Some("收藏".into()),
        note: None,
    };
    let oneoff_before = book.oneoff_balance("acc_daily", &m).unwrap();
    let created = book.tx(|| book.create_futures(input)).unwrap();
    assert_eq!(created.tag.as_deref(), Some("equipment"));

    // 定金记在当前月，尾款锁到未来月
    assert_eq!(book.oneoff_balance("acc_daily", &m).unwrap(), oneoff_before - 50_000);
    assert_eq!(book.oneoff_balance("acc_daily", &next).unwrap(), oneoff_before - 200_000);

    let obs = book.list_obligations(false, None).unwrap();
    assert_eq!(obs.len(), 1);
    assert_eq!(obs[0].amount, 150_000);
    assert_eq!(obs[0].due_month, next);
}

#[test]
fn closing_carries_recurring_into_oneoff() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();
    book.tx(|| book.create_spot(spot(10_000, Pool::Recurring, None))).unwrap();
    let remaining = book.recurring_balance("acc_daily", &m).unwrap();
    let oneoff_before = book.oneoff_balance("acc_daily", &m).unwrap();

    let closed = book.tx(|| book.close_month(&m, false)).unwrap();
    assert_eq!(closed.total, remaining);
    assert_eq!(book.oneoff_balance("acc_daily", &m).unwrap(), oneoff_before + remaining);
    assert!(book.is_closed(&m).unwrap());

    // 已结账月份不能直接补录
    assert!(book.tx(|| book.create_spot(spot(1_000, Pool::Recurring, None))).is_err());
}

#[test]
fn reversal_refunds_to_oneoff_and_restores_counter() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();
    let created = book.tx(|| book.create_spot(spot(10_000, Pool::Recurring, None))).unwrap();
    let oneoff_before = book.oneoff_balance("acc_daily", &m).unwrap();

    book.tx(|| {
        book.reverse(ReversalInput {
            event_id: created.event_id.clone(),
            amount: 10_000,
            date: today(),
            reason: Some("退货".into()),
            refund_amount: Some(10_000),
            title: Some("测试项目".into()),
        })
    })
    .unwrap();

    assert_eq!(book.oneoff_balance("acc_daily", &m).unwrap(), oneoff_before + 10_000);
    assert_eq!(book.counter_used("acc_daily", "small", &m).unwrap(), 0);
    assert_eq!(book.event(&created.event_id).unwrap().status, "reversed");
}

#[test]
fn reversal_over_amount_becomes_new_expense() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();
    let created = book.tx(|| book.create_spot(spot(10_000, Pool::Recurring, None))).unwrap();
    let oneoff_before = book.oneoff_balance("acc_daily", &m).unwrap();

    book.tx(|| {
        book.reverse(ReversalInput {
            event_id: created.event_id.clone(),
            amount: 15_000,
            date: today(),
            reason: None,
            refund_amount: Some(15_000),
            title: Some("测试项目".into()),
        })
    })
    .unwrap();

    // +10000 退款进一次性，超出 5000 作为新支出先扣一次性
    assert_eq!(book.oneoff_balance("acc_daily", &m).unwrap(), oneoff_before + 5_000);
    let all = book
        .list_events(None, None, None, Some("spot"), None, 50, 0)
        .unwrap();
    assert_eq!(all.len(), 2);
}

#[test]
fn transfer_cannot_move_oneoff_back_to_recurring() {
    let conn = setup();
    let book = Book::new(&conn);
    let err = book
        .tx(|| {
            book.create_transfer(TransferInput {
                from_account_id: "acc_daily".into(),
                to_account_id: "acc_reserve".into(),
                amount: 1_000,
                from_pool: Pool::OneOff,
                to_pool: Pool::Recurring,
                date: today(),
                note: None,
            })
        })
        .unwrap_err();
    assert_eq!(err.code, "validation");
    assert!(err.message.contains("不可转回"));
}

#[test]
fn accrual_settlement_releases_and_creates_spot() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();
    let created = book
        .tx(|| {
            book.create_accrual(AccrualInput {
                account_id: "acc_daily".into(),
                amount: 50_000,
                pool: Pool::OneOff,
                accrual_date: today(),
                budget_month: Some(m.clone()),
                title: Some("预估运费".into()),
                reason: None,
                note: None,
            })
        })
        .unwrap();

    let ob = book.list_obligations(false, None).unwrap();
    assert_eq!(ob.len(), 1);
    let oneoff_after_accrual = book.oneoff_balance("acc_daily", &m).unwrap();

    let mut input = spot(60_000, Pool::OneOff, Some(m.clone()));
    input.tag = None;
    book.tx(|| book.settle_accrual(input, &ob[0].id)).unwrap();

    // 释放 50000，再实际支出 60000 → 净 -10000
    assert_eq!(
        book.oneoff_balance("acc_daily", &m).unwrap(),
        oneoff_after_accrual + 50_000 - 60_000
    );
    assert_eq!(book.obligation(&ob[0].id).unwrap().status, "settled");
    let _ = created;

    // 核销生成的真实现货交易占用了计数器（600 元 → 大额）
    assert!(book.counter_used("acc_daily", "large", &m).unwrap() >= 1);
}

#[test]
fn obligation_rollover_moves_locked_budget() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();
    let m2 = month_add(&m, 1);
    let m3 = month_add(&m, 2);

    book.tx(|| {
        book.create_accrual(AccrualInput {
            account_id: "acc_daily".into(),
            amount: 30_000,
            pool: Pool::Recurring,
            accrual_date: today(),
            budget_month: Some(m2.clone()),
            title: Some("预估".into()),
            reason: None,
            note: None,
        })
    })
    .unwrap();
    let ob = book.list_obligations(false, None).unwrap().remove(0);

    book.tx(|| book.rollover_obligation(&ob.id, &m3, &today(), Some("商家延期")))
        .unwrap();

    assert_eq!(book.obligation(&ob.id).unwrap().due_month, m3);
    assert_eq!(book.recurring_balance("acc_daily", &m2).unwrap(), book.quota_at("acc_daily", &m2).unwrap());
}

#[test]
fn capacity_counts_obligations() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();
    book.tx(|| {
        book.create_accrual(AccrualInput {
            account_id: "acc_daily".into(),
            amount: 120_000,
            pool: Pool::OneOff,
            accrual_date: today(),
            budget_month: Some(month_add(&m, 2)),
            title: Some("未来义务".into()),
            reason: None,
            note: None,
        })
    })
    .unwrap();
    let cap = book.report_capacity(None).unwrap();
    assert!(cap.obligatory_12m >= 120_000);
    assert_eq!(
        cap.available,
        cap.oneoff_total + cap.recurring_total - cap.obligatory_12m - cap.cushion
    );
}

#[test]
fn income_oneoff_must_use_oneoff_pool() {
    let conn = setup();
    let book = Book::new(&conn);
    let err = book
        .tx(|| {
            book.create_income(IncomeInput {
                account_id: "acc_daily".into(),
                amount: 100_000,
                pool: Pool::Recurring,
                income_kind: "oneoff".into(),
                date: today(),
                title: Some("奖金".into()),
                note: None,
            })
        })
        .unwrap_err();
    assert_eq!(err.code, "validation");
}
