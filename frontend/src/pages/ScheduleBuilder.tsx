import { useState, useEffect, useRef } from 'react';
import {
  Button, Card, Select, Table, Tag, Modal, message,
  Space, Popconfirm, Badge, Spin, Typography,
  Input, InputNumber,
} from 'antd';
import {
  PlusOutlined, ThunderboltOutlined,
  DeleteOutlined, BarChartOutlined,
  MinusCircleOutlined,
  LinkOutlined, CheckCircleFilled, ClockCircleOutlined,
  HistoryOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable, pointerWithin,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import { toPng } from 'html-to-image';
import {
  schedulesApi, usersApi,
  type Schedule, type Shift, type ShiftCount, type ActivityLog,
} from '../api/schedules';

const { Title, Text } = Typography;

const SHIFT_COLORS = ['purple', 'blue', 'red', 'orange', 'green', 'cyan', 'magenta', 'volcano', 'gold', 'geekblue'];

// 0=อา 1=จ 2=อ 3=พ 4=พฤ 5=ศ 6=ส
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 0]; // เรียงแสดง จ–ส–อา
const DAY_LABELS: Record<number, string> = { 0: 'อา', 1: 'จ', 2: 'อ', 3: 'พ', 4: 'พฤ', 5: 'ศ', 6: 'ส' };

const DEFAULT_SHIFT_TYPES: { name: string; days: number[] }[] = [
  { name: '', days: [] },
];

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

interface ShiftTypeSlot {
  key: number;
  name: string;
  days: number[]; // 0=อา,1=จ,2=อ,3=พ,4=พฤ,5=ศ,6=ส
}

// ── Drag & Drop Components ────────────────────────────────────────────────────

