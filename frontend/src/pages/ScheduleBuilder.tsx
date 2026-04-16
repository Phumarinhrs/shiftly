import { useState, useEffect } from 'react';
import {
  Button, Card, Select, Table, Tag, Modal, message,
  Space, Popconfirm, Badge, Spin, Empty, Typography,
  Tooltip, Input, Steps, Avatar, InputNumber,
} from 'antd';
import {
  PlusOutlined, ThunderboltOutlined, SendOutlined,
  EditOutlined, DeleteOutlined, BarChartOutlined,
  UserOutlined, TeamOutlined, CheckCircleOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable, pointerWithin,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import {
  schedulesApi, usersApi,
  type Schedule, type Shift, type ShiftCount,
} from '../api/schedules';

const { Title, Text } = Typography;

const SHIFT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  NIGHTSHIFT: { label: 'เวรดึก', color: 'purple' },
  OPD: { label: 'OPD', color: 'blue' },
  ER: { label: 'ER', color: 'red' },
  SPECIAL_CLINIC: { label: 'คลินิกพิเศษ', color: 'orange' },
};

const MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
  'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
  'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const DAY_NAMES = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

interface DoctorSlot {
  key: number;
  firstName: string;
  lastName: string;
}

// ── Drag & Drop Components ────────────────────────────────────────────────────

