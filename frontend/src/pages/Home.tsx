import { Card, Col, Row, Typography } from 'antd';
import {
  CalendarOutlined,
  SwapOutlined,
  FileTextOutlined,
  ShareAltOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;

type Page = 'home' | 'schedule';

interface Props {
  onNavigate: (page: Page) => void;
}

const features = [
  {
    icon: <CalendarOutlined style={{ fontSize: 36, color: '#007AFF' }} />,
    title: 'ตารางเวร',
    desc: 'สร้างและจัดตารางเวรรายเดือน จัดเวรอัตโนมัติ',
    page: 'schedule' as Page,
    ready: true,
    accent: 'rgba(0,122,255,0.08)',
  },
  {
    icon: <SwapOutlined style={{ fontSize: 36, color: '#34C759' }} />,
    title: 'ขอแลกเวร',
    desc: 'ส่งคำขอแลกเวรกับเพื่อนร่วมทีม',
    page: 'home' as Page,
    ready: false,
    accent: 'rgba(52,199,89,0.08)',
  },
  {
    icon: <FileTextOutlined style={{ fontSize: 36, color: '#FF9500' }} />,
    title: 'แจ้งลาฉุกเฉิน',
    desc: 'รายงานการลาและหาคนทดแทน',
    page: 'home' as Page,
    ready: false,
    accent: 'rgba(255,149,0,0.08)',
  },
  {
    icon: <ShareAltOutlined style={{ fontSize: 36, color: '#AF52DE' }} />,
    title: 'แชร์ตาราง',
    desc: 'สร้าง link ให้พยาบาล / การเงินดูตาราง',
    page: 'home' as Page,
    ready: false,
    accent: 'rgba(175,82,222,0.08)',
  },
];

export default function Home({ onNavigate }: Props) {
  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '56px 24px 40px' }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: 52 }}>
        <Title
          style={{
            fontSize: 42,
            fontWeight: 700,
            letterSpacing: -1,
            color: '#1d1d1f',
            marginBottom: 10,
          }}
        >
          Shiftly
        </Title>
        <Text style={{ fontSize: 17, color: '#6e6e73', fontWeight: 400 }}>
          ระบบจัดตารางเวรสำหรับทีมแพทย์
        </Text>
      </div>

      {/* Feature Cards */}
      <Row gutter={[16, 16]}>
        {features.map((f) => (
          <Col span={12} key={f.title}>
            <Card
              hoverable={f.ready}
              onClick={() => f.ready && onNavigate(f.page)}
              style={{
                cursor: f.ready ? 'pointer' : 'default',
                opacity: f.ready ? 1 : 0.55,
                height: '100%',
                textAlign: 'center',
                padding: '8px 0',
              }}
            >
              {/* Icon bg */}
              <div style={{
                width: 72, height: 72,
                borderRadius: 20,
                background: f.accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                {f.icon}
              </div>

              <Title level={5} style={{ marginBottom: 6, fontSize: 16, color: '#1d1d1f' }}>
                {f.title}
              </Title>
              <Text style={{ fontSize: 13, color: '#6e6e73', lineHeight: 1.5 }}>
                {f.desc}
              </Text>

              {!f.ready && (
                <div style={{ marginTop: 10 }}>
                  <Text style={{ fontSize: 11, color: '#aeaeb2' }}>เร็วๆ นี้</Text>
                </div>
              )}
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
