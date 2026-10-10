import { useEffect, useState } from 'react'
import { Card, Col, Row, Statistic, Table } from 'antd'
import type { OverallState } from '../../../preload/types'
import { monthEndDate } from '../lib/month'

interface Props {
  month: string
}

interface AccountRow {
  accountId: number
  name: string
  cashFlow: number
  ar: number
}

function Overview({ month }: Props): JSX.Element {
  const [state, setState] = useState<OverallState | null>(null)
  const [accountNames, setAccountNames] = useState<Record<number, string>>({})

  useEffect(() => {
    async function load(): Promise<void> {
      const accounts = await window.api.ledger.accounts.list()
      const names: Record<number, string> = {}
      accounts.forEach((a) => (names[a.id] = a.name))
      setAccountNames(names)

      const result = await window.api.ledger.compute.overallState({
        asOfDate: monthEndDate(month)
      })
      setState(result)
    }
    load()
  }, [month])

  const rows: AccountRow[] =
    state?.accounts.map((a) => ({
      accountId: a.accountId,
      name: accountNames[a.accountId] ?? `Account ${a.accountId}`,
      cashFlow: a.cashFlow,
      ar: a.ar
    })) ?? []

  return (
    <div>
      <Row gutter={16}>
        <Col span={8}>
          <Card>
            <Statistic title="Total Cash Flow" value={state?.cashFlow ?? 0} precision={2} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="Total AR (expected)" value={state?.ar ?? 0} precision={2} />
          </Card>
        </Col>
      </Row>
      <Table
        style={{ marginTop: 24 }}
        rowKey="accountId"
        dataSource={rows}
        columns={[
          { title: 'Account', dataIndex: 'name' },
          { title: 'Cash Flow', dataIndex: 'cashFlow', render: (v: number) => v.toFixed(2) },
          { title: 'AR', dataIndex: 'ar', render: (v: number) => v.toFixed(2) }
        ]}
        pagination={false}
      />
    </div>
  )
}

export default Overview
