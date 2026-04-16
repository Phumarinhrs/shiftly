import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const SHIFT_TYPES = ['NIGHTSHIFT', 'OPD', 'ER', 'SPECIAL_CLINIC'] as const;

@Injectable()
export class SchedulesService {
  constructor(private prisma: PrismaService) {}

  async findAll(year?: number) {
    return this.prisma.schedule.findMany({
      where: year ? { year } : undefined,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: {
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

  async create(month: number, year: number, title?: string, doctorIds: string[] = []) {
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

    // บันทึกแพทย์ในทีมของตาราง
    if (doctorIds.length > 0) {
      await this.prisma.scheduleDoctor.createMany({
        data: doctorIds.map((userId) => ({ scheduleId: schedule.id, userId })),
      });
    }

    // สร้าง shift สำหรับทุกวันในเดือน
    const daysInMonth = new Date(year, month, 0).getDate();
    const shiftsData: { scheduleId: string; date: string; shiftType: string }[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayOfWeek = new Date(year, month - 1, day).getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      // ทุกวัน: NIGHTSHIFT + ER
      shiftsData.push({ scheduleId: schedule.id, date, shiftType: 'NIGHTSHIFT' });
      shiftsData.push({ scheduleId: schedule.id, date, shiftType: 'ER' });

      // วันจันทร์-ศุกร์: OPD + SPECIAL_CLINIC
      if (!isWeekend) {
        shiftsData.push({ scheduleId: schedule.id, date, shiftType: 'OPD' });
        shiftsData.push({ scheduleId: schedule.id, date, shiftType: 'SPECIAL_CLINIC' });
      }
    }

    await this.prisma.shift.createMany({ data: shiftsData });

    return this.findOne(schedule.id);
  }

  async autoGenerate(scheduleId: string) {
    // ดึงข้อมูลที่จำเป็น
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

    // สร้าง set ของวันที่แพทย์ไม่ว่าง
    const unavailableMap = new Map<string, Set<string>>();
    for (const a of unavailable) {
      if (!unavailableMap.has(a.userId)) {
        unavailableMap.set(a.userId, new Set());
      }
      unavailableMap.get(a.userId)!.add(a.date);
    }

    // ลบ assignment เดิมทั้งหมด
    const shiftIds = schedule.shifts.map((s) => s.id);
    await this.prisma.shiftAssignment.deleteMany({
      where: { shiftId: { in: shiftIds } },
    });

    // นับเวรแต่ละคน (สมดุล ±1)
    const shiftCounts = new Map<string, number>();
    for (const doc of doctors) {
      shiftCounts.set(doc.id, 0);
    }

    const assignments: { shiftId: string; userId: string }[] = [];

    for (const shift of schedule.shifts) {
      // หาหมอที่ว่างในวันนี้
      const available = doctors.filter((doc) => {
        const unavailDates = unavailableMap.get(doc.id);
        if (unavailDates && unavailDates.has(shift.date)) return false;

        // เช็คว่าไม่ได้ถูก assign ในวันเดียวกันแล้ว
        const alreadyAssignedToday = assignments.some(
          (a) =>
            a.userId === doc.id &&
            schedule.shifts.find((s) => s.id === a.shiftId)?.date === shift.date,
        );
        return !alreadyAssignedToday;
      });

      if (available.length === 0) continue;

      // เลือกคนที่มีเวรน้อยสุด
      available.sort(
        (a, b) => (shiftCounts.get(a.id) || 0) - (shiftCounts.get(b.id) || 0),
      );

      const selected = available[0];
      assignments.push({ shiftId: shift.id, userId: selected.id });
      shiftCounts.set(selected.id, (shiftCounts.get(selected.id) || 0) + 1);
    }

    // บันทึก assignments
    await this.prisma.shiftAssignment.createMany({ data: assignments });

    return this.findOne(scheduleId);
  }

  async updateStatus(id: string, status: string) {
    return this.prisma.schedule.update({
      where: { id },
      data: { status },
    });
  }

  async remove(id: string) {
    return this.prisma.schedule.delete({ where: { id } });
  }

  async assignDoctor(shiftId: string, userId: string) {
    return this.prisma.shiftAssignment.create({
      data: { shiftId, userId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async unassignDoctor(shiftId: string, userId: string) {
    return this.prisma.shiftAssignment.delete({
      where: { shiftId_userId: { shiftId, userId } },
    });
  }

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

    const counts = new Map<
      string,
      { user: { id: string; firstName: string; lastName: string }; NIGHTSHIFT: number; OPD: number; ER: number; SPECIAL_CLINIC: number; total: number }
    >();

    for (const shift of schedule.shifts) {
      for (const assignment of shift.assignments) {
        const userId = assignment.user.id;
        if (!counts.has(userId)) {
          counts.set(userId, {
            user: assignment.user,
            NIGHTSHIFT: 0,
            OPD: 0,
            ER: 0,
            SPECIAL_CLINIC: 0,
            total: 0,
          });
        }
        const entry = counts.get(userId)!;
        const st = shift.shiftType as 'NIGHTSHIFT' | 'OPD' | 'ER' | 'SPECIAL_CLINIC';
        entry[st] += 1;
        entry.total += 1;
      }
    }

    return Array.from(counts.values()).sort((a, b) => a.user.firstName.localeCompare(b.user.firstName));
  }
}
