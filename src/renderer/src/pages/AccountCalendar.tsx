import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Radio,
  Row,
  Select,
  Statistic,
  Table,
  Tabs,
  Tag,
  message
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import type {
  AccountState,
  OneTimeDeposit,
  RegularDepositSummary,
  Spot
} from '../../../preload/types'
import { addMonths, monthEndDate } from '../lib/month'

interface Props {
  accountId: number
  month: string
}

type TransactionRow = {
  key: string
  type: 'spot'
  date: string
  description: string
  amount: number
  paymentFromRegular?: number
  paymentFromOnetime?: number
}

type SortField = 'date' | 'amount' | 'type'
type SortOrder = 'asc' | 'desc'

function AccountCalendar({ accountId, month }: Props): JSX.Element {
  const [state, setState] = useState<AccountState | null>(null)
  const [spots, setSpots] = useState<Spot[]>([])
  const [streams, setStreams] = useState<RegularDepositSummary[]>([])
  const [addTransactionOpen, setAddTransactionOpen] = useState(false)
  const [changeRateTarget, setChangeRateTarget] = useState<RegularDepositSummary | null>(null)
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [spotForm] = Form.useForm()
  const [rateForm] = Form.useForm()

  async function refresh(): Promise<void> {
    const [accountState, monthSpots, regularStreams] = await Promise.all([
      window.api.ledger.compute.accountState({ accountId, asOfDate: monthEndDate(month) }),
      window.api.ledger.spots.listForMonth({ accountId, month }),
      window.api.ledger.regularDeposits.listForAccount({ accountId })
    ])
    setState(accountState)
    setSpots(monthSpots)
    setStreams(regularStreams)
  }

  useEffect(() => {
    refresh()
  }, [accountId, month])

  async function handleChangeRate(): Promise<void> {
    if (!changeRateTarget) return
    const values = await rateForm.validateFields()
    const result = await window.api.ledger.regularDeposits.changeRate({
      regularDepositId: changeRateTarget.id,
      amount: values.amount
    })
    rateForm.resetFields()
    setChangeRateTarget(null)
    message.success(`Rate change takes effect from ${result.effectiveFromMonth}`)
    await refresh()
  }

  async function handleAddSpot(): Promise<void> {
    const values = await spotForm.validateFields()
    const spotDate = values.date.format('YYYY-MM-DD')
    const spotAmount = values.amount
    const paymentMethod = values.paymentMethod ?? 'regular-first'

    const available = await window.api.ledger.spots.computeAvailablePayment({
      accountId,
      asOfDate: spotDate
    })

    let paymentFromRegular = 0
    let paymentFromOnetime = 0

    if (paymentMethod === 'regular-first' || paymentMethod === 'hybrid') {
      paymentFromRegular = Math.min(spotAmount, available.availableAR)
      paymentFromOnetime = spotAmount - paymentFromRegular
    } else if (paymentMethod === 'onetime') {
      paymentFromOnetime = spotAmount
    } else if (paymentMethod === 'manual') {
      paymentFromRegular = values.manualRegular ?? 0
      paymentFromOnetime = values.manualOnetime ?? 0
    }

    await window.api.ledger.spots.create({
      accountId,
      amount: spotAmount,
      date: spotDate,
      description: values.description ?? '',
      paymentFromRegular,
      paymentFromOnetime
    })

    spotForm.resetFields()
    setAddTransactionOpen(false)
    message.success('Spot transaction added')
    await refresh()
  }

  const streamStateById = new Map(state?.streams.map((s) => [s.id, s]))
  const nextMonthLabel = addMonths(month, 1)

  // Build unified transaction list
  const transactionRows: TransactionRow[] = spots.map((spot) => ({
    key: `spot-${spot.id}`,
    type: 'spot',
    date: spot.date,
    description: spot.description,
    amount: spot.amount,
    paymentFromRegular: spot.payment_from_regular,
    paymentFromOnetime: spot.payment_from_onetime
  }))

  // Sort transactions
  const sortedTransactions = [...transactionRows].sort((a, b) => {
    let comparison = 0
    if (sortField === 'date') {
      comparison = a.date.localeCompare(b.date)
    } else if (sortField === 'amount') {
      comparison = a.amount - b.amount
    } else if (sortField === 'type') {
      comparison = a.type.localeCompare(b.type)
    }
    return sortOrder === 'asc' ? comparison : -comparison
  })

  const columns: ColumnsType<TransactionRow> = [
    {
      title: 'Type',
      dataIndex: 'type',
      render: (type: string) => <Tag color="blue">{type}</Tag>
    },
    { title: 'Date', dataIndex: 'date' },
    { title: 'Description', dataIndex: 'description' },
    {
      title: 'Amount',
      dataIndex: 'amount',
      render: (v: number) => v.toFixed(2)
    },
    {
      title: 'Payment',
      render: (_: unknown, record: TransactionRow) => (
        <span>
          {record.paymentFromRegular !== undefined && record.paymentFromRegular > 0 && (
            <Tag color="gold">Regular: {record.paymentFromRegular.toFixed(2)}</Tag>
          )}
          {record.paymentFromOnetime !== undefined && record.paymentFromOnetime > 0 && (
            <Tag color="blue">One-time: {record.paymentFromOnetime.toFixed(2)}</Tag>
          )}
        </span>
      )
    }
  ]

  return (
    <div>
      <Row gutter={16}>
        <Col span={8}>
          <Card>
            <Statistic title="Cash Flow (as of this month)" value={state?.cashFlow ?? 0} precision={2} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="AR (this month, not yet cash)" value={state?.ar ?? 0} precision={2} />
          </Card>
        </Col>
      </Row>

      <Card
        title="Regular deposits"
        style={{ marginTop: 24 }}
      >
        <List
          dataSource={streams}
          renderItem={(stream) => {
            const s = streamStateById.get(stream.id)
            return (
              <List.Item
                actions={[
                  <Button key="change" onClick={() => setChangeRateTarget(stream)}>
                    Change rate (m+1 rule)
                  </Button>
                ]}
              >
                <List.Item.Meta
                  title={stream.name}
                  description={
                    s?.status === 'not_started' ? (
                      <Tag>Not started yet</Tag>
                    ) : (
                      <span>
                        Accruing as AR: {s?.monthAmount.toFixed(2)} <Tag color="gold">AR</Tag>
                      </span>
                    )
                  }
                />
              </List.Item>
            )
          }}
        />
      </Card>

      <Card
        title="Transactions this month"
        style={{ marginTop: 24 }}
        extra={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span>Sort by:</span>
            <Select
              value={sortField}
              onChange={(v) => setSortField(v)}
              style={{ width: 100 }}
              options={[
                { label: 'Date', value: 'date' },
                { label: 'Amount', value: 'amount' },
                { label: 'Type', value: 'type' }
              ]}
            />
            <Select
              value={sortOrder}
              onChange={(v) => setSortOrder(v)}
              style={{ width: 100 }}
              options={[
                { label: 'Asc', value: 'asc' },
                { label: 'Desc', value: 'desc' }
              ]}
            />
            <Button type="primary" onClick={() => setAddTransactionOpen(true)}>
              Add transaction
            </Button>
          </div>
        }
      >
        <Table
          rowKey="key"
          dataSource={sortedTransactions}
          columns={columns}
          pagination={false}
        />
      </Card>

      <Modal
        title="Add transaction"
        open={addTransactionOpen}
        footer={null}
        onCancel={() => setAddTransactionOpen(false)}
        width={600}
      >
        <Tabs
          items={[
            {
              key: 'spot',
              label: 'Spot',
              children: (
                <Form
                  form={spotForm}
                  layout="vertical"
                  initialValues={{ date: dayjs(`${month}-01`), paymentMethod: 'regular-first' }}
                  onFinish={handleAddSpot}
                >
                  <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
                    <InputNumber style={{ width: '100%' }} placeholder="Positive = expense" />
                  </Form.Item>
                  <Form.Item name="date" label="Date" rules={[{ required: true }]}>
                    <DatePicker style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name="description" label="Description">
                    <Input />
                  </Form.Item>
                  <Form.Item name="paymentMethod" label="Payment method">
                    <Radio.Group>
                      <Radio value="regular-first">Regular first (default)</Radio>
                      <Radio value="onetime">One-time only</Radio>
                      <Radio value="manual">Manual override</Radio>
                    </Radio.Group>
                  </Form.Item>
                  <Form.Item noStyle shouldUpdate={(prev, curr) => prev.paymentMethod !== curr.paymentMethod}>
                    {({ getFieldValue }) =>
                      getFieldValue('paymentMethod') === 'manual' ? (
                        <>
                          <Form.Item name="manualRegular" label="From regular AR">
                            <InputNumber style={{ width: '100%' }} />
                          </Form.Item>
                          <Form.Item name="manualOnetime" label="From one-time cash">
                            <InputNumber style={{ width: '100%' }} />
                          </Form.Item>
                        </>
                      ) : null
                    }
                  </Form.Item>
                  <Form.Item>
                    <Button type="primary" htmlType="submit">
                      Add Spot
                    </Button>
                  </Form.Item>
                </Form>
              )
            }
          ]}
        />
      </Modal>

      <Modal
        title={`Change rate: ${changeRateTarget?.name ?? ''}`}
        open={!!changeRateTarget}
        onOk={handleChangeRate}
        onCancel={() => setChangeRateTarget(null)}
      >
        <p>This change takes effect starting {nextMonthLabel}, not this month.</p>
        <Form form={rateForm} layout="vertical">
          <Form.Item name="amount" label="New monthly amount" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default AccountCalendar