function DraggableTag({
  shiftId, userId, label, color, onClose,
}: {
  shiftId: string; userId: string; label: string; color: string;
  onClose: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${shiftId}::${userId}`,
    data: { shiftId, userId },
  });
  return (
    <Tag
      ref={setNodeRef}
      color={color}
      closable
      onClose={onClose}
      style={{
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.25 : 1,
        userSelect: 'none',
        transition: 'opacity 0.15s',
      }}
      {...listeners}
      {...attributes}
    >
      {label}
    </Tag>
  );
}

function DroppableCell({ shiftId, children }: { shiftId: string; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: shiftId, data: { shiftId } });
  return (
    <div
      ref={setNodeRef}
      style={{
        minHeight: 32,
        borderRadius: 6,
        background: isOver ? 'rgba(0,122,255,0.08)' : 'transparent',
        outline: isOver ? '2px dashed #007AFF' : 'none',
        transition: 'background 0.15s, outline 0.15s',
        padding: '2px 0',
      }}
    >
      {children}
    </div>
  );
}

export default function ScheduleBuilder() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [shiftCounts, setShiftCounts] = useState<ShiftCount[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCountModal, setShowCountModal] = useState(false);
  const [draggingInfo, setDraggingInfo] = useState<{ label: string; color: string } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [createMonth, setCreateMonth] = useState(new Date().getMonth() + 1);
  const [createYear, setCreateYear] = useState(new Date().getFullYear());
  const [doctorCount, setDoctorCount] = useState(0);
  const [doctorSlots, setDoctorSlots] = useState<DoctorSlot[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSchedules();
  }, []);

  const loadSchedules = async () => {
    try {
      const { data } = await schedulesApi.getAll();
      setSchedules(data);
    } catch {
      message.error('โหลดตารางเวรไม่สำเร็จ');
    }
  };

  const selectSchedule = async (id: string) => {
    setLoading(true);
    try {
      const { data } = await schedulesApi.getOne(id);
      setSelectedSchedule(data);
    } catch {
      message.error('โหลดตารางไม่สำเร็จ');
    }
    setLoading(false);
  };

  // ─── Create Modal ──────────────────────────────────────────────────────────

  const openCreateModal = () => {
    setCreateStep(0);
    setCreateMonth(new Date().getMonth() + 1);
    setCreateYear(new Date().getFullYear());
    setDoctorCount(0);
    setDoctorSlots([]);
    setShowCreateModal(true);
  };

  // เมื่อเปลี่ยนจำนวนแพทย์ → gen ช่องให้ตามจำนวน
  const handleDoctorCountChange = (val: number | null) => {
    const count = val ?? 0;
    setDoctorCount(count);
    setDoctorSlots((prev) => {
      if (count > prev.length) {
        // เพิ่มช่องใหม่
        const extras: DoctorSlot[] = Array.from({ length: count - prev.length }, (_, i) => ({
          key: Date.now() + i,
          firstName: '',
          lastName: '',
        }));
        return [...prev, ...extras];
      } else {
        // ตัดทิ้ง
        return prev.slice(0, count);
      }
    });
  };

  const updateSlot = (key: number, field: 'firstName' | 'lastName', val: string) => {
    setDoctorSlots((prev) =>
      prev.map((s) => (s.key === key ? { ...s, [field]: val } : s))
    );
  };

  const removeSlot = (key: number) => {
    setDoctorSlots((prev) => {
      const next = prev.filter((s) => s.key !== key);
      setDoctorCount(next.length);
      return next;
    });
  };

  const addOneSlot = () => {
    const newCount = doctorCount + 1;
    setDoctorCount(newCount);
    setDoctorSlots((prev) => [...prev, { key: Date.now(), firstName: '', lastName: '' }]);
  };

  const handleCreate = async () => {
    // ตรวจว่าทุกช่องมีชื่อ
    const filled = doctorSlots.filter((s) => s.firstName.trim());
    if (doctorSlots.length > 0 && filled.length < doctorSlots.length) {
      message.warning('กรุณาใส่ชื่อแพทย์ให้ครบทุกช่อง (หรือลบช่องที่ไม่ต้องการออก)');
      return;
    }

    setSaving(true);
    try {
      // สร้าง user ใหม่ทั้งหมดก่อน แล้วเก็บ ID
      const doctorIds: string[] = [];
      for (const slot of doctorSlots) {
        if (slot.firstName.trim()) {
          const { data: newUser } = await usersApi.create(slot.firstName.trim(), slot.lastName.trim());
          doctorIds.push(newUser.id);
        }
      }

      // สร้างตาราง พร้อม doctorIds ที่เพิ่งสร้าง
      const { data: schedule } = await schedulesApi.create(createMonth, createYear, doctorIds);

      message.success('สร้างตารางเวรสำเร็จ');
      setShowCreateModal(false);
      await loadSchedules();
      setSelectedSchedule(schedule);
    } catch (err: any) {
      message.error(err.response?.data?.message || 'สร้างไม่สำเร็จ');
    }
    setSaving(false);
  };

  // ─── Schedule Actions ──────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!selectedSchedule) return;
    setLoading(true);
    try {
      const { data } = await schedulesApi.generate(selectedSchedule.id);
      setSelectedSchedule(data);
      message.success('จัดเวรอัตโนมัติสำเร็จ');
    } catch {
      message.error('จัดเวรไม่สำเร็จ');
    }
    setLoading(false);
  };

  const handlePublish = async () => {
    if (!selectedSchedule) return;
    try {
      await schedulesApi.publish(selectedSchedule.id);
      setSelectedSchedule({ ...selectedSchedule, status: 'PUBLISHED' });
      message.success('เผยแพร่ตารางเวรแล้ว');
      loadSchedules();
    } catch {
      message.error('เผยแพร่ไม่สำเร็จ');
    }
  };

  const handleDelete = async () => {
    if (!selectedSchedule) return;
    try {
      await schedulesApi.remove(selectedSchedule.id);
      setSelectedSchedule(null);
      message.success('ลบตารางเวรแล้ว');
      loadSchedules();
    } catch {
      message.error('ลบไม่สำเร็จ');
    }
  };

  const handleAssign = async (shiftId: string, userId: string) => {
    if (!selectedSchedule) return;
    try {
      await schedulesApi.assignDoctor(selectedSchedule.id, shiftId, userId);
      await selectSchedule(selectedSchedule.id);
    } catch {
      message.error('มอบหมายไม่สำเร็จ');
    }
  };

  const handleUnassign = async (shiftId: string, userId: string) => {
    if (!selectedSchedule) return;
    try {
      await schedulesApi.unassignDoctor(selectedSchedule.id, shiftId, userId);
      await selectSchedule(selectedSchedule.id);
    } catch {
      message.error('ถอดหมอไม่สำเร็จ');
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { shiftId, userId } = event.active.data.current as { shiftId: string; userId: string };
    if (!selectedSchedule) return;
    const shift = selectedSchedule.shifts.find((s) => s.id === shiftId);
    const user = shift?.assignments.find((a) => a.user.id === userId)?.user;
    if (shift && user) {
      setDraggingInfo({
        label: `${user.firstName} ${user.lastName.charAt(0)}.`,
        color: SHIFT_TYPE_LABELS[shift.shiftType]?.color ?? 'blue',
      });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setDraggingInfo(null);
    const { active, over } = event;
    if (!over || !selectedSchedule) return;

    const { shiftId: fromShiftId, userId } = active.data.current as { shiftId: string; userId: string };
    const toShiftId = (over.data.current as { shiftId: string })?.shiftId ?? String(over.id);
    if (fromShiftId === toShiftId) return;

    const toShift = selectedSchedule.shifts.find((s) => s.id === toShiftId);
    const swapUserId = toShift?.assignments[0]?.user.id;

    setLoading(true);
    try {
      // ถอดออกจากเวรเดิม
      await schedulesApi.unassignDoctor(selectedSchedule.id, fromShiftId, userId);
      if (swapUserId) {
        // มีคนอยู่แล้ว → สลับ
        await schedulesApi.unassignDoctor(selectedSchedule.id, toShiftId, swapUserId);
        await schedulesApi.assignDoctor(selectedSchedule.id, fromShiftId, swapUserId);
      }
      // ใส่เข้าเวรใหม่
      await schedulesApi.assignDoctor(selectedSchedule.id, toShiftId, userId);
      await selectSchedule(selectedSchedule.id);
      message.success(swapUserId ? 'สลับเวรแล้ว' : 'ย้ายเวรแล้ว');
    } catch {
      message.error('ย้ายเวรไม่สำเร็จ');
      await selectSchedule(selectedSchedule.id);
    }
    setLoading(false);
  };

  const handleShowCount = async () => {
    if (!selectedSchedule) return;
    try {
      const { data } = await schedulesApi.getShiftCount(selectedSchedule.id);
      setShiftCounts(data);
      setShowCountModal(true);
    } catch {
      message.error('โหลดข้อมูลไม่สำเร็จ');
    }
  };

  // ─── Table ─────────────────────────────────────────────────────────────────

  const groupShiftsByDate = (shifts: Shift[]) => {
    const grouped = new Map<string, Shift[]>();
    for (const shift of shifts) {
      if (!grouped.has(shift.date)) grouped.set(shift.date, []);
      grouped.get(shift.date)!.push(shift);
    }
    return Array.from(grouped.entries()).map(([date, shifts]) => ({ date, shifts }));
  };

  const tableData = selectedSchedule ? groupShiftsByDate(selectedSchedule.shifts) : [];

  const columns: ColumnsType<{ date: string; shifts: Shift[] }> = [
    {
      title: 'วันที่',
      dataIndex: 'date',
      width: 80,
      fixed: 'left',
      className: 'date-cell',
      render: (date: string) => {
        const d = new Date(date);
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        const day = parseInt(date.split('-')[2]);
        return (
          <span style={{ color: isWeekend ? '#f5222d' : undefined, fontWeight: 600 }}>
            {DAY_NAMES[d.getDay()]} {day}
          </span>
        );
      },
    },
    ...(['NIGHTSHIFT', 'OPD', 'ER', 'SPECIAL_CLINIC'] as const).map((type) => ({
      title: <Tag color={SHIFT_TYPE_LABELS[type].color}>{SHIFT_TYPE_LABELS[type].label}</Tag>,
      key: type,
      width: 180,
      className: 'shift-cell',
      render: (_: unknown, record: { date: string; shifts: Shift[] }) => {
        const shift = record.shifts.find((s) => s.shiftType === type);
        if (!shift) return <span style={{ color: '#ddd' }}>-</span>;
        const assigned = shift.assignments[0];
        if (assigned) {
          return (
            <DroppableCell shiftId={shift.id}>
              <DraggableTag
                shiftId={shift.id}
                userId={assigned.user.id}
                label={`${assigned.user.firstName} ${assigned.user.lastName.charAt(0)}.`}
                color={SHIFT_TYPE_LABELS[type].color}
                onClose={(e) => { e.preventDefault(); handleUnassign(shift.id, assigned.user.id); }}
              />
            </DroppableCell>
          );
        }
        return (
          <DroppableCell shiftId={shift.id}>
          <Select
            placeholder="เลือกแพทย์"
            size="small"
            style={{ width: '100%' }}
            onChange={(userId) => handleAssign(shift.id, userId)}
            options={(selectedSchedule?.doctors ?? []).map(({ user }) => ({
              label: `${user.firstName} ${user.lastName}`,
              value: user.id,
            }))}
            showSearch
            filterOption={(input, option) =>
              (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
            }
          />
          </DroppableCell>
        );
      },
    })),
  ];

  const countColumns: ColumnsType<ShiftCount> = [
    { title: 'แพทย์', render: (_, r) => `${r.user.firstName} ${r.user.lastName}` },
    { title: 'เวรดึก', dataIndex: 'NIGHTSHIFT', align: 'center' },
    { title: 'OPD', dataIndex: 'OPD', align: 'center' },
    { title: 'ER', dataIndex: 'ER', align: 'center' },
    { title: 'คลินิกพิเศษ', dataIndex: 'SPECIAL_CLINIC', align: 'center' },
    { title: 'รวม', dataIndex: 'total', align: 'center', render: (v: number) => <strong>{v}</strong> },
  ];

  const allFilled = doctorSlots.length > 0 && doctorSlots.every((s) => s.firstName.trim());

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>จัดตารางเวร</Title>
        <Space>
          <Select
            placeholder="เลือกตารางเวร"
            style={{ width: 260 }}
            value={selectedSchedule?.id}
            onChange={selectSchedule}
            options={schedules.map((s) => ({
              label: `${s.title} ${s.status === 'PUBLISHED' ? '✅' : '📝'}`,
              value: s.id,
            }))}
          />
          <Button icon={<PlusOutlined />} onClick={openCreateModal}>
            สร้างตารางใหม่
          </Button>
        </Space>
      </div>

      {/* Schedule Table */}
      {selectedSchedule ? (
        <Spin spinning={loading}>
          <Card
            title={
              <Space>
                <span>{selectedSchedule.title}</span>
                <Badge
                  status={selectedSchedule.status === 'PUBLISHED' ? 'success' : 'default'}
                  text={selectedSchedule.status === 'PUBLISHED' ? 'เผยแพร่แล้ว' : 'แบบร่าง'}
                />
                <Text type="secondary" style={{ fontSize: 13 }}>
                  ({selectedSchedule.doctors?.length ?? 0} แพทย์)
                </Text>
              </Space>
            }
            extra={
              <Space>
                <Button icon={<BarChartOutlined />} onClick={handleShowCount}>สัดส่วนเวร</Button>
                <Button icon={<ThunderboltOutlined />} onClick={handleGenerate}>
                  จัดเวรอัตโนมัติ
                </Button>
                {selectedSchedule.status === 'DRAFT' ? (
                  <Button icon={<SendOutlined />} onClick={handlePublish}>Publish</Button>
                ) : (
                  <Button icon={<EditOutlined />} onClick={async () => {
                    await schedulesApi.unpublish(selectedSchedule.id);
                    setSelectedSchedule({ ...selectedSchedule, status: 'DRAFT' });
                    loadSchedules();
                  }}>Unpublish</Button>
                )}
                <Popconfirm title="ลบตารางเวรนี้?" onConfirm={handleDelete} okText="ลบ" cancelText="ยกเลิก">
                  <Button icon={<DeleteOutlined />} danger />
                </Popconfirm>
              </Space>
            }
          >
            <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <Table
                dataSource={tableData}
                columns={columns}
                rowKey="date"
                pagination={false}
                scroll={{ x: 900 }}
                size="small"
                bordered
              />
              <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
                {draggingInfo && (
                  <Tag color={draggingInfo.color} style={{ cursor: 'grabbing', boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
                    {draggingInfo.label}
                  </Tag>
                )}
              </DragOverlay>
            </DndContext>
          </Card>
        </Spin>
      ) : (
        <Empty description="เลือกตารางเวร หรือสร้างใหม่" />
      )}

      {/* ─── Create Modal (2 Steps) ─────────────────────────────────────── */}
      <Modal
        title="สร้างตารางเวรใหม่"
        open={showCreateModal}
        onCancel={() => setShowCreateModal(false)}
        width={580}
        footer={
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Button onClick={() => setShowCreateModal(false)}>ยกเลิก</Button>
            <Space>
              {createStep === 1 && (
                <Button onClick={() => setCreateStep(0)}>← ย้อนกลับ</Button>
              )}
              {createStep === 0 ? (
                <Button onClick={() => setCreateStep(1)}>
                  ถัดไป: จัดทีมแพทย์ →
                </Button>
              ) : (
                <Button
                  icon={<CheckCircleOutlined />}
                  onClick={handleCreate}
                  loading={saving}
                  disabled={doctorSlots.length > 0 && !allFilled}
                >
                  สร้างตาราง
                  {doctorSlots.length > 0 ? ` (${doctorSlots.length} แพทย์)` : ''}
                </Button>
              )}
            </Space>
          </Space>
        }
      >
        <Steps
          current={createStep}
          size="small"
          style={{ marginBottom: 24 }}
          items={[
            { title: 'เลือกเดือน', icon: <CheckCircleOutlined /> },
            { title: 'จัดทีมแพทย์', icon: <TeamOutlined /> },
          ]}
        />

        {/* ── Step 1: เดือน/ปี ── */}
        {createStep === 0 && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
              เลือกเดือนและปีที่จะสร้างตารางเวร
            </Text>
            <Space size="large">
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>เดือน</div>
                <Select
                  style={{ width: 160 }}
                  value={createMonth}
                  onChange={setCreateMonth}
                  options={MONTHS.map((m, i) => ({ label: m, value: i + 1 }))}
                  size="large"
                />
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>ปี</div>
                <Select
                  style={{ width: 120 }}
                  value={createYear}
                  onChange={setCreateYear}
                  options={[2025, 2026, 2027, 2028].map((y) => ({ label: `${y}`, value: y }))}
                  size="large"
                />
              </div>
            </Space>
            <div style={{ marginTop: 24, padding: 14, background: '#f0f4ff', borderRadius: 8 }}>
              <Text strong style={{ fontSize: 16 }}>
                📅 ตารางเวร{MONTHS[createMonth - 1]} {createYear}
              </Text>
            </div>
          </div>
        )}

        {/* ── Step 2: จำนวนแพทย์ + กรอกชื่อ ── */}
        {createStep === 1 && (
          <div>
            {/* ตั้งจำนวน */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: '16px 20px', background: '#f9f9f9',
              borderRadius: 8, marginBottom: 20,
            }}>
              <TeamOutlined style={{ fontSize: 22, color: '#4472C4' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>จำนวนแพทย์ในทีม</div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  ระบบจะสร้างช่องกรอกชื่อให้อัตโนมัติ
                </Text>
              </div>
              <InputNumber
                min={0}
                max={50}
                value={doctorCount}
                onChange={handleDoctorCountChange}
                size="large"
                style={{ width: 100, fontWeight: 700, fontSize: 20 }}
                controls
              />
            </div>

            {/* ช่องกรอกชื่อ */}
            {doctorSlots.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '32px 0',
                color: '#aaa', border: '2px dashed #e0e0e0',
                borderRadius: 8,
              }}>
                <UserOutlined style={{ fontSize: 32, marginBottom: 8 }} />
                <div>กำหนดจำนวนแพทย์ด้านบน</div>
                <div style={{ fontSize: 12 }}>หรือ</div>
                <Button type="link" onClick={() => handleDoctorCountChange(1)}>
                  + เพิ่มคนแรก
                </Button>
              </div>
            ) : (
              <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                {doctorSlots.map((slot, idx) => (
                  <div
                    key={slot.key}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    <Avatar
                      size="small"
                      style={{ background: '#4472C4', flexShrink: 0, fontSize: 11 }}
                    >
                      {idx + 1}
                    </Avatar>
                    <Input
                      placeholder="ชื่อ *"
                      value={slot.firstName}
                      onChange={(e) => updateSlot(slot.key, 'firstName', e.target.value)}
                      style={{ flex: '0 0 38%' }}
                      status={!slot.firstName.trim() ? 'error' : ''}
                    />
                    <Input
                      placeholder="นามสกุล"
                      value={slot.lastName}
                      onChange={(e) => updateSlot(slot.key, 'lastName', e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <Button
                      type="text"
                      icon={<MinusCircleOutlined />}
                      danger
                      onClick={() => removeSlot(slot.key)}
                      style={{ flexShrink: 0 }}
                    />
                  </div>
                ))}

                {/* ปุ่มเพิ่มแถว */}
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  block
                  onClick={addOneSlot}
                  style={{ marginTop: 4 }}
                >
                  เพิ่มแพทย์อีกคน
                </Button>
              </div>
            )}

            {/* Summary */}
            {doctorSlots.length > 0 && (
              <div style={{
                marginTop: 16, padding: '8px 12px',
                background: allFilled ? '#f6ffed' : '#fff7e6',
                borderRadius: 6, fontSize: 13,
                border: `1px solid ${allFilled ? '#b7eb8f' : '#ffd591'}`,
              }}>
                {allFilled
                  ? `✅ พร้อมสร้างตาราง — แพทย์ ${doctorSlots.length} คน`
                  : `⚠️ กรุณาใส่ชื่อให้ครบทุกช่อง (${doctorSlots.filter(s => s.firstName.trim()).length}/${doctorSlots.length})`}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Shift Count Modal */}
      <Modal
        title="สัดส่วนเวร"
        open={showCountModal}
        onCancel={() => setShowCountModal(false)}
        footer={null}
        width={700}
      >
        <Table
          dataSource={shiftCounts}
          columns={countColumns}
          rowKey={(r) => r.user.id}
          pagination={false}
          size="small"
        />
      </Modal>
    </div>
  );
}
