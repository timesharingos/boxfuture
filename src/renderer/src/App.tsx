import { Layout, Typography } from 'antd'

const { Header, Content } = Layout

function App(): JSX.Element {
  return (
    <Layout style={{ height: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center' }}>
        <Typography.Title level={3} style={{ color: 'white', margin: 0 }}>
          Balance Tracker
        </Typography.Title>
      </Header>
      <Content style={{ padding: 24 }}>
        <Typography.Paragraph>Project initialized. Features coming soon.</Typography.Paragraph>
      </Content>
    </Layout>
  )
}

export default App
