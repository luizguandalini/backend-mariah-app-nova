import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriveController } from './drive.controller';
import { DriveService } from './drive.service';
import { Laudo } from '../laudos/entities/laudo.entity';
import { LaudosModule } from '../laudos/laudos.module';

@Module({
  imports: [TypeOrmModule.forFeature([Laudo]), LaudosModule],
  controllers: [DriveController],
  providers: [DriveService],
})
export class DriveModule {}
