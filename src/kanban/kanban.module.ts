import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KanbanController } from './kanban.controller';
import { KanbanService } from './kanban.service';
import { KanbanCard } from './entities/kanban-card.entity';
import { KanbanSubtask } from './entities/kanban-subtask.entity';
import { KanbanComment } from './entities/kanban-comment.entity';
import { KanbanAttachment } from './entities/kanban-attachment.entity';
import { KanbanHistory } from './entities/kanban-history.entity';
import { Usuario } from '../users/entities/usuario.entity';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KanbanCard,
      KanbanSubtask,
      KanbanComment,
      KanbanAttachment,
      KanbanHistory,
      Usuario,
    ]),
    UploadsModule,
  ],
  controllers: [KanbanController],
  providers: [KanbanService],
})
export class KanbanModule {}
