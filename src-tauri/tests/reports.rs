use boxfuture_lib::db;
use boxfuture_lib::domain::*;
use boxfuture_lib::engine::write::*;
use boxfuture_lib::engine::Book;

fn setup() -> rusqlite::Connection {
    let conn = db::open_memory().unwrap();
    db::setup_defaults(&conn).unwrap();
    conn
}

fn spot_input(amount: i64, pool: Pool, title: &str) -> SpotInput {
    SpotInput {
        account_id: "acc_daily".into(),
        amount,
        pool,
        accrual_date: today(),
        budget_month: None,
        tag: None,
        title: Some(title.into()),
        reason: Some("理由".into()),
        urgency: Some("不急".into()),
        market_price: Some(amount),
        expected_effect: Some("够用".into()),
        usage_months: Some(12),
        necessity: Some("必要".into()),
        purpose: Some("目的".into()),
        vendor_id: None,
        currency: None,
        fx_rate: None,
        note: None,
    }
}

/// 构造一个包含收入、现货、期货、计提、结账的综合场景
fn demo_book() -> rusqlite::Connection {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();
    let next = month_add(&m, 1);

    book.tx(|| {
        book.create_income(IncomeInput {
            account_id: "acc_daily".into(),
            amount: 800_000,
            pool: Pool::Recurring,
            income_kind: "regular".into(),
            date: today(),
            title: Some("工资".into()),
            note: None,
        })
    })
    .unwrap();

    book.tx(|| book.create_spot(spot_input(12_000, Pool::Recurring, "午饭")))
        .unwrap();

    book.tx(|| {
        book.create_futures(FuturesInput {
            account_id: "acc_daily".into(),
            pool: Pool::OneOff,
            balance_account_id: None,
            balance_pool: None,
            total: Some(300_000),
            deposit: 100_000,
            accrual_date: today(),
            balance_month: next.clone(),
            tag: None,
            title: Some("手办".into()),
            vendor_id: None,
            vendor_name: Some("A 会社".into()),
            lines: None,
            currency: None,
            fx_rate: None,
            original_total: None,
            order_deadline: None,
            reason: Some("收藏".into()),
            urgency: Some("限定".into()),
            market_price: Some(300_000),
            expected_effect: Some("开心".into()),
            usage_months: Some(60),
            necessity: Some("想要".into()),
            purpose: Some("爱好".into()),
            note: None,
        })
    })
    .unwrap();

    book.tx(|| {
        book.create_accrual(AccrualInput {
            account_id: "acc_reserve".into(),
            amount: 60_000,
            pool: Pool::OneOff,
            accrual_date: today(),
            budget_month: Some(month_add(&m, 2)),
            title: Some("年费预估".into()),
            reason: None,
            note: None,
        })
    })
    .unwrap();

    conn
}

#[test]
fn reports_render_without_errors() {
    let conn = demo_book();
    let book = Book::new(&conn);
    let m = current_month();
    let from = month_add(&m, -3);
    let to = month_add(&m, 6);

    let pnl = book.report_pnl(&from, &to).unwrap();
    assert!(pnl.total_income >= 800_000, "pnl income {}", pnl.total_income);
    assert!(pnl.total_expense >= 312_000, "pnl expense {}", pnl.total_expense);
    assert_eq!(pnl.total_net, pnl.total_income - pnl.total_expense);
    assert!(pnl.months.iter().any(|x| x.month == m));

    let cash = book.report_cash(&from, &to).unwrap();
    assert!(cash.total_inflow >= 800_000);
    assert!(cash.total_outflow >= 112_000);
    assert!(!cash.by_account.is_empty());

    let budget = book.report_budget(&m).unwrap();
    assert_eq!(budget.len(), 3);
    assert!(budget.iter().any(|r| r.account_name == "日常卡" && r.recurring_used > 0));

    let forward = book.report_forward(12, None).unwrap();
    assert_eq!(forward.len(), 12);
    assert!(forward.iter().any(|f| f.total > 0));
    assert!(forward[0].month == m);

    let habit = book.report_habit(6, None).unwrap();
    assert_eq!(habit.order_count, 1);
    assert_eq!(habit.order_total, 300_000);
    assert!(habit.vendors.iter().any(|v| v.vendor_name == "A 会社"));

    let capacity = book.report_capacity(None).unwrap();
    assert!(capacity.obligatory_12m >= 260_000);
    assert_eq!(
        capacity.available,
        capacity.oneoff_total + capacity.recurring_total
            - capacity.obligatory_12m
            - capacity.cushion
    );
}

