import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('api/teams')
export class TeamsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async findAll() {
    return this.prisma.team.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        members: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
  }

  @Post()
  async create(@Body() body: { name: string; userIds: string[] }) {
    return this.prisma.team.create({
      data: {
        name: body.name,
        members: {
          create: body.userIds.map((userId) => ({ userId })),
        },
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: { name: string; userIds: string[] }) {
    await this.prisma.teamMember.deleteMany({ where: { teamId: id } });
    return this.prisma.team.update({
      where: { id },
      data: {
        name: body.name,
        members: {
          create: body.userIds.map((userId) => ({ userId })),
        },
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.prisma.team.delete({ where: { id } });
  }
}
