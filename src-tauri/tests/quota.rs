use boxfuture_lib::db;
use boxfuture_lib::domain::*;
use boxfuture_lib::engine::write::*;
use boxfuture_lib::engine::Book;

fn setup() -> rusqlite::Connection {
    let conn = db::open_memory().unwrap();
    db::setup_defaults(&conn).unwrap();
    conn
}

#[test]
fn quota_change_starts_next_month() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();
    let next = month_add(&m, 1);
    let after = month_add(&m, 2);

    let effective = book.tx(|| book.set_quota("acc_daily", &m, 800_000)).unwrap();
    assert_eq!(effective, next, "修改应从下个月起生效");

    // 当月额度不变，次月生效
    assert_eq!(book.quota_at("acc_daily", &m).unwrap(), 500_000);
    assert_eq!(book.quota_at("acc_daily", &next).unwrap(), 800_000);
    assert_eq!(book.quota_at("acc_daily", &after).unwrap(), 800_000);
}

#[test]
fn later_quota_edit_overrides_same_month() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();

    book.tx(|| book.set_quota("acc_daily", &m, 600_000)).unwrap();
    book.tx(|| book.set_quota("acc_daily", &m, 900_000)).unwrap();

    let next = month_add(&m, 1);
    assert_eq!(book.quota_at("acc_daily", &next).unwrap(), 900_000);
}

#[test]
fn quota_edit_for_next_month_does_not_touch_target_month() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();
    let next = month_add(&m, 1);
    let after = month_add(&m, 2);

    // 先设定次月额度
    book.tx(|| book.set_quota("acc_daily", &m, 700_000)).unwrap();
    // 再针对次月修改 → 生效月是下下月
    book.tx(|| book.set_quota("acc_daily", &next, 1_000_000)).unwrap();

    assert_eq!(book.quota_at("acc_daily", &next).unwrap(), 700_000);
    assert_eq!(book.quota_at("acc_daily", &after).unwrap(), 1_000_000);
}

#[test]
fn new_account_can_seed_both_pools() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();

    let id = book
        .tx(|| {
            book.create_account(AccountInput {
                name: "测试卡".into(),
                kind: Some("bank".into()),
                currency: None,
                sort: Some(10),
                note: None,
                initial_quota: Some(300_000),
                initial_oneoff: Some(1_234_500),
                initial_month: Some(m.clone()),
            })
        })
        .unwrap();

    assert_eq!(book.quota_at(&id, &m).unwrap(), 300_000);
    assert_eq!(book.oneoff_balance(&id, &m).unwrap(), 1_234_500);
    assert_eq!(book.recurring_balance(&id, &m).unwrap(), 300_000);
    assert_eq!(book.oneoff_balance(&id, &month_add(&m, 1)).unwrap(), 1_234_500);
}

#[test]
fn new_account_with_negative_oneoff() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();

    let id = book
        .tx(|| {
            book.create_account(AccountInput {
                name: "欠款卡".into(),
                kind: Some("credit".into()),
                currency: None,
                sort: None,
                note: None,
                initial_quota: None,
                initial_oneoff: Some(-250_000),
                initial_month: Some(m.clone()),
            })
        })
        .unwrap();

    assert_eq!(book.oneoff_balance(&id, &m).unwrap(), -250_000);
}

#[test]
fn reports_can_be_settled_to_any_month() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();
    let target = month_add(&m, 2);

    // 未来月的计提义务
    book.tx(|| {
        book.create_accrual(AccrualInput {
            account_id: "acc_daily".into(),
            amount: 100_000,
            pool: Pool::OneOff,
            accrual_date: today(),
            budget_month: Some(target.clone()),
            title: Some("未来义务".into()),
            reason: None,
            note: None,
        })
    })
    .unwrap();

    // 以当前月结算：义务在统计范围内
    let cap_now = book.report_capacity(None).unwrap();
    assert!(cap_now.obligatory_12m >= 100_000);

    // 以义务之后的月份结算：该义务已不在未来 12 个月内
    let after = month_add(&target, 13);
    let cap_later = book.report_capacity(Some(&after)).unwrap();
    assert_eq!(cap_later.obligatory_12m, 0);

    // 平摊表从指定月开始
    let rows = book.report_forward(6, Some(&target)).unwrap();
    assert_eq!(rows[0].month, target);
    assert!(rows[0].total >= 100_000);
}

fn spot_input(amount: i64, pool: Pool) -> SpotInput {
    SpotInput {
        account_id: "acc_daily".into(),
        amount,
        pool,
        accrual_date: today(),
        budget_month: None,
        tag: None,
        title: Some("测试".into()),
        reason: Some("测试".into()),
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
fn projected_oneoff_simulates_month_close() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();
    let target = month_add(&m, 2);

    // 当前月花掉 1000 元，规律结余 4000
    book.tx(|| book.create_spot(spot_input(100_000, Pool::Recurring)))
        .unwrap();

    // 实际（未模拟结转）的一次性余额仍为 0
    assert_eq!(book.oneoff_balance("acc_daily", &target).unwrap(), 0);

    // 投影：当月结余 4000 + 次月 5000 = 9000 元
    assert_eq!(
        book.projected_oneoff_balance("acc_daily", &target).unwrap(),
        900_000
    );

    // accounts() 展示口径与投影一致
    let view = book
        .accounts(&target)
        .unwrap()
        .into_iter()
        .find(|a| a.id == "acc_daily")
        .unwrap();
    assert_eq!(view.oneoff_balance, 900_000);
    assert_eq!(view.recurring_balance, 500_000);
}

#[test]
fn projected_oneoff_does_not_double_count_closed_months() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();
    let target = month_add(&m, 1);

    book.tx(|| book.close_month(&m, false)).unwrap();

    let projected = book.projected_oneoff_balance("acc_daily", &target).unwrap();
    let actual = book.oneoff_balance("acc_daily", &target).unwrap();
    assert_eq!(projected, actual, "已结账月份不应重复结转");
    assert_eq!(actual, 500_000);
}

