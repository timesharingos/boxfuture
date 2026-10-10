import { useEffect, useState } from 'react'
import { Layout, Menu, Button, Modal, Form, Input, InputNumber, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { Account } from '../../preload/types'
import Overview from './pages/Overview'
import AccountCalendar from './pages/AccountCalendar'
import MonthNav from './components/MonthNav'
import { monthKey } from './lib/month'

const { Sider, Header, Content } = Layout

function App(): JSX.Element {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedKey, setSelectedKey] = useState<string>('overview')
  const [month, setMonth] = useState<string>(monthKey(new Date()))
  const [addAccountOpen, setAddAccountOpen] = useState(false)
  const [form] = Form.useForm()

  async function refreshAccounts(): Promise<void> {
    const list = await window.api.ledger.accounts.list()
    setAccounts(list)
  }

  useEffect(() => {
    refreshAccounts()
  }, [])

  async function handleAddAccount(): Promise<void> {
    const values = await form.validateFields()
    const account = await window.api.ledger.accounts.create({ name: values.name })

    // Initialize one-time deposit if provided
    if (values.initialCash && values.initialCash !== 0) {
      await window.api.ledger.oneTimeDeposits.create({
        accountId: account.id,
        amount: values.initialCash,
        date: new Date().toISOString().slice(0, 10),
        description: 'Initial balance'
      })
    }

    // Initialize regular deposit if provided
    if (values.regularDepositName && values.regularDepositAmount) {
      await window.api.ledger.regularDeposits.create({
        accountId: account.id,
        name: values.regularDepositName,
        amount: values.regularDepositAmount
      })
    }

    form.resetFields()
    setAddAccountOpen(false)
    message.success('Account created')
    await refreshAccounts()
  }

  const selectedAccountId =
    selectedKey.startsWith('account:') ? Number(selectedKey.split(':')[1]) : null

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider width={220}>
        <div style={{ color: 'white', padding: 16, fontSize: 16, fontWeight: 600 }}>
          Balance Tracker
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          onClick={(e) => setSelectedKey(e.key)}
          items={[
            { key: 'overview', label: 'Overview' },
            {
              type: 'group',
              label: 'Accounts',
              children: accounts.map((a) => ({ key: `account:${a.id}`, label: a.name }))
            }
          ]}
        />
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          style={{ margin: 16, width: 'calc(100% - 32px)' }}
          onClick={() => setAddAccountOpen(true)}
        >
          Add account
        </Button>
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', display: 'flex', alignItems: 'center' }}>
          <MonthNav month={month} onChange={setMonth} />
        </Header>
        <Content style={{ padding: 24, overflow: 'auto' }}>
          {selectedKey === 'overview' && <Overview month={month} />}
          {selectedAccountId !== null && (
            <AccountCalendar accountId={selectedAccountId} month={month} />
          )}
        </Content>
      </Layout>
      <Modal
        title="Add account"
        open={addAccountOpen}
        onOk={handleAddAccount}
        onCancel={() => setAddAccountOpen(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Account name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Checking" />
          </Form.Item>
          <Form.Item name="initialCash" label="Initial cash balance (optional)">
            <InputNumber style={{ width: '100%' }} placeholder="0" />
          </Form.Item>
          <Form.Item name="regularDepositName" label="Regular deposit name (optional)">
            <Input placeholder="e.g. Salary" />
          </Form.Item>
          <Form.Item name="regularDepositAmount" label="Regular deposit amount (optional)">
            <InputNumber style={{ width: '100%' }} placeholder="0" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  )
}

export default App
