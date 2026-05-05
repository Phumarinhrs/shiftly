import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class SchedulesService {
  constructor(private prisma: PrismaService) {}

  // ─── Activity Log Helper ───────────────────────────────────────────────────

  private async log(
    scheduleId: string,
    action: string,
    detail: string,
    actorId?: string | null,
  ) {
    await this.prisma.activityLog.create({
      data: { scheduleId, action, detail, actorId: actorId ?? null },
    });
  }

  private async getActorName(userId?: string | null): Promise<string> {
    if (!userId) return 'ระบบ';
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    return user ? `${user.firstName} ${user.lastName.charAt(0)}.` : 'ไม่ทราบ';
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  async findAll(year?: number) {
    return this.prisma.schedule.findMany({
      where: year ? { year } : undefined,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: {
        shiftTypes: { orderBy: { order: 'asc' } },
        doctors: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
        shifts: {
          include: {
            assignments: {
              include: { user: { select: { id: true, firstName: true, lastName: true } } },
            },
          },
          orderBy: [{ date: 'asc' }, { shiftType: 'asc' }],
        },
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.schedule.findUnique({
      where: { id },
      include: {
        shiftTypes: { orderBy: { order: 'asc' } },
        doctors: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
        shifts: {
          include: {
            assignments: {
              include: { user: { select: { id: true, firstName: true, lastName: true } } },
            },
          },
          orderBy: [{ date: 'asc' }, { shiftType: 'asc' }],
        },
      },
    });
  }

  async findByMonthYear(month: number, year: number) {
    return this.prisma.schedule.findUnique({
      where: { month_year: { month, year } },
    });
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  readonly DEFAULT_SHIFT_TYPES = [
    { name: 'เวรดึก',      days: [0, 1, 2, 3, 4, 5, 6] },
    { name: 'OPD',         days: [1, 2, 3, 4, 5] },
    { name: 'ER',          days: [0, 1, 2, 3, 4, 5, 6] },
    { name: 'คลินิกพิเศษ', days: [1, 2, 3, 4, 5] },
  ];

  async create(
    month: number,
    year: number,
    title?: string,
    doctorIds: string[] = [],
    shiftTypeConfigs?: { name: string; days: number[] }[],
    actorId?: string,
  ) {
    const monthNames = [
      '', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
      'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
      'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
    ];

    const schedule = await this.prisma.schedule.create({
      data: {
        title: title || `ตารางเวร ${monthNames[month]} ${year}`,
        month,
        year,
      },
    });

    if (doctorIds.length > 0) {
      await this.prisma.scheduleDoctor.createMany({
        data: doctorIds.map((userId) => ({ scheduleId: schedule.id, userId })),
      });
    }

    const types = shiftTypeConfigs && shiftTypeConfigs.length > 0
      ? shiftTypeConfigs
      : this.DEFAULT_SHIFT_TYPES;

    await this.prisma.shiftType.createMany({
      data: types.map((t, i) => ({
        scheduleId: schedule.id,
        name: t.name,
        days: t.days.join(','),
        order: i,
      })),
    });

    const daysInMonth = new Date(year, month, 0).getDate();
    const shiftsData: { scheduleId: string; date: string; shiftType: string }[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayOfWeek = new Date(year, month - 1, day).getDay();

      for (const t of types) {
        const allowedDays = new Set(t.days);
        if (allowedDays.has(dayOfWeek)) {
          shiftsData.push({ scheduleId: schedule.id, date, shiftType: t.name });
        }
      }
    }

    await this.prisma.shift.createMany({ data: shiftsData });

    // Log
    const actorName = await this.getActorName(actorId);
    await this.log(
      schedule.id, 'CREATE',
      `${actorName} สร้างตารางเวร ${monthNames[month]} ${year} (แพทย์ ${doctorIds.length} คน, เวร ${types.length} ประเภท)`,
      actorId,
    );

    return this.findOne(schedule.id);
  }

  // ─── Auto Generate ─────────────────────────────────────────────────────────

  async autoGenerate(scheduleId: string, actorId?: string) {
    const [schedule, scheduleDoctors] = await Promise.all([
      this.prisma.schedule.findUnique({
        where: { id: scheduleId },
        include: { shifts: { orderBy: [{ date: 'asc' }, { shiftType: 'asc' }] } },
      }),
      this.prisma.scheduleDoctor.findMany({
        where: { scheduleId },
        include: { user: true },
      }),
    ]);

    const doctors = scheduleDoctors.map((sd) => sd.user);
    if (!schedule || doctors.length === 0) return null;

    const unavailable = await this.prisma.availability.findMany({
      where: { userId: { in: doctors.map((d) => d.id) } },
    });

    const unavailableMap = new Map<string, Set<string>>();
    for (const a of unavailable) {
      if (!unavailableMap.has(a.userId)) {
        unavailableMap.set(a.userId, new Set());
      }
      unavailableMap.get(a.userId)!.add(a.date);
    }

    const shiftIds = schedule.shifts.map((s) => s.id);
    await this.prisma.shiftAssignment.deleteMany({
      where: { shiftId: { in: shiftIds } },
    });

    const shiftCounts = new Map<string, number>();
    for (const doc of doctors) {
      shiftCounts.set(doc.id, 0);
    }

    const assignments: { shiftId: string; userId: string }[] = [];

    for (const shift of schedule.shifts) {
      const available = doctors.filter((doc) => {
        const unavailDates = unavailableMap.get(doc.id);
        if (unavailDates && unavailDates.has(shift.date)) return false;
        return !assignments.some((a) => a.shiftId === shift.id && a.userId === doc.id);
      });

      if (available.length === 0) continue;

      available.sort(
        (a, b) => (shiftCounts.get(a.id) || 0) - (shiftCounts.get(b.id) || 0),
      );

      const selected = available[0];
      assignments.push({ shiftId: shift.id, userId: selected.id });
      shiftCounts.set(selected.id, (shiftCounts.get(selected.id) || 0) + 1);
    }

    await this.prisma.shiftAssignment.createMany({ data: assignments });

    // Log
    const actorName = await this.getActorName(actorId);
    await this.log(
      scheduleId, 'GENERATE',
      `${actorName} จัดเวรอัตโนมัติ (${assignments.length} เวร, ${doctors.length} แพทย์)`,
      actorId,
    );

    return this.findOne(scheduleId);
  }

  // ─── Status ────────────────────────────────────────────────────────────────

  async updateStatus(id: string, status: string, actorId?: string) {
    const result = await this.prisma.schedule.update({
      where: { id },
      data: { status },
    });

    const action = status === 'PUBLISHED' ? 'PUBLISH' : 'UNPUBLISH';
    const label = status === 'PUBLISHED' ? 'สมบูรณ์' : 'แบบร่าง';
    const actorName = await this.getActorName(actorId);
    await this.log(id, action, `${actorName} เปลี่ยนสถานะเป็น "${label}"`, actorId);

    return result;
  }

  async remove(id: string) {
    return this.prisma.schedule.delete({ where: { id } });
  }

  // ─── Assign / Unassign ─────────────────────────────────────────────────────

  async assignDoctor(shiftId: string, userId: string, actorId?: string) {
    const result = await this.prisma.shiftAssignment.create({
      data: { shiftId, userId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        shift: { select: { scheduleId: true, date: true, shiftType: true } },
      },
    });

    const actorName = await this.getActorName(actorId);
    const day = parseInt(result.shift.date.split('-')[2]);
    await this.log(
      result.shift.scheduleId, 'ASSIGN',
      `${actorName} มอบหมาย ${result.user.firstName} ${result.user.lastName.charAt(0)}. → ${result.shift.shiftType} วันที่ ${day}`,
      actorId,
    );

    return result;
  }

  async unassignDoctor(shiftId: string, userId: string, actorId?: string) {
    // ดึงข้อมูลก่อนลบ เพื่อ log
    const assignment = await this.prisma.shiftAssignment.findUnique({
      where: { shiftId_userId: { shiftId, userId } },
      include: {
        user: { select: { firstName: true, lastName: true } },
        shift: { select: { scheduleId: true, date: true, shiftType: true } },
      },
    });

    const result = await this.prisma.shiftAssignment.delete({
      where: { shiftId_userId: { shiftId, userId } },
    });

    if (assignment) {
      const actorName = await this.getActorName(actorId);
      const day = parseInt(assignment.shift.date.split('-')[2]);
      await this.log(
        assignment.shift.scheduleId, 'UNASSIGN',
        `${actorName} ถอด ${assignment.user.firstName} ${assignment.user.lastName.charAt(0)}. ออกจาก ${assignment.shift.shiftType} วันที่ ${day}`,
        actorId,
      );
    }

    return result;
  }

  // ─── Confirm ───────────────────────────────────────────────────────────────

  async toggleConfirm(scheduleId: string, userId: string) {
    const existing = await this.prisma.scheduleDoctor.findUnique({
      where: { scheduleId_userId: { scheduleId, userId } },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!existing) return null;

    const isConfirming = !existing.confirmedAt;
    const result = await this.prisma.scheduleDoctor.update({
      where: { scheduleId_userId: { scheduleId, userId } },
      data: { confirmedAt: isConfirming ? new Date() : null },
    });

    const name = `${existing.user.firstName} ${existing.user.lastName.charAt(0)}.`;
    await this.log(
      scheduleId,
      isConfirming ? 'CONFIRM' : 'UNCONFIRM',
      isConfirming ? `${name} ยืนยันเวร ✓` : `${name} ยกเลิกยืนยันเวร`,
      userId,
    );

    return result;
  }

  // ─── Shift Count ───────────────────────────────────────────────────────────

  async getShiftCount(scheduleId: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: {
        shifts: {
          include: {
            assignments: {
              include: { user: { select: { id: true, firstName: true, lastName: true } } },
            },
          },
        },
      },
    });

    if (!schedule) return null;

    const counts = new Map<string, Record<string, any>>();

    for (const shift of schedule.shifts) {
      for (const assignment of shift.assignments) {
        const uid = assignment.user.id;
        if (!counts.has(uid)) {
          counts.set(uid, { user: assignment.user, total: 0 });
        }
        const entry = counts.get(uid)!;
        entry[shift.shiftType] = (entry[shift.shiftType] || 0) + 1;
        entry.total += 1;
      }
    }

    return Array.from(counts.values()).sort((a, b) =>
      a.user.firstName.localeCompare(b.user.firstName),
    );
  }

  // ─── Activity Logs ─────────────────────────────────────────────────────────

  async getActivityLogs(scheduleId: string) {
    return this.prisma.activityLog.findMany({
      where: { scheduleId },
      include: {
        actor: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
