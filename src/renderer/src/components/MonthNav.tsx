import { Button, DatePicker, Space } from 'antd'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { addMonths, monthKey, monthLabel } from '../lib/month'

interface Props {
  month: string
  onChange: (month: string) => void
}

function MonthNav({ month, onChange }: Props): JSX.Element {
  return (
    <Space>
      <Button icon={<LeftOutlined />} onClick={() => onChange(addMonths(month, -1))} />
      <DatePicker
        picker="month"
        value={dayjs(`${month}-01`)}
        onChange={(value) => value && onChange(monthKey(value.toDate()))}
        allowClear={false}
      />
      <Button icon={<RightOutlined />} onClick={() => onChange(addMonths(month, 1))} />
      <Button onClick={() => onChange(monthKey(new Date()))}>Today</Button>
      <span style={{ marginLeft: 8, fontWeight: 500 }}>{monthLabel(month)}</span>
    </Space>
  )
}

export default MonthNav
