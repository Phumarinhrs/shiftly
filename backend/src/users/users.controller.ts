import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('api/users')
export class UsersController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async findAll() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
      orderBy: { firstName: 'asc' },
    });
  }

  @Get('doctors')
  async findDoctors() {
    return this.prisma.user.findMany({
      where: { role: 'DOCTOR', isActive: true },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: { firstName: 'asc' },
    });
  }

  @Post()
  async create(@Body() body: { firstName: string; lastName: string; email?: string }) {
    const email = body.email || `doctor_${Date.now()}@hospital.com`;
    return this.prisma.user.create({
      data: { firstName: body.firstName, lastName: body.lastName, email, role: 'DOCTOR' },
      select: { id: true, firstName: true, lastName: true, email: true, role: true },
    });
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { firstName?: string; lastName?: string },
  ) {
    return this.prisma.user.update({
      where: { id },
      data: body,
      select: { id: true, firstName: true, lastName: true, email: true },
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
