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
  Row,
  Statistic,
  Table,
  Tag,
  message
} from 'antd'
import dayjs from 'dayjs'
import type {
  AccountState,
  OneTimeDeposit,
  RegularDepositSummary
} from '../../../preload/types'
import { addMonths, monthEndDate } from '../lib/month'

interface Props {
  accountId: number
  month: string
}

function AccountCalendar({ accountId, month }: Props): JSX.Element {
  const [state, setState] = useState<AccountState | null>(null)
  const [deposits, setDeposits] = useState<OneTimeDeposit[]>([])
  const [streams, setStreams] = useState<RegularDepositSummary[]>([])
  const [addDepositOpen, setAddDepositOpen] = useState(false)
  const [addRegularOpen, setAddRegularOpen] = useState(false)
  const [changeRateTarget, setChangeRateTarget] = useState<RegularDepositSummary | null>(null)
  const [depositForm] = Form.useForm()
  const [regularForm] = Form.useForm()
  const [rateForm] = Form.useForm()

  async function refresh(): Promise<void> {
    const [accountState, monthDeposits, regularStreams] = await Promise.all([
      window.api.ledger.compute.accountState({ accountId, asOfDate: monthEndDate(month) }),
      window.api.ledger.oneTimeDeposits.listForMonth({ accountId, month }),
      window.api.ledger.regularDeposits.listForAccount({ accountId })
    ])
    setState(accountState)
    setDeposits(monthDeposits)
    setStreams(regularStreams)
  }

  useEffect(() => {
    refresh()
  }, [accountId, month])

  async function handleAddDeposit(): Promise<void> {
    const values = await depositForm.validateFields()
    await window.api.ledger.oneTimeDeposits.create({
      accountId,
      amount: values.amount,
      date: values.date.format('YYYY-MM-DD'),
      description: values.description ?? ''
    })
    depositForm.resetFields()
    setAddDepositOpen(false)
    message.success('Deposit added')
    await refresh()
  }

  async function handleAddRegular(): Promise<void> {
    const values = await regularForm.validateFields()
    await window.api.ledger.regularDeposits.create({
      accountId,
      name: values.name,
      amount: values.amount
    })
    regularForm.resetFields()
    setAddRegularOpen(false)
    message.success('Regular deposit added')
    await refresh()
  }

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

  const streamStateById = new Map(state?.streams.map((s) => [s.id, s]))
  const nextMonthLabel = addMonths(month, 1)

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
        title="One-time deposits this month"
        style={{ marginTop: 24 }}
        extra={<Button onClick={() => setAddDepositOpen(true)}>Add one-time deposit</Button>}
      >
        <Table
          rowKey="id"
          dataSource={deposits}
          pagination={false}
          columns={[
            { title: 'Date', dataIndex: 'date' },
            { title: 'Amount', dataIndex: 'amount', render: (v: number) => v.toFixed(2) },
            { title: 'Description', dataIndex: 'description' }
          ]}
        />
      </Card>

      <Card
        title="Regular deposits"
        style={{ marginTop: 24 }}
        extra={<Button onClick={() => setAddRegularOpen(true)}>Add regular deposit</Button>}
      >
        <List
          dataSource={streams}
          renderItem={(stream) => {
            const s = streamStateById.get(stream.id)
            return (
              <List.Item
                actions={[
                  <Button key="change" onClick={() => setChangeRateTarget(stream)}>
                    Change rate
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

      <Modal
        title="Add one-time deposit"
        open={addDepositOpen}
        onOk={handleAddDeposit}
        onCancel={() => setAddDepositOpen(false)}
      >
        <Form form={depositForm} layout="vertical" initialValues={{ date: dayjs(`${month}-01`) }}>
          <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} placeholder="Negative for withdrawal" />
          </Form.Item>
          <Form.Item name="date" label="Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Add regular deposit"
        open={addRegularOpen}
        onOk={handleAddRegular}
        onCancel={() => setAddRegularOpen(false)}
      >
        <Form form={regularForm} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Salary" />
          </Form.Item>
          <Form.Item name="amount" label="Monthly amount" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </Form>
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