#[test]
fn close_then_reopen_restores_projection() {
    let conn = demo_book();
    let book = Book::new(&conn);
    let m = current_month();
    let before = book.oneoff_balance("acc_daily", &m).unwrap();

    let closed = book.tx(|| book.close_month(&m, false)).unwrap();
    assert!(book.is_closed(&m).unwrap());
    let after_close = book.oneoff_balance("acc_daily", &m).unwrap();
    assert_eq!(after_close, before + closed.items.iter().find(|i| i.account_id == "acc_daily").unwrap().amount);

    book.tx(|| book.reopen_month(&m)).unwrap();
    assert!(!book.is_closed(&m).unwrap());
    assert_eq!(book.oneoff_balance("acc_daily", &m).unwrap(), before);
}

#[test]
fn habit_counts_rollover_as_default() {
    let conn = demo_book();
    let book = Book::new(&conn);
    let ob = book.list_obligations(false, None).unwrap();
    let futures_ob = ob.into_iter().find(|o| o.kind == "futures_balance").unwrap();
    let new_month = month_add(&futures_ob.due_month, 2);
    book.tx(|| book.rollover_obligation(&futures_ob.id, &new_month, &today(), Some("延期")))
        .unwrap();

    let habit = book.report_habit(6, None).unwrap();
    assert!(habit.default_rate > 0.0);
    assert!(habit.avg_extension_days > 0.0);
}

#[test]
fn cancelled_order_is_counted_in_default_rate() {
    let conn = demo_book();
    let book = Book::new(&conn);
    let order = book
        .list_events(None, None, None, Some("futures_order"), None, 10, 0)
        .unwrap()
        .remove(0);
    book.tx(|| book.cancel_futures(&order.id, "vendor", 100_000, &today(), Some("商家违约")))
        .unwrap();

    let habit = book.report_habit(6, None).unwrap();
    assert_eq!(habit.order_count, 1);
    assert!((habit.default_rate - 1.0).abs() < f64::EPSILON);

    // 未付尾款锁定应被释放
    let budget = book.report_budget(&current_month()).unwrap();
    assert_eq!(budget.len(), 3);
}

#[test]
fn pnl_counts_recurring_quota_as_income() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();

    let pnl = book.report_pnl(&m, &m).unwrap();
    // 默认账户 acc_daily 规律额度 5000 元，应作为「规律预算」收入
    assert_eq!(pnl.total_income, 500_000, "income={}", pnl.total_income);
    let item = pnl.months[0]
        .items
        .iter()
        .find(|i| i.kind == "budget_receivable")
        .expect("缺少规律预算收入项");
    assert_eq!(item.amount, 500_000);
    // 没有支出时净额就是额度本身，不再是负数
    assert_eq!(pnl.months[0].net, 500_000);
}