function DraggableTag({
  shiftId, userId, label, color, onClose, locked,
}: {
  shiftId: string; userId: string; label: string; color: string;
  onClose: (e: React.MouseEvent) => void;
  locked?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${shiftId}::${userId}`,
    data: { shiftId, userId },
    disabled: locked,
  });
  return (
    <Tag
      ref={setNodeRef}
      color={color}
      closable={!locked}
      onClose={onClose}
      style={{
        cursor: locked ? 'default' : isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.25 : 1,
        userSelect: 'none',
        transition: 'opacity 0.15s',
      }}
      {...(locked ? {} : { ...listeners, ...attributes })}
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
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [showLogModal, setShowLogModal] = useState(false);
  const [draggingInfo, setDraggingInfo] = useState<{ label: string; color: string } | null>(null);

  // ── Identity (persisted in localStorage) ── ใช้ระบุว่า "ฉันคือใคร" สำหรับการ stamp
  const [myUserId, setMyUserId] = useState<string | null>(() => localStorage.getItem('shiftly:myUserId'));
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (myUserId) localStorage.setItem('shiftly:myUserId', myUserId);
    else localStorage.removeItem('shiftly:myUserId');
  }, [myUserId]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [createMonth, setCreateMonth] = useState(new Date().getMonth() + 1);
  const [createYear, setCreateYear] = useState(new Date().getFullYear());
  const [shiftTypeSlots, setShiftTypeSlots] = useState<ShiftTypeSlot[]>([]);
  const [doctorSlots, setDoctorSlots] = useState<DoctorSlot[]>([]);
  const [countKey, setCountKey] = useState(0); // bump to remount InputNumber when +/- used
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSchedules();
  }, []);

  // ── Hash routing: #/schedule/{id} → auto-open
  useEffect(() => {
    const handleHash = async () => {
      const m = window.location.hash.match(/^#\/schedule\/([\w-]+)/);
      if (m) {
        const id = m[1];
        if (selectedSchedule?.id !== id) {
          try {
            const { data } = await schedulesApi.getOne(id);
            setSelectedSchedule(data);
          } catch {
            // schedule not found — fall back to list
            window.location.hash = '';
          }
        }
      } else if (selectedSchedule) {
        setSelectedSchedule(null);
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync hash เฉพาะเมื่อเลือก schedule (ไม่ clear ตอน null เพื่อไม่ทับ initial hash routing)
  useEffect(() => {
    if (selectedSchedule) {
      const expected = `#/schedule/${selectedSchedule.id}`;
      if (window.location.hash !== expected) {
        window.location.hash = expected;
      }
    }
  }, [selectedSchedule]);

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
    setShiftTypeSlots(DEFAULT_SHIFT_TYPES.map((t, i) => ({ key: i, name: t.name, days: [...t.days] })));
    setDoctorSlots([]);
    setCountKey(0);
    setShowCreateModal(true);
  };

  const shiftTypeFirstRef = useRef<any>(null);
  const tableExportRef = useRef<HTMLDivElement>(null);
  const doctorFormRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doctorCountRef = useRef<any>(null);

  // Auto-focus input รูปแบบเวร เมื่อเข้า Step 2
  useEffect(() => {
    if (createStep === 1) {
      setTimeout(() => shiftTypeFirstRef.current?.focus(), 80);
    }
  }, [createStep]);

  // Auto-focus จำนวนแพทย์ เมื่อเข้า Step 3
  useEffect(() => {
    if (createStep === 2) {
      setTimeout(() => doctorCountRef.current?.focus(), 100);
    }
  }, [createStep]);

  const focusNextInput = (currentIdx: number, currentField: 'firstName' | 'lastName') => {
    const container = doctorFormRef.current;
    if (!container) return;

    let nextSelector: string;
    if (currentField === 'firstName') {
      // ชื่อ → นามสกุล (same row)
      nextSelector = `[data-slot="${currentIdx}-lastName"]`;
    } else {
      // นามสกุล → ชื่อ (next row)
      nextSelector = `[data-slot="${currentIdx + 1}-firstName"]`;
    }

    // Ant Design Input: data-slot goes on the <input> element directly
    const next = container.querySelector<HTMLInputElement>(nextSelector);
    if (next) {
      next.focus();
      next.select();
    }
  };

  const updateSlot = (key: number, field: 'firstName' | 'lastName', val: string) => {
    setDoctorSlots((prev) =>
      prev.map((s) => (s.key === key ? { ...s, [field]: val } : s))
    );
  };

  const handleDoctorCountChange = (val: number | null) => {
    if (val === null) return;
    setDoctorSlots((prev) => {
      if (val > prev.length) {
        const extras: DoctorSlot[] = Array.from({ length: val - prev.length }, (_, i) => ({
          key: Date.now() + i, firstName: '', lastName: '',
        }));
        return [...prev, ...extras];
      }
      return prev.slice(0, val);
    });
  };

  const removeSlot = (key: number) => {
    setDoctorSlots((prev) => prev.filter((s) => s.key !== key));
    setCountKey((k) => k + 1); // remount InputNumber to show updated count
  };

  const addOneSlot = () => {
    setDoctorSlots((prev) => [...prev, { key: Date.now(), firstName: '', lastName: '' }]);
    setCountKey((k) => k + 1); // remount InputNumber to show updated count
  };

  const handleCreate = async () => {
    // ตรวจว่ารูปแบบเวรครบ
    if (shiftTypeSlots.length === 0) {
      message.warning('กรุณาเพิ่มรูปแบบเวรอย่างน้อย 1 ประเภท');
      return;
    }
    if (shiftTypeSlots.some((s) => !s.name.trim())) {
      message.warning('กรุณาใส่ชื่อเวรให้ครบทุกช่อง');
      return;
    }
    // ตรวจว่าทุกช่องมีชื่อแพทย์
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

      // สร้างตาราง พร้อม doctorIds + shiftTypes
      const { data: schedule } = await schedulesApi.create(
        createMonth, createYear, doctorIds,
        shiftTypeSlots.map((s) => ({ name: s.name.trim(), days: s.days })),
      );

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

  const handleDelete = async () => {
    if (!selectedSchedule) return;
    try {
      await schedulesApi.remove(selectedSchedule.id);
      setSelectedSchedule(null);
      window.location.hash = '';
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
        color: doctorColorMap.get(userId) ?? '#999',
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

  const handleShowLogs = async () => {
    if (!selectedSchedule) return;
    try {
      const { data } = await schedulesApi.getLogs(selectedSchedule.id);
      setActivityLogs(data);
      setShowLogModal(true);
    } catch {
      message.error('โหลด log ไม่สำเร็จ');
    }
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

  // ─── Stamp / Confirm (Notion-style) ───────────────────────────────────────

  const myDoctorRecord = selectedSchedule?.doctors?.find((d) => d.user.id === myUserId);
  const myConfirmedAt = myDoctorRecord?.confirmedAt;
  const confirmedCount = selectedSchedule?.doctors?.filter((d) => d.confirmedAt).length ?? 0;
  const totalDoctors = selectedSchedule?.doctors?.length ?? 0;

  const handleToggleConfirm = async () => {
    if (!selectedSchedule || !myUserId) return;
    setConfirming(true);
    try {
      await schedulesApi.toggleConfirm(selectedSchedule.id, myUserId);
      const { data: fresh } = await schedulesApi.getOne(selectedSchedule.id);

      // Auto-publish เมื่อทุกคนยืนยันครบ, auto-draft เมื่อมีคนยกเลิก
      const allConfirmed =
        fresh.doctors.length > 0 &&
        fresh.doctors.every((d) => d.confirmedAt);

      if (allConfirmed && fresh.status !== 'PUBLISHED') {
        await schedulesApi.publish(fresh.id);
        const { data: published } = await schedulesApi.getOne(fresh.id);
        setSelectedSchedule(published);
        loadSchedules();
        message.success('ทุกคนยืนยันครบแล้ว — ตารางเวรสมบูรณ์ 🎉');
      } else if (!allConfirmed && fresh.status === 'PUBLISHED') {
        await schedulesApi.unpublish(fresh.id);
        const { data: drafted } = await schedulesApi.getOne(fresh.id);
        setSelectedSchedule(drafted);
        loadSchedules();
        message.info(myConfirmedAt ? 'ยกเลิกยืนยันแล้ว — ตารางกลับเป็นแบบร่าง' : 'ยืนยันเวรเรียบร้อย ✓');
      } else {
        setSelectedSchedule(fresh);
        message.success(myConfirmedAt ? 'ยกเลิกยืนยันแล้ว' : 'ยืนยันเวรเรียบร้อย ✓');
      }
    } catch {
      message.error('บันทึกไม่สำเร็จ');
    }
    setConfirming(false);
  };

  const handleCopyLink = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      message.success('คัดลอกลิ้งค์แล้ว — ส่งให้แพทย์ผ่าน LINE ได้เลย');
    } catch {
      message.error('คัดลอกไม่สำเร็จ');
    }
  };

  const handleExportPng = async () => {
    const el = tableExportRef.current;
    if (!el || !selectedSchedule) return;
    try {
      message.loading({ content: 'กำลังสร้างรูป...', key: 'export' });
      const dataUrl = await toPng(el, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        style: { padding: '16px' },
      });
      const link = document.createElement('a');
      link.download = `${selectedSchedule.title}.png`;
      link.href = dataUrl;
      link.click();
      message.success({ content: 'ดาวน์โหลดเรียบร้อย', key: 'export' });
    } catch {
      message.error({ content: 'สร้างรูปไม่สำเร็จ', key: 'export' });
    }
  };

  // ─── Table ─────────────────────────────────────────────────────────────────

  // ─── Doctor color map (แต่ละคนมีสีเฉพาะตัว) ──────────────────────────────
  const DOCTOR_COLORS = [
    '#4A90D9', '#E06C75', '#98C379', '#C678DD', '#D19A66',
    '#56B6C2', '#BE5046', '#7C3AED', '#E5C07B', '#61AFEF',
    '#F472B6', '#34D399', '#FB923C', '#818CF8', '#A78BFA',
  ];
  const doctorColorMap = new Map<string, string>();
  (selectedSchedule?.doctors ?? []).forEach((d, i) => {
    doctorColorMap.set(d.user.id, DOCTOR_COLORS[i % DOCTOR_COLORS.length]);
  });

  const isLocked = selectedSchedule?.status === 'PUBLISHED';

  const groupShiftsByDate = (shifts: Shift[]) => {
    const grouped = new Map<string, Shift[]>();
    for (const shift of shifts) {
      if (!grouped.has(shift.date)) grouped.set(shift.date, []);
      grouped.get(shift.date)!.push(shift);
    }
    return Array.from(grouped.entries()).map(([date, shifts]) => ({ date, shifts }));
  };

  const tableData = selectedSchedule ? groupShiftsByDate(selectedSchedule.shifts) : [];

  const scheduleShiftTypes = selectedSchedule?.shiftTypes ?? [];

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
    ...scheduleShiftTypes.map((st, idx) => {
      const headerColor = SHIFT_COLORS[idx % SHIFT_COLORS.length];
      return {
        title: <Tag color={headerColor}>{st.name}</Tag>,
        key: st.name,
        width: 180,
        className: 'shift-cell',
        render: (_: unknown, record: { date: string; shifts: Shift[] }) => {
          const shift = record.shifts.find((s) => s.shiftType === st.name);
          if (!shift) return <span style={{ color: '#ddd' }}>-</span>;
          const assigned = shift.assignments[0];
          if (assigned) {
            const isMine = assigned.user.id === myUserId;
            const docColor = doctorColorMap.get(assigned.user.id) ?? '#999';
            return (
              <DroppableCell shiftId={shift.id}>
                <div style={isMine ? {
                  display: 'inline-block',
                  padding: 2,
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, rgba(0,122,255,0.18), rgba(0,122,255,0.08))',
                  boxShadow: '0 0 0 1px rgba(0,122,255,0.35)',
                } : undefined}>
                  <DraggableTag
                    shiftId={shift.id}
                    userId={assigned.user.id}
                    label={`${assigned.user.firstName} ${assigned.user.lastName.charAt(0)}.`}
                    color={docColor}
                    locked={isLocked}
                    onClose={(e) => { e.preventDefault(); handleUnassign(shift.id, assigned.user.id); }}
                  />
                </div>
              </DroppableCell>
            );
          }
          if (isLocked) return <span style={{ color: '#ddd' }}>-</span>;
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
      };
    }),
  ];

  const countColumns: ColumnsType<ShiftCount> = [
    { title: 'แพทย์', render: (_, r) => `${(r.user as any).firstName} ${(r.user as any).lastName}` },
    ...scheduleShiftTypes.map((st) => ({
      title: st.name,
      dataIndex: st.name,
      align: 'center' as const,
      render: (v: unknown) => (v as number) ?? 0,
    })),
    { title: 'รวม', dataIndex: 'total', align: 'center' as const, render: (v: number) => <strong>{v}</strong> },
  ];

  const allFilled = doctorSlots.length > 0 && doctorSlots.every((s) => s.firstName.trim());

  const formatDate = (iso?: string) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const viewRef = useRef<HTMLDivElement>(null);

  const animateView = (goingIn: boolean) => {
    const el = viewRef.current;
    if (!el) return;
    el.animate(
      [
        {
          opacity: 0,
          transform: goingIn
            ? 'translateX(20px) scale(0.984)'
            : 'translateX(-12px) scale(0.992)',
        },
        { opacity: 1, transform: 'translateX(0) scale(1)' },
      ],
      { duration: 300, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', fill: 'forwards' }
    );
  };

  // Animate on mount (initial list view)
  useEffect(() => { animateView(false); }, []);

  // Animate on view switch
  const prevSelectedId = useRef<string | null>(null);
  useEffect(() => {
    if (prevSelectedId.current === (selectedSchedule?.id ?? null)) return;
    prevSelectedId.current = selectedSchedule?.id ?? null;
    animateView(!!selectedSchedule);
  }, [selectedSchedule]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px 32px' }}>

      <div ref={viewRef} style={{ opacity: 0 }}>

      {/* ── Detail view ── */}
      {selectedSchedule ? (
        <>
          {/* Breadcrumb header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Space>
              <Button
                type="text"
                size="small"
                onClick={() => {
                  setSelectedSchedule(null);
                  window.location.hash = '';
                }}
                style={{ color: '#007AFF', padding: '0 4px', fontWeight: 500 }}
              >
                ← ตารางเวร
              </Button>
              <Text type="secondary" style={{ fontSize: 13 }}>/</Text>
              <Text style={{ fontSize: 13, fontWeight: 500 }}>{selectedSchedule.title}</Text>
              <Badge
                status={selectedSchedule.status === 'PUBLISHED' ? 'success' : 'default'}
                text={selectedSchedule.status === 'PUBLISHED' ? 'สมบูรณ์' : 'แบบร่าง'}
                style={{ fontSize: 12 }}
              />
            </Space>
            <Space>
              <Button icon={<LinkOutlined />} onClick={handleCopyLink}>คัดลอกลิ้งค์</Button>
              <Button icon={<DownloadOutlined />} onClick={handleExportPng}>Export PNG</Button>
              <Button icon={<BarChartOutlined />} onClick={handleShowCount}>สัดส่วนเวร</Button>
              <Button icon={<HistoryOutlined />} onClick={handleShowLogs}>ประวัติ</Button>
              <Button icon={<ThunderboltOutlined />} onClick={handleGenerate}>จัดเวรอัตโนมัติ</Button>
              <Popconfirm title="ลบตารางเวรนี้?" onConfirm={handleDelete} okText="ลบ" cancelText="ยกเลิก">
                <Button icon={<DeleteOutlined />} danger />
              </Popconfirm>
            </Space>
          </div>

          {/* ── Confirmation panel (Notion-style stamp) ── */}
          <Card
            size="small"
            style={{ marginBottom: 16, background: 'rgba(255,255,255,0.7)' }}
            styles={{ body: { padding: '12px 16px' } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              {/* Identity picker */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text type="secondary" style={{ fontSize: 13 }}>👤 ฉันคือ</Text>
                <Select
                  size="small"
                  placeholder="เลือกชื่อตัวเอง"
                  style={{ minWidth: 180 }}
                  value={myUserId ?? undefined}
                  onChange={(v) => setMyUserId(v)}
                  allowClear
                  onClear={() => setMyUserId(null)}
                  options={(selectedSchedule.doctors ?? []).map(({ user }) => ({
                    label: `${user.firstName} ${user.lastName}`,
                    value: user.id,
                  }))}
                />
              </div>

              {/* Stamp button — ซ่อนหลังยืนยันแล้ว */}
              {myDoctorRecord && !myConfirmedAt && (
                <Button
                  type="primary"
                  size="small"
                  icon={<CheckCircleFilled />}
                  loading={confirming}
                  onClick={handleToggleConfirm}
                >
                  ยืนยันเวรของฉัน
                </Button>
              )}

              {/* Spacer */}
              <div style={{ flex: 1 }} />

              {/* Team status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: 500 }}>
                  ยืนยันแล้ว <span style={{ color: '#007AFF', fontWeight: 700 }}>{confirmedCount}</span>
                  <span style={{ color: '#999' }}>/{totalDoctors}</span>
                </Text>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(selectedSchedule.doctors ?? []).map((d) => (
                    <span
                      key={d.id}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '3px 10px', borderRadius: 999, fontSize: 12,
                        background: d.confirmedAt ? 'rgba(82,196,26,0.1)' : 'rgba(0,0,0,0.04)',
                        color: d.confirmedAt ? '#389e0d' : '#888',
                        fontWeight: d.user.id === myUserId ? 600 : 400,
                        border: d.user.id === myUserId ? '1px solid rgba(0,122,255,0.4)' : '1px solid transparent',
                      }}
                    >
                      {d.confirmedAt
                        ? <CheckCircleFilled style={{ fontSize: 11 }} />
                        : <ClockCircleOutlined style={{ fontSize: 11 }} />}
                      {d.user.firstName}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Spin spinning={loading}>
            <Card>
              <div ref={tableExportRef}>
              <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <Table
                  dataSource={tableData}
                  columns={columns}
                  rowKey="date"
                  pagination={false}
                  scroll={{ x: 900 }}
                  size="small"
                  bordered
                  sticky={{ offsetHeader: 52 }}
                />
                <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
                  {draggingInfo && (
                    <Tag color={draggingInfo.color} style={{ cursor: 'grabbing', boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
                      {draggingInfo.label}
                    </Tag>
                  )}
                </DragOverlay>
              </DndContext>
              </div>{/* end tableExportRef */}
            </Card>
          </Spin>
        </>
      ) : (
        /* ── List view ── */
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Title level={4} style={{ margin: 0 }}>ตารางเวร</Title>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              สร้างตารางใหม่
            </Button>
          </div>

          {schedules.length === 0 ? (
            /* Empty state */
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              minHeight: 'calc(100vh - 200px)', gap: 8,
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: 'rgba(0, 122, 255, 0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4,
              }}>
                <PlusOutlined style={{ fontSize: 24, color: '#007AFF' }} />
              </div>
              <Title level={5} style={{ margin: 0 }}>ยังไม่มีตารางเวร</Title>
              <Text type="secondary" style={{ fontSize: 13, marginBottom: 12 }}>สร้างตารางเวรใหม่เพื่อเริ่มจัดเวร</Text>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                สร้างตารางเวร
              </Button>
            </div>
          ) : (
            /* Schedule list — Google Drive style */
            <div style={{
              background: '#fff', borderRadius: 12,
              border: '1px solid rgba(0,0,0,0.07)',
              overflow: 'hidden',
              boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
            }}>
              {/* List header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 100px 100px 1fr 1fr 80px',
                gap: 12, padding: '10px 20px',
                borderBottom: '1px solid rgba(0,0,0,0.06)',
                background: 'rgba(0,0,0,0.02)',
              }}>
                {['ชื่อ', 'เดือน', 'สถานะ', 'จำนวนแพทย์', 'วันที่สร้าง', ''].map((h) => (
                  <Text key={h} type="secondary" style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.3 }}>
                    {h}
                  </Text>
                ))}
              </div>

              {/* List rows */}
              {schedules.map((s, i) => (
                <div
                  key={s.id}
                  onClick={() => selectSchedule(s.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 100px 100px 1fr 1fr 80px',
                    gap: 12, padding: '14px 20px',
                    borderBottom: i < schedules.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                    alignItems: 'center',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,122,255,0.03)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* ชื่อ */}
                  <Space>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: 'rgba(0,122,255,0.08)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <span style={{ fontSize: 15 }}>📅</span>
                    </div>
                    <Text style={{ fontWeight: 500, fontSize: 14 }}>{s.title}</Text>
                  </Space>

                  {/* เดือน */}
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {MONTHS[s.month - 1]} {s.year}
                  </Text>

                  {/* สถานะ */}
                  <div>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999,
                      background: s.status === 'PUBLISHED' ? 'rgba(82,196,26,0.1)' : 'rgba(0,0,0,0.06)',
                      color: s.status === 'PUBLISHED' ? '#389e0d' : '#666',
                    }}>
                      {s.status === 'PUBLISHED' ? 'สมบูรณ์' : 'แบบร่าง'}
                    </span>
                  </div>

                  {/* จำนวนแพทย์ */}
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {(s.doctors?.length ?? 0)} คน
                  </Text>

                  {/* วันที่สร้าง */}
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {formatDate(s.createdAt)}
                  </Text>

                  {/* Actions */}
                  <div onClick={(e) => e.stopPropagation()}>
                    <Popconfirm title="ลบตารางเวรนี้?" onConfirm={async () => {
                      await schedulesApi.remove(s.id);
                      message.success('ลบแล้ว');
                      loadSchedules();
                    }} okText="ลบ" cancelText="ยกเลิก">
                      <Button type="text" size="small" icon={<DeleteOutlined />} danger />
                    </Popconfirm>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      </div>{/* end viewRef */}

      {/* ─── Create Modal (2 Steps) ─────────────────────────────────────── */}
      <Modal
        title={null}
        open={showCreateModal}
        onCancel={() => setShowCreateModal(false)}
        width={480}
        centered
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {createStep > 0 ? (
              <Button size="small" type="text" onClick={() => setCreateStep(createStep - 1)} style={{ color: '#8c8c8c' }}>
                ← ย้อนกลับ
              </Button>
            ) : <div />}
            <Space>
              <Button size="small" onClick={() => setShowCreateModal(false)}>ยกเลิก</Button>
              {createStep < 2 ? (
                <Button type="primary" size="small" onClick={() => setCreateStep(createStep + 1)}>
                  ถัดไป
                </Button>
              ) : (
                <Button
                  type="primary"
                  size="small"
                  onClick={handleCreate}
                  loading={saving}
                  disabled={doctorSlots.length > 0 && !allFilled}
                >
                  สร้างตาราง
                </Button>
              )}
            </Space>
          </div>
        }
      >
        {/* Step indicator — minimal dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 20 }}>
          {[0, 1, 2].map((step) => (
            <div
              key={step}
              style={{
                width: step === createStep ? 20 : 6,
                height: 6,
                borderRadius: 3,
                background: step === createStep ? '#007AFF' : step < createStep ? 'rgba(0,122,255,0.3)' : '#d9d9d9',
                transition: 'all 0.25s ease',
              }}
            />
          ))}
        </div>

        {/* ── Step 1: เดือน/ปี ── */}
        {createStep === 0 && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <Title level={4} style={{ margin: 0 }}>เลือกเดือน</Title>
              <Text type="secondary" style={{ fontSize: 13 }}>เลือกเดือนที่จะสร้างตารางเวร</Text>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>เดือน</Text>
                <Select
                  style={{ width: '100%' }}
                  value={createMonth}
                  onChange={setCreateMonth}
                  options={MONTHS.map((m, i) => ({ label: m, value: i + 1 }))}
                />
              </div>
              <div style={{ width: 120 }}>
                <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>ปี</Text>
                <Select
                  style={{ width: '100%' }}
                  value={createYear}
                  onChange={setCreateYear}
                  options={[2025, 2026, 2027, 2028].map((y) => ({ label: `${y}`, value: y }))}
                />
              </div>
            </div>

            <div style={{
              marginTop: 16, padding: '10px 14px', borderRadius: 8,
              background: 'rgba(0, 122, 255, 0.04)',
              border: '1px solid rgba(0, 122, 255, 0.1)',
              textAlign: 'center',
            }}>
              <Text style={{ fontSize: 14, color: '#007AFF', fontWeight: 500 }}>
                {MONTHS[createMonth - 1]} {createYear}
              </Text>
            </div>
          </div>
        )}

        {/* ── Step 2: รูปแบบเวร ── */}
        {createStep === 1 && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <Title level={4} style={{ margin: 0 }}>รูปแบบเวร</Title>
              <Text type="secondary" style={{ fontSize: 13 }}>กำหนดประเภทเวรสำหรับตารางนี้</Text>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
              {shiftTypeSlots.map((slot, idx) => {
                const color = SHIFT_COLORS[idx % SHIFT_COLORS.length];
                const swatchColor: Record<string, string> = {
                  purple: '#722ed1', blue: '#1677ff', red: '#f5222d',
                  orange: '#fa8c16', green: '#52c41a', cyan: '#13c2c2',
                  magenta: '#eb2f96', volcano: '#fa541c', gold: '#faad14', geekblue: '#2f54eb',
                };
                return (
                  <div key={slot.key} style={{
                    padding: '10px 12px', borderRadius: 10,
                    background: 'rgba(0,0,0,0.02)',
                    border: '1px solid rgba(0,0,0,0.06)',
                  }}>
                    {/* Row 1: color dot + name + delete */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        background: swatchColor[color] ?? '#999',
                      }} />
                      <Input
                        ref={idx === 0 ? shiftTypeFirstRef : undefined}
                        value={slot.name}
                        onChange={(e) => setShiftTypeSlots((prev) =>
                          prev.map((s) => s.key === slot.key ? { ...s, name: e.target.value } : s)
                        )}
                        placeholder="ชื่อเวร เช่น เวรดึก, OPD"
                        size="small"
                        style={{ flex: 1 }}
                        status={!slot.name.trim() ? 'error' : ''}
                      />
                      <Button
                        type="text" size="small" icon={<MinusCircleOutlined />}
                        onClick={() => setShiftTypeSlots((prev) => prev.filter((s) => s.key !== slot.key))}
                        style={{ color: '#ccc', flexShrink: 0 }}
                      />
                    </div>
                    {/* Row 2: day bubbles */}
                    <div style={{ display: 'flex', gap: 5 }}>
                      {ALL_DAYS.map((d) => {
                        const active = slot.days.includes(d);
                        return (
                          <button
                            key={d}
                            onClick={() => setShiftTypeSlots((prev) => prev.map((s) => {
                              if (s.key !== slot.key) return s;
                              const next = active
                                ? s.days.filter((x) => x !== d)
                                : [...s.days, d];
                              return { ...s, days: next };
                            }))}
                            style={{
                              width: 32, height: 32, borderRadius: '50%',
                              border: active ? 'none' : '1.5px solid rgba(0,0,0,0.15)',
                              cursor: 'pointer',
                              fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
                              background: active ? swatchColor[color] ?? '#007AFF' : 'transparent',
                              color: active ? '#fff' : '#bbb',
                              transition: 'all 0.15s ease',
                              flexShrink: 0,
                            }}
                          >
                            {DAY_LABELS[d]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              type="dashed" icon={<PlusOutlined />} block size="small"
              onClick={() => setShiftTypeSlots((prev) => [
                ...prev,
                { key: Date.now(), name: '', days: [] },
              ])}
            >
              เพิ่มประเภทเวร
            </Button>

            <div style={{
              marginTop: 12, padding: '6px 12px', borderRadius: 8,
              background: 'rgba(0,0,0,0.02)', fontSize: 12, color: '#aaa',
              textAlign: 'center',
            }}>
              {shiftTypeSlots.length} ประเภทเวร — กดวันเพื่อเลือก/ยกเลิก
            </div>
          </div>
        )}

        {/* ── Step 3: จัดทีมแพทย์ ── */}
        {createStep === 2 && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <Title level={4} style={{ margin: 0 }}>จัดทีมแพทย์</Title>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {MONTHS[createMonth - 1]} {createYear}
              </Text>
            </div>

            {/* จำนวนแพทย์ */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', background: 'rgba(0,0,0,0.02)', borderRadius: 8, marginBottom: 16,
            }}>
              <Text style={{ fontSize: 13 }}>จำนวนแพทย์</Text>
              <InputNumber
                key={`cnt-${countKey}`}
                ref={doctorCountRef}
                min={0} max={50}
                defaultValue={doctorSlots.length}
                onChange={handleDoctorCountChange}
                onPressEnter={() => {
                  setTimeout(() => {
                    const firstInput = doctorFormRef.current?.querySelector<HTMLInputElement>('[data-slot="0-firstName"]');
                    if (firstInput) { firstInput.focus(); firstInput.select(); }
                  }, 80);
                }}
                style={{ width: 80 }}
                size="small"
              />
            </div>

            {/* Doctor name list */}
            {doctorSlots.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '20px 0', color: '#bbb',
              }}>
                <Text type="secondary" style={{ fontSize: 13 }}>ระบุจำนวนแพทย์ด้านบน หรือกด + เพิ่มทีละคน</Text>
              </div>
            ) : (
              <div ref={doctorFormRef} style={{ maxHeight: 280, overflowY: 'auto', marginBottom: 8 }}>
                {doctorSlots.map((slot, idx) => (
                  <div
                    key={slot.key}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <Text type="secondary" style={{ width: 20, textAlign: 'center', fontSize: 12, flexShrink: 0 }}>
                      {idx + 1}
                    </Text>
                    <Input
                      placeholder="ชื่อ"
                      value={slot.firstName}
                      onChange={(e) => updateSlot(slot.key, 'firstName', e.target.value)}
                      onPressEnter={() => focusNextInput(idx, 'firstName')}
                      data-slot={`${idx}-firstName`}
                      style={{ flex: 1 }}
                      size="small"
                      status={!slot.firstName.trim() ? 'error' : ''}
                      autoFocus={idx === 0 && !slot.firstName}
                    />
                    <Input
                      placeholder="นามสกุล"
                      value={slot.lastName}
                      onChange={(e) => updateSlot(slot.key, 'lastName', e.target.value)}
                      onPressEnter={() => focusNextInput(idx, 'lastName')}
                      data-slot={`${idx}-lastName`}
                      style={{ flex: 1 }}
                      size="small"
                    />
                    <Button
                      type="text"
                      size="small"
                      icon={<MinusCircleOutlined />}
                      onClick={() => removeSlot(slot.key)}
                      style={{ flexShrink: 0, color: '#bbb' }}
                    />
                  </div>
                ))}
              </div>
            )}

            <Button
              type="dashed"
              icon={<PlusOutlined />}
              block
              size="small"
              onClick={addOneSlot}
              style={{ borderColor: '#d9d9d9' }}
            >
              เพิ่มแพทย์
            </Button>

            {/* Status line */}
            {doctorSlots.length > 0 && (
              <Text
                type="secondary"
                style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: 12 }}
              >
                {allFilled
                  ? `แพทย์ ${doctorSlots.length} คน — พร้อมสร้าง`
                  : `กรอกชื่อให้ครบ (${doctorSlots.filter(s => s.firstName.trim()).length}/${doctorSlots.length})`}
              </Text>
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
          rowKey={(r) => (r.user as any).id}
          pagination={false}
          size="small"
        />
      </Modal>

      {/* ── Activity Log Modal ── */}
      <Modal
        title={<span><HistoryOutlined style={{ marginRight: 8 }} />ประวัติกิจกรรม</span>}
        open={showLogModal}
        onCancel={() => setShowLogModal(false)}
        footer={null}
        width={560}
      >
        {activityLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#bbb' }}>
            <HistoryOutlined style={{ fontSize: 32, marginBottom: 8, display: 'block' }} />
            <Text type="secondary">ยังไม่มีกิจกรรม</Text>
          </div>
        ) : (
          <div style={{ maxHeight: 480, overflowY: 'auto' }}>
            {activityLogs.map((log, i) => {
              const ACTION_ICONS: Record<string, { icon: string; color: string }> = {
                ASSIGN:    { icon: '➕', color: '#52c41a' },
                UNASSIGN:  { icon: '➖', color: '#ff4d4f' },
                GENERATE:  { icon: '⚡', color: '#722ed1' },
                CONFIRM:   { icon: '✅', color: '#52c41a' },
                UNCONFIRM: { icon: '↩️', color: '#faad14' },
                CREATE:    { icon: '📄', color: '#007AFF' },
                PUBLISH:   { icon: '🎉', color: '#52c41a' },
                UNPUBLISH: { icon: '📝', color: '#faad14' },
              };
              const a = ACTION_ICONS[log.action] ?? { icon: '•', color: '#999' };
              const time = new Date(log.createdAt);
              const timeStr = time.toLocaleString('th-TH', {
                day: 'numeric', month: 'short',
                hour: '2-digit', minute: '2-digit',
              });

              return (
                <div
                  key={log.id}
                  style={{
                    display: 'flex', gap: 12, padding: '10px 0',
                    borderBottom: i < activityLogs.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                  }}
                >
                  {/* Timeline dot */}
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: `${a.color}14`, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, flexShrink: 0,
                  }}>
                    {a.icon}
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 13, lineHeight: 1.5, display: 'block' }}>
                      {log.detail}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {timeStr}
                    </Text>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}
