import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { SchedulesService } from './schedules.service.js';

@Controller('api/schedules')
export class SchedulesController {
  constructor(private schedulesService: SchedulesService) {}

  // GET /api/schedules?year=2026
  @Get()
  async findAll(@Query('year') year?: string) {
    return this.schedulesService.findAll(year ? parseInt(year) : undefined);
  }

  // GET /api/schedules/:id
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const schedule = await this.schedulesService.findOne(id);
    if (!schedule) {
      throw new HttpException('Schedule not found', HttpStatus.NOT_FOUND);
    }
    return schedule;
  }

  // POST /api/schedules — สร้างตารางเวรรายเดือน
  @Post()
  async create(@Body() body: { month: number; year: number; title?: string; doctorIds?: string[] }) {
    const existing = await this.schedulesService.findByMonthYear(body.month, body.year);
    if (existing) {
      throw new HttpException('Schedule for this month already exists', HttpStatus.CONFLICT);
    }
    return this.schedulesService.create(body.month, body.year, body.title, body.doctorIds ?? []);
  }

  // POST /api/schedules/:id/generate — Auto-generate เวรทั้งเดือน
  @Post(':id/generate')
  async generate(@Param('id') id: string) {
    const schedule = await this.schedulesService.findOne(id);
    if (!schedule) {
      throw new HttpException('Schedule not found', HttpStatus.NOT_FOUND);
    }
    return this.schedulesService.autoGenerate(id);
  }

  // PUT /api/schedules/:id/publish
  @Put(':id/publish')
  async publish(@Param('id') id: string) {
    return this.schedulesService.updateStatus(id, 'PUBLISHED');
  }

  // PUT /api/schedules/:id/draft
  @Put(':id/draft')
  async unpublish(@Param('id') id: string) {
    return this.schedulesService.updateStatus(id, 'DRAFT');
  }

  // DELETE /api/schedules/:id
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.schedulesService.remove(id);
  }

  // POST /api/schedules/:id/shifts/:shiftId/assign — Assign หมอเข้าเวร
  @Post(':id/shifts/:shiftId/assign')
  async assignDoctor(
    @Param('shiftId') shiftId: string,
    @Body() body: { userId: string },
  ) {
    return this.schedulesService.assignDoctor(shiftId, body.userId);
  }

  // Delete /api/schedules/:id/shifts/:shiftId/assign/:userId — ถอดหมอออกจากเวร
  @Delete(':id/shifts/:shiftId/assign/:userId')
  async unassignDoctor(
    @Param('shiftId') shiftId: string,
    @Param('userId') userId: string,
  ) {
    return this.schedulesService.unassignDoctor(shiftId, userId);
  }

  // GET /api/schedules/:id/shift-count — นับเวรแต่ละคน
  @Get(':id/shift-count')
  async shiftCount(@Param('id') id: string) {
    return this.schedulesService.getShiftCount(id);
  }
}
