import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { Usuario } from '../users/entities/usuario.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Usuario])],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