#[test]
fn realize_counts_into_cash_flow_only() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();

    book.tx(|| {
        book.create_realize(RealizeInput {
            account_id: "acc_daily".into(),
            month: m.clone(),
            amount: 200_000,
            date: today(),
            note: None,
        })
    })
    .unwrap();

    // 兑现不改变可花额度
    assert_eq!(book.recurring_balance("acc_daily", &m).unwrap(), 500_000);
    assert_eq!(book.oneoff_balance("acc_daily", &m).unwrap(), 0);
    assert_eq!(book.realized_amount("acc_daily", &m).unwrap(), 200_000);

    // 现金流入
    let cash = book.report_cash(&m, &m).unwrap();
    assert_eq!(cash.total_inflow, 200_000);

    // 兑现比例
    let rep = book.report_realization(&m, &m).unwrap();
    assert_eq!(rep.total_quota, 500_000);
    assert_eq!(rep.total_realized, 200_000);
    assert!((rep.ratio - 0.4).abs() < 1e-9);
}

#[test]
fn realize_cannot_exceed_quota_and_can_be_undone() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();

    let first = book
        .tx(|| {
            book.create_realize(RealizeInput {
                account_id: "acc_daily".into(),
                month: m.clone(),
                amount: 300_000,
                date: today(),
                note: None,
            })
        })
        .unwrap();

    let err = book
        .tx(|| {
            book.create_realize(RealizeInput {
                account_id: "acc_daily".into(),
                month: m.clone(),
                amount: 300_000,
                date: today(),
                note: None,
            })
        })
        .unwrap_err();
    assert_eq!(err.code, "validation");

    // 补齐到额度上限可以
    book.tx(|| {
        book.create_realize(RealizeInput {
            account_id: "acc_daily".into(),
            month: m.clone(),
            amount: 200_000,
            date: today(),
            note: None,
        })
    })
    .unwrap();
    assert_eq!(book.realized_amount("acc_daily", &m).unwrap(), 500_000);

    // 撤回第一笔
    book.tx(|| book.undo_realize(&first.event_id)).unwrap();
    assert_eq!(book.realized_amount("acc_daily", &m).unwrap(), 200_000);
    let cash = book.report_cash(&m, &m).unwrap();
    // 撤回是一笔现金流出（原始的两笔兑现仍然是流入）
    assert_eq!(cash.total_inflow, 500_000);
    assert_eq!(cash.total_outflow, 300_000);
    assert_eq!(cash.months[0].net, 200_000);
    // 同一笔不能重复撤回
    assert!(book.tx(|| book.undo_realize(&first.event_id)).is_err());
}


#[test]
fn virtual_month_close_uses_realized_ratio_for_current_month() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();
    let next = month_add(&m, 1);

    // 兑现 3000 元（额度 5000）
    book.tx(|| {
        book.create_realize(RealizeInput {
            account_id: "acc_daily".into(),
            month: m.clone(),
            amount: 300_000,
            date: today(),
            note: None,
        })
    })
    .unwrap();

    // 当前月：只把已兑现的部分算作可结转（3000）
    assert_eq!(book.projected_carryover("acc_daily", &m).unwrap(), 300_000);
    // 未来月：按 100% 兑现，规律结余全额结转（5000）
    assert_eq!(book.projected_carryover("acc_daily", &next).unwrap(), 500_000);
    // 结算到下个月的一次性余额 = 当前月模拟结转 3000
    assert_eq!(book.projected_oneoff_balance("acc_daily", &next).unwrap(), 300_000);
}

#[test]
fn virtual_close_also_nets_out_spending() {
    let conn = setup();
    let book = Book::new(&conn);
    let m = current_month();

    // 花掉 1000，兑现 3000
    book.tx(|| book.create_spot(spot_input(100_000, Pool::Recurring, "花掉")))
        .unwrap();
    book.tx(|| {
        book.create_realize(RealizeInput {
            account_id: "acc_daily".into(),
            month: m.clone(),
            amount: 300_000,
            date: today(),
            note: None,
        })
    })
    .unwrap();

    // 规律结余 = 5000 - 1000 = 4000，其中欠兑现 2000 不计入结转
    assert_eq!(book.recurring_balance("acc_daily", &m).unwrap(), 400_000);
    assert_eq!(book.projected_carryover("acc_daily", &m).unwrap(), 200_000);
}
