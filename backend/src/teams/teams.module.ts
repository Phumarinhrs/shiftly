import { Module } from '@nestjs/common';
import { TeamsController } from './teams.controller.js';

@Module({
  controllers: [TeamsController],
})
export class TeamsModule {}
