import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "zh" | "en";

const STORAGE_KEY = "boxfuture.lang";

/** 中文原文 → 英文。用中文原文当 key，省去全站造 key 的成本。 */
const EN: Record<string, string> = {
  // 通用
  "关闭": "Close",
  "取消": "Cancel",
  "保存": "Save",
  "创建": "Create",
  "删除": "Delete",
  "编辑": "Edit",
  "刷新": "Refresh",
  "加载中…": "Loading…",
  "读取中": "Loading…",
  "操作": "Actions",
  "备注": "Note",
  "账户": "Account",
  "类型": "Type",
  "金额": "Amount",
  "状态": "Status",
  "月份": "Month",
  "日期": "Date",
  "项目": "Item",
  "供应商": "Vendor",
  "池": "Pool",
  "分级": "Level",
  "预算月": "Budget month",
  "规律": "Recurring",
  "一次性": "One-off",
  "—": "—",
  "规律预算": "Recurring",
  "一次性预算": "One-off",
  "全部": "All",

  // 导航
  "仪表盘": "Dashboard",
  "记一笔": "New Entry",
  "账本": "Ledger",
  "预算": "Budget",
  "未来义务": "Obligations",
  "账户管理": "Accounts",
  "报表": "Reports",
  "设置": "Settings",
  "权责发生制记账": "Accrual-based ledger",
  "已刷新": "Refreshed",
  "本月已结账": "This month is closed",
  "{{m}} 已结账": "{{m}} is closed",
  "{{m}} 规律总额": "{{m}} recurring total",
  "已自动结账": "Auto-closed periods",
  "{{m}}：规律结余结转至一次性预算 合计 {{x}}":
    "{{m}}: recurring surplus carried to one-off, total {{x}}",
  "初始化失败：": "Failed to initialize: ",

  // 仪表盘
  "{{m}} 规律可用": "{{m}} recurring available",
  "{{n}} 个逻辑账户": "{{n}} accounts",
  "一次性余额": "One-off balance",
  "结算至 {{m}} · 含未结账月份的预计结转":
    "Settled to {{m}} · includes projected carry-over of open months",
  "结算至 {{m}} · 未结账月份按模拟月结（当前月按已兑现比例）":
    "Settled to {{m}} · open months use simulated close (current month at its realized ratio)",
  "未来 12 月刚性义务": "Fixed obligations (next 12 months)",
  "含尾款与计提 {{n}} 笔": "{{n}} unpaid balances & accruals",
  "超前消费能力": "Spending headroom",
  "可支配 {{a}} − 义务 − 安全垫 {{b}}": "Available {{a}} − obligations − cushion {{b}}",
  "账户预算": "Account budgets",
  "查看预算 →": "View budget →",
  "已用 {{a}} / {{b}}": "Used {{a}} / {{b}}",
  "还没有账户": "No accounts yet",
  "到「账户」页添加一个逻辑账户": "Add one on the Accounts page",
  "未来 12 月资金需求": "Cash needed in the next 12 months",
  "明细 →": "Details →",
  "暂无未来义务": "No future obligations",
  "待付义务": "Unpaid obligations",
  "全部 →": "All →",
  "到期月": "Due month",
  "未付": "Unpaid",
  "没有待付义务": "No unpaid obligations",
  "期货尾款与计提会出现在这里": "Futures balances and accruals appear here",

  // 账本
  "起始月": "From month",
  "结束月": "To month",
  "全部类型": "All types",
  "全部账户": "All accounts",
  "搜索": "Search",
  "项目 / 备注 / 理由": "Item / note / reason",
  "{{n}} 条（最多 400）": "{{n}} rows (max 400)",
  "没有交易记录": "No transactions",
  "从「记一笔」开始": "Start with “New Entry”",
  "现货": "Spot",
  "期货订单": "Futures order",
  "尾款支付": "Balance payment",
  "尾款核销": "Balance settlement",
  "展期": "Roll over",
  "取消订单": "Cancel order",
  "计提": "Accrual",
  "计提核销": "Accrual settlement",
  "收入": "Income",
  "转账": "Transfer",
  "冲销": "Reversal",
  "期初": "Opening",
  "预算注入": "Budget injection",
  "月结": "Month close",
  "规律预算注入": "Recurring budget injection",
  "预计": "projected",
  "虚拟": "virtual",
  "正常": "Normal",
  "已冲销": "Reversed",
  "部分冲销": "Partially reversed",
  "已核销": "Settled",
  "计提中": "Accruing",
  "已作废": "Void",
  "已被重结覆盖": "Superseded",
  "待付": "Unpaid",
  "已付": "Paid",
  "已取消": "Cancelled",
  "已冻结": "Frozen",

  // 交易详情
  "定金账户": "Deposit account",
  "尾款账户": "Balance account",
  "定金预算池": "Deposit pool",
  "尾款预算池": "Balance pool",
  "现金日": "Cash date",
  "权责日": "Accrual date",
  "原币": "Original",
  "汇率": "FX rate",
  "订单明细": "Order items",
  "名称": "Name",
  "数量": "Qty",
  "单价": "Unit price",
  "小计": "Subtotal",
  "费用": "Fee",
  "商品": "Item",
  "预算分录": "Budget postings",
  "影响": "Effect",
  "无预算影响": "No budget effect",
  "现金流": "Cash flow",
  "暂无现金流动": "No cash movement",
  "未付义务": "Unpaid obligation",
  "冻结": "Freeze",
  "解冻": "Unfreeze",
  "核销": "Settle",
  "支付": "Pay",
  "附件": "Attachments",
  "+ 添加附件": "+ Add attachment",
  "支持订单截图、商品链接截图、PDF": "Order screenshots, links, PDF",
  "关联事件（审计）": "Related events (audit)",

  // 冲销 / 支付 / 核销 / 展期 / 取消
  "冲销金额": "Reversal amount",
  "实际退款金额": "Refund amount",
  "冲销日期": "Reversal date",
  "冲销理由": "Reason",
  "确认冲销": "Confirm reversal",
  "本次支付金额": "Amount paid",
  "支付日期": "Payment date",
  "确认支付": "Confirm payment",
  "新的尾款金额": "New balance amount",
  "核销日期": "Settlement date",
  "确认核销": "Confirm settlement",
  "新的尾款月": "New due month",
  "操作日期": "Date",
  "确认展期": "Confirm rollover",
  "取消原因": "Cancellation reason",
  "自己取消": "Cancelled by me",
  "商家跳票 / 违约": "Vendor default",
  "退款金额": "Refund amount",
  "取消日期": "Cancellation date",
  "确认取消": "Confirm cancellation",

  // 记一笔
  "即时消费或未来一次性": "Immediate or future one-off",
  "定金 + 尾款，锁定未来月": "Deposit + balance, locks a future month",
  "估算占位，后续核销": "Estimate first, settle later",
  "账户间、池间划转": "Between accounts / pools",
  "外部资金流入": "External inflow",
  "账户初始余额": "Opening balance",
  "当前预算": "Current budget",
  "左：规律可用 · 右：一次性余额": "Left: recurring available · right: one-off",
  "规则提示": "Rules",
  "必填项未填会直接拒绝保存（硬性阻断）。": "Missing required fields block the save.",
  "未来月会被预先锁定，影响当月的结转。": "Future months are locked in advance and affect carry-over.",
  "冲销与退款一律回到一次性预算。": "Reversals and refunds always go to the one-off pool.",
  "一次性预算不能转回规律预算。": "One-off budget can never move back to recurring.",
  "请选择账户": "Select an account",
  "金额必须大于 0": "Amount must be greater than 0",
  "保存现货": "Save spot",
  "保存中…": "Saving…",
  "定金": "Deposit",
  "订单总额": "Order total",
  "尾款月": "Balance month",
  "原币种": "Currency",
  "原币金额 / 汇率": "Original amount / rate",
  "商品明细 / 额外费用（可选）": "Items / extra fees (optional)",
  "+ 商品": "+ Item",
  "+ 费用": "+ Fee",
  "不填明细时以「订单总额」为准；填了明细则由明细求和。":
    "Leave empty to use “Order total”; otherwise items are summed.",
  "创建订单": "Create order",
  "计提金额": "Estimated amount",
  "锁定月份": "Lock to month",
  "计提理由": "Reason",
  "保存计提": "Save accrual",
  "转出": "From",
  "转入": "To",
  "保存转账": "Save transfer",
  "规律收入": "Regular income",
  "一次性收入": "One-off income",
  "进入预算池": "Into pool",
  "来源 / 标题": "Source / title",
  "保存收入": "Save income",
  "保存期初": "Save opening",
  "负数为期初欠款": "Negative = opening debt",

  // 预算页
  "上一月": "Prev",
  "下一月": "Next",
  "手动结账": "Close month",
  "重开该月": "Reopen",
  "规律额度合计": "Total recurring quota",
  "规律已用": "Recurring used",
  "规律剩余": "Recurring left",
  "一次性余额合计": "Total one-off",
  "规律额度": "Recurring quota",

  "规律可用": "Recurring available",
  "一次性流入": "One-off in",
  "一次性流出": "One-off out",
  "一次性余额（结算至该月）": "One-off balance (settled)",
  "改额度": "Edit quota",
  "超支": "Over budget",
  "改动": "Change",
  "结转规则": "Carry-over rule",
  "月末自动结账：每个账户的「规律可用」会整体转入同账户的一次性预算（正数增加、负数扣减），规律预算按月重置到额度。已结账月份默认锁定，如需补录请使用「重开该月」。":
    "At month end every account's remaining recurring budget moves into its one-off pool (positive adds, negative deducts), and recurring resets to the quota. Closed months are locked; use “Reopen” to backfill.",
  "{{m}} 已结账；新增交易会被拒绝，需先在「预算 → 重开该月」里重开该月。":
    "{{m}} is closed; new entries are rejected until you reopen it from Budget → Reopen.",
  "修改规律额度 · {{name}}": "Edit recurring quota · {{name}}",
  "已设置：自 {{m}} 起额度为 {{x}}": "Saved: quota {{x}} starting {{m}}",
  "修改从下个月起生效：当前选择的 {{m}} 额度不变，新额度自 {{n}} 开始计算。同一个生效月份再次修改会直接覆盖。":
    "Changes apply from next month: {{m}} keeps its quota, the new amount starts {{n}}. Editing the same effective month again overwrites it.",
  "自 {{m}} 起的规律额度": "Recurring quota from {{m}}",
  "后续月份沿用，直到再次修改": "Applies to later months until changed again",
  "没有账户": "No accounts",
  "← 上一月": "← Prev",
  "下一月 →": "Next →",
  "（预计）": "(projected)",
  "规律预算注入 · {{name}}": "Recurring budget injection · {{name}}",

  // 未来义务
  "未来 12 个月资金需求": "Cash needed in the next 12 months",
  "合计 {{x}}": "Total {{x}}",
  "义务清单": "Obligations",
  "未结清": "Open",
  "{{n}} 笔": "{{n}} items",
  "没有义务记录": "No obligations",
  "期货尾款与计提会自动出现在这里": "Futures balances and accruals show up here automatically",
  "按月汇总": "By month",
  "期货尾款": "Futures balance",
  "核销计提 · {{m}}": "Settle accrual · {{m}}",
  "原计提 {{x}}（锁定在 {{m}}）。核销会先释放这笔估计值，再按实际金额生成一笔现货交易（占用计数器、按实际金额判分级）。":
    "The accrual of {{x}} (locked in {{m}}) is released first, then a real spot entry is created for the actual amount (counts toward the level counter).",
  "实际金额": "Actual amount",
  "实际发生的预算池": "Actual pool",
  "发生日期": "Date",
  "应付 {{a}}，已付 {{b}}，未付 {{c}}": "Due {{a}}, paid {{b}}, unpaid {{c}}",
  "原预估 {{a}}，已付 {{b}}": "Estimated {{a}}, paid {{b}}",
  "差额 {{x}} 将按原预算池从 {{m}} 调整（若该月已结账则记入当前月）。":
    "The difference {{x}} is adjusted in {{m}} on the same pool (or the current month if closed).",
  "原尾款月 {{a}}，金额 {{b}}": "Original due month {{a}}, amount {{b}}",
  "展期会生成「释放原月 + 锁定新月」两条分录，并计入平均延期天数；不可冲销，只能反向展期。":
    "Rolling over posts two entries (release old month, lock new month) and counts toward the average extension days; it cannot be reversed, only rolled forward again.",
  "取消会计入跳票率统计（自己取消与商家违约都算「未按最初约定」）。":
    "Cancellations count toward the default rate (self-cancelled and vendor defaults both count as “not as originally agreed”).",
  "冲销不修改原记录：它会追加一条反向事件。退款一律进入一次性预算；超过原金额的部分会自动作为一笔新支出。计数器会同时恢复。":
    "Reversal never edits the original: it appends a counter-event. Refunds go to the one-off pool; any excess becomes a new expense. The counter is restored too.",
  "原交易 {{x}}": "Original {{x}}",
  "没钱退回时填 0": "Use 0 if no money came back",
  "应付": "Due",
  "新的尾款金额（不能低于已付）": "New balance amount (not below paid)",

  // 账户
  "逻辑账户内部包含两个资金池：规律（每月重置）与一次性（不可再生）":
    "Each account has two pools: recurring (resets monthly) and one-off (non-renewable).",
  "+ 新建账户": "+ New account",
  "{{m}} 规律额度": "{{m}} recurring quota",
  "已归档": "Archived",
  "归档": "Archive",
  "恢复": "Restore",
  "关于归档": "About archiving",
  "归档的账户不再参与月结与统计，但历史记录完整保留。已归档账户不能新建交易。":
    "Archived accounts stop participating in month close and reports, but keep their full history. They cannot receive new entries.",
  "新建逻辑账户": "New account",
  "{{m}} 起的规律预算": "Recurring budget from {{m}}",
  "创建当月即刻生效；0 表示不使用规律预算": "Effective from the creation month; 0 means no recurring budget",
  "初始一次性预算": "Initial one-off budget",
  "正数为期初余额，负数为期初欠款": "Positive = opening balance, negative = opening debt",
  "请输入账户名称": "Enter an account name",
  "账户已创建": "Account created",
  "已保存": "Saved",
  "编辑账户": "Edit account",
  "排序": "Sort order",
  "银行卡": "Bank card",
  "现金": "Cash",
  "储备": "Reserve",
  "投资": "Investment",
  "信用": "Credit",

  // 表单细节
  "如：日常卡": "e.g. Daily card",
  "选择账户…": "Select account…",
  "买的是什么": "What did you buy",
  "是否急用 / 能等多久": "Urgency / how long you can wait",
  "分级：": "Level: ",
  "本次将升级为中等": "this one will be upgraded to Medium",
  "本月已用 {{a}}/{{b}}": "Used this month {{a}}/{{b}}",
  "请先创建账户": "Create an account first",
  "到「账户」页添加逻辑账户后才能记账": "Add an account on the Accounts page before recording",
  "已记账": "Saved",
  "（分级已自动升级）": " (level auto-upgraded)",
  "预算归属月": "Budget month",
  "默认 {{m}}；选择未来月即为「未来现货」，会预先锁定该月预算":
    "Defaults to {{m}}; picking a future month makes it a future spot and locks that month's budget",
  "分级覆盖": "Level override",
  "自动判定": "Auto",
  "订单总额（由明细汇总）": "Order total (from items)",
  "尾款 {{x}} 将锁定于此月": "Balance {{x}} will be locked to this month",
  "本位币": "Base currency",
  "定金（{{a}} · 下单月扣）": "Deposit ({{a}} · charged in order month)",
  "尾款（{{a}} · {{m}} 锁定）": "Balance ({{a}} · locked to {{m}})",
  "订单已建立，尾款 {{x}} 已锁定 {{m}}": "Order created; balance {{x}} locked to {{m}}",
  "已计提 {{x}}，锁定 {{m}}": "Accrued {{x}}, locked to {{m}}",
  "请选择尾款账户": "Select a balance account",
  "订单总额必须大于 0": "Order total must be greater than 0",
  "定金不能超过总额": "Deposit cannot exceed the total",
  "转账已记录": "Transfer recorded",
  "收入已记录": "Income recorded",
  "期初余额已记录": "Opening balance recorded",
  "一次性预算不可转回规律预算（不可再生资源不得再生）。":
    "One-off budget cannot move back to recurring.",
  "运费/手续费": "Shipping / fee",
  "商品名": "Product name",
  "下单日": "Order date",
  "截单日": "Order deadline",
  "供应商 / 会社": "Vendor / company",
  "可留空，输入后自动建档": "Optional; saved as a vendor automatically",
  "定金为 0 则全额锁定尾款月": "0 deposit locks the whole amount to the balance month",
  "如：某某 1/7 限定手办": "e.g. some 1/7 limited figure",
  "收入类型": "Income type",
  "一次性收入只能进一次性预算": "One-off income can only go to the one-off pool",

  // 账本细节
  "同定金账户": "Same as deposit",
  "未收付": "Not settled",
  "使用时长": "Usage period",
  "{{n}} 个月": "{{n}} months",
  "核销尾款（改预估金额）": "Settle balance (change estimate)",
  "已展期到 {{m}}": "Rolled over to {{m}}",
  "已解冻": "Unfrozen",
  "附件已添加": "Attachment added",
  "图片/PDF": "Image / PDF",
  "支付已记录（仅影响现金流，预算已锁定）": "Payment recorded (cash flow only; budget already locked)",
  "核销完成，预算已重算": "Settled; budget recalculated",
  "订单已取消，未付锁定已释放": "Order cancelled; unpaid lock released",
  "冲销完成": "Reversal done",
  "额度变更历史（生效月份）": "Quota history (effective month)",
  "生效月份": "Effective month",
  "每月额度": "Monthly quota",
  "暂无额度记录": "No quota records",
  "修改额度从下个月生效；同一生效月份重复修改会覆盖前一次。":
    "Quota changes apply from next month; repeating an edit for the same effective month overwrites it.",
  "预算分配": "budget allocation",
  "每月初系统会把该账户的规律预算注入本月额度（相当于「本月第一笔可支配额」）。它属于":
    "At the start of each month the recurring budget is injected as this month's allowance (your \"first spendable amount\"). It is a ",
  "，不是收入——不计入利润表与现金流量表；月末未花完的部分会结转进一次性预算。":
    ", not income — it never appears in P&L or cash flow. Whatever is left at month end carries into the one-off pool.",
  "冲销不修改原记录：它会追加一条反向事件。退款一律进入":
    "Reversal never edits the record: it appends a counter-event. Refunds always go to the ",
  "；超过原金额的部分会自动作为一笔新支出。计数器会同时恢复。":
    "; anything above the original amount becomes a new expense. The counter is restored too.",
  "支付尾款 · {{m}}": "Pay balance · {{m}}",
  "应付 {{a}}，已付 {{b}}，未付": "Due {{a}}, paid {{b}}, unpaid",
  "退回一次性预算，可为 0": "Goes to the one-off pool; 0 allowed",
  "原因": "Reason",

  // 补全：分级标签（数据库里的中文）
  "刚需": "Essential",
  "小额": "Small",
  "中等": "Medium",
  "大额": "Large",
  "设备": "Equipment",
  "信用/负债": "Credit / debt",
  "期货": "Futures",
  "尾款": "Balance",

  // 补全：表单/报表/设置
  "采购必要性": "Necessity",
  "消费理由": "Reason",
  "时效性": "Urgency",
  "市场均价": "Market price",
  "预期使用效果": "Expected benefit",
  "预期目的": "Purpose",
  "预算池": "Pool",
  "定金从哪个账户扣": "Which account the deposit is charged to",
  "尾款从哪个账户扣": "Which account the balance is charged to",
  "可未来月，用于预估运费/关税等": "Can be a future month, e.g. estimated shipping/tax",
  "修改": "Change",
  "从下个月起生效": "takes effect next month",
  "：当前选择的 {{m}} 额度不变，新额度自 {{n}} 开始计算。同一个生效月份再次修改会直接覆盖。":
    ": {{m}} keeps its quota; the new amount starts {{n}}. Editing the same effective month again overwrites it.",
  "订单": "Orders",
  "订单数": "Orders",
  "总额": "Total",
  "平均延期": "Avg. delay",
  "跳票率": "Default rate",
  "展期 + 取消 + 违约 / 订单总数": "rolled over + cancelled + defaulted / total orders",
  "暂无期货订单": "No futures orders yet",
  "按月": "By month",
  "按供应商": "By vendor",
  "按账户": "By account",
  "构成": "Breakdown",
  "收入合计": "Total income",
  "支出合计": "Total expense",
  "支出": "Expense",
  "净额": "Net",
  "现金流入": "Cash in",
  "现金流出": "Cash out",
  "净现金流": "Net cash flow",
  "流入": "In",
  "流出": "Out",
  "额度": "Quota",
  "已用": "Used",
  "可用": "Available",
  "使用率": "Usage",
  "没有数据": "No data",
  "明细": "Details",
  "起": "From",
  "止": "To",
  "权责发生制：期货下单日确认全额，计提核销日确认":
    "Accrual basis: futures are recognized in full on order date; accruals on settlement date",
  "预算执行报告对比实际权责支出与「规律额度 + 一次性可用额」；超支行会标红。":
    "Compares actual accrual spending against “recurring quota + available one-off”; overspent rows are red.",
  "本月剩余规律额度": "Recurring left this month",
  "未来 12 月刚性义务分布": "Fixed obligations over the next 12 months",
  "可超前消费": "Spending headroom",
  "计算口径": "Calculation basis",
  "可超前消费 = 可支配总资产 − 刚性义务 − 安全垫 =":
    "Headroom = available assets − obligations − cushion =",
  "安全垫可在「设置」中调整。": "The cushion can be changed in Settings.",
  "预算参数": "Budget settings",
  "安全垫（元）": "Safety cushion (CNY)",
  "计算「超前消费能力」时保留的安全余量": "Reserve kept when computing spending headroom",
  "未来义务预测月数": "Forecast months",
  "仪表盘与平摊表展示的月数": "How many months the dashboard and schedule show",
  "单个附件大小上限（MB）": "Attachment size limit (MB)",
  "数据": "Data",
  "数据库位置": "Database location",
  "导出备份": "Export backup",
  "备份已导出": "Backup exported",
  "备份为 SQLite 快照；附件位于同目录的 attachments 文件夹，需要一并复制。所有交易均为追加式存储，不会物理删除。":
    "The backup is a SQLite snapshot; attachments live in the sibling attachments folder and should be copied too. All entries are append-only and never physically deleted.",
  "消费分级（只读）": "Spending levels (read-only)",
  "必填项": "Required fields",
  "区间（元）": "Range (CNY)",
  "月度次数": "Monthly limit",
  "限额": "Limit",
  "账本原则": "Ledger principles",
  "币种": "Currencies",
  "首版以人民币为本位币；外币金额仅作为订单元数据记录，汇率手工填写。":
    "CNY is the base currency; foreign amounts are order metadata with a manually entered FX rate.",
  "已重开该月，可补录交易": "Month reopened; you can backfill entries",
  "计提已核销，生成一笔真实现货交易": "Accrual settled; a real spot entry was created",
  "取消期货订单": "Cancel futures order",
  "展期尾款": "Roll over balance",
  "-": "-",
  "合计": "Total",
  "已付 {{a}} / {{b}}": "Paid {{a}} / {{b}}",
  "月末自动结账：每个账户的「规律可用」会整体转入同账户的一次性预算（正数增加、负数扣减），规律预算按月重置到额度。已结账月份默认锁定，如需补录请使用「重开上月」。":
    "At month end every account's remaining recurring budget moves into its one-off pool (positive adds, negative deducts), and recurring resets to the quota. Closed months are locked; use “Reopen” to backfill.",
  "交易只追加，修改通过冲销 / 核销 / 展期等反向事件完成。":
    "Entries are append-only; corrections happen through reversal / settlement / roll-over events.",
  "规律预算按月重置，结余自动转入一次性预算。":
    "Recurring budget resets monthly; the surplus moves to the one-off pool.",
  "一次性预算不可再生，不能转回规律预算。":
    "One-off budget never renews and cannot move back to recurring.",
  "已结账月份锁定，补录需先「重开上月」。":
    "Closed months are locked; reopen the month before backfilling.",
  "预算释放（退款 / 冲销）一律回到一次性预算。":
    "Budget releases (refunds / reversals) always land in the one-off pool.",
  "额外成本先扣一次性，不足再扣规律预算（规律可为负）。":
    "Extra costs hit the one-off pool first, then recurring (which may go negative).",
  "消费分级按金额自动判定，必填项未填无法保存。":
    "Spending level is derived from the amount; missing required fields block saving.",
  "{{code}} {{name}}（{{n}} 位小数）": "{{code}} {{name}} ({{n}} decimals)",
  "人民币": "Chinese Yuan",
  "日元": "Japanese Yen",
  "美元": "US Dollar",
  "欧元": "Euro",
  "英镑": "Pound Sterling",
  "其他": "Other",

  // 预算兑现
  "兑现": "Realize",
  "规律预算到账，计入现金流": "Recurring budget arriving, counted as cash flow",
  "规律预算在月初记为「应收」收入；这里记录它真正到账的部分。兑现只进现金流，不改变可花额度，累计不能超过当月额度，少兑现的部分算「欠兑现」。":
    "The recurring quota is booked as receivable income at month start; this records the part that actually arrived. Realization only affects cash flow — spendable budget is unchanged — and the total may not exceed the month's quota. Anything unrealized counts as “owed realization”.",
  "要兑现哪个月的规律预算": "Which month's recurring budget",
  "本月剩余可兑现 {{x}}": "Still realizable this month: {{x}}",
  "到账日期": "Arrival date",
  "额度 {{q}} · 已兑现 {{r}} · 未兑现 {{u}}": "Quota {{q}} · realized {{r}} · outstanding {{u}}",
  "超出剩余可兑现额度": "Exceeds the remaining realizable amount",
  "填入剩余额度": "Fill remaining",
  "保存兑现": "Save realization",
  "兑现已记录": "Realization recorded",
  "兑现金额": "Amount realized",
  "撤回兑现": "Undo realization",
  "已撤回该笔兑现": "Realization undone",
  "预算兑现": "Budget realization",
  "兑现撤回": "Realization undone",
  "预算兑现比例": "Realization rate",
  "已兑现": "Realized",
  "欠兑现": "Owed",
  "兑现比例": "Realization rate",
  "规律预算在月初记为应收收入；兑现是它的实际到账，累计不超过当月额度。欠兑现 = 额度 − 已兑现，按月清零。":
    "The recurring quota is booked as receivable income at the start of the month; realization is what actually arrived, capped at that month's quota. Owed = quota − realized, reset every month.",
};

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    // localStorage 不可用时忽略
  }
  const nav =
    (typeof navigator !== "undefined" && (navigator.language || navigator.languages?.[0])) || "zh";
  return nav.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function translate(lang: Lang, zh: string, vars?: Record<string, string | number>): string {
  let out = zh;
  if (lang === "en") {
    const hit = EN[zh];
    if (hit) out = hit;
  }
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{{${k}}}`).join(String(v));
    }
  }
  return out;
}

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (zh: string, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18nCtx>({
  lang: "zh",
  setLang: () => {},
  t: (s) => s,
});

let currentLang: Lang = detectLang();

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectLang());
  // 同步到模块级，供组件外的 t() 使用
  currentLang = lang;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // 忽略
    }
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);

  const value = useMemo<I18nCtx>(
    () => ({
      lang,
      setLang: setLangState,
      t: (zh, vars) => translate(lang, zh, vars),
    }),
    [lang],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT() {
  return useContext(Ctx);
}

/** 组件外也能用的翻译函数（当前语言由 I18nProvider 同步） */
export function t(zh: string, vars?: Record<string, string | number>): string {
  return translate(currentLang, zh, vars);
}

/** 当前语言，供日期/月份等格式化使用 */
export function getLang(): Lang {
  return currentLang;
}