#[test]
fn projected_oneoff_matches_actual_for_past_month() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();

    // 当月未结账：选择当月本身时不含自身结转
    assert_eq!(book.projected_oneoff_balance("acc_daily", &m).unwrap(), 0);
}

#[test]
fn quota_grants_are_display_only() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();
    let target = month_add(&m, 2);

    let grants = book.quota_grants(&m, &target).unwrap();
    // 3 个月 × 只有日常卡额度非 0
    assert_eq!(grants.len(), 3);
    assert!(grants.iter().all(|g| g.account_name == "日常卡" && g.amount == 500_000));
    assert!(grants.iter().any(|g| g.is_future), "未来月份应标记为预计");
    assert!(grants.iter().any(|g| !g.is_future));

    // 虚拟行不落库：账本里没有任何事件
    assert_eq!(book.list_events(None, None, None, None, None, 50, 0).unwrap().len(), 0);
}

#[test]
fn quota_history_records_effective_months() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();

    book.tx(|| book.set_quota("acc_daily", &m, 800_000)).unwrap();
    book.tx(|| book.set_quota("acc_daily", &m, 950_000)).unwrap();

    let history = book.quota_history("acc_daily").unwrap();
    assert!(history.len() >= 2);
    let last = history.last().unwrap();
    assert_eq!(last.month, month_add(&m, 1));
    assert_eq!(last.amount, 950_000, "同一生效月份后改的覆盖前一次");
}

#[test]
fn futures_can_split_accounts_and_pools() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();
    let next = month_add(&m, 1);

    let created = book
        .tx(|| {
            book.create_futures(FuturesInput {
                account_id: "acc_daily".into(),
                pool: Pool::Recurring,
                balance_account_id: Some("acc_reserve".into()),
                balance_pool: Some(Pool::OneOff),
                total: Some(100_000),
                deposit: 20_000,
                accrual_date: today(),
                balance_month: next.clone(),
                tag: None,
                title: Some("分账户期货".into()),
                vendor_id: None,
                vendor_name: None,
                lines: None,
                currency: None,
                fx_rate: None,
                original_total: None,
                order_deadline: None,
                reason: Some("理由".into()),
                urgency: Some("不急".into()),
                market_price: Some(100_000),
                expected_effect: Some("够用".into()),
                usage_months: Some(12),
                necessity: Some("必要".into()),
                purpose: Some("测试".into()),
                note: None,
            })
        })
        .unwrap();

    // 定金从日常卡规律预算扣（5000 - 200）
    assert_eq!(book.recurring_balance("acc_daily", &m).unwrap(), 480_000);
    // 尾款锁在储备卡的一次性池（800 元）
    assert_eq!(book.oneoff_balance("acc_reserve", &next).unwrap(), -80_000);
    // 定金账户的一次性池不受影响
    assert_eq!(book.oneoff_balance("acc_daily", &next).unwrap(), 0);

    // 义务记在尾款账户 + 尾款池上
    let ob = book.list_obligations(false, None).unwrap().remove(0);
    assert_eq!(ob.account_id, "acc_reserve");
    assert_eq!(ob.pool.as_deref(), Some("oneoff"));

    // 支付尾款：现金记在储备卡
    book.tx(|| book.pay_obligation(&ob.id, 80_000, &today(), None)).unwrap();
    let cash = book.report_cash(&m, &next).unwrap();
    let reserve = cash
        .by_account
        .iter()
        .find(|a| a.account_id == "acc_reserve")
        .unwrap();
    assert_eq!(reserve.outflow, 80_000);

    let _ = created;
}

#[test]
fn cancelling_split_order_releases_balance_account() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();
    let next = month_add(&m, 1);

    let created = book
        .tx(|| {
            book.create_futures(FuturesInput {
                account_id: "acc_daily".into(),
                pool: Pool::Recurring,
                balance_account_id: Some("acc_reserve".into()),
                balance_pool: Some(Pool::Recurring),
                total: Some(100_000),
                deposit: 0,
                accrual_date: today(),
                balance_month: next.clone(),
                tag: None,
                title: Some("取消测试".into()),
                vendor_id: None,
                vendor_name: None,
                lines: None,
                currency: None,
                fx_rate: None,
                original_total: None,
                order_deadline: None,
                reason: None,
                urgency: None,
                market_price: Some(100_000),
                expected_effect: Some("够用".into()),
                usage_months: Some(12),
                necessity: Some("必要".into()),
                purpose: Some("测试".into()),
                note: None,
            })
        })
        .unwrap();

    assert_eq!(book.recurring_balance("acc_reserve", &next).unwrap(), -100_000);
    book.tx(|| book.cancel_futures(&created.event_id, "self", 0, &today(), None))
        .unwrap();
    // 锁回储备卡规律预算
    assert_eq!(book.recurring_balance("acc_reserve", &next).unwrap(), 0);
}
