import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { KanbanSubtask } from './kanban-subtask.entity';
import { KanbanComment } from './kanban-comment.entity';
import { KanbanAttachment } from './kanban-attachment.entity';
import { KanbanHistory } from './kanban-history.entity';

export enum KanbanStatus {
  TODO = 'TODO',
  DOING = 'DOING',
  REVIEW = 'REVIEW',
  DONE = 'DONE',
}

export enum KanbanPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

@Entity('kanban_cards')
export class KanbanCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'enum', enum: KanbanStatus, default: KanbanStatus.TODO })
  status: KanbanStatus;

  @Column({ type: 'enum', enum: KanbanPriority, default: KanbanPriority.MEDIUM })
  priority: KanbanPriority;

  @Column({ type: 'int', default: 0 })
  position: number;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById: string;

  @Column({ name: 'updated_by_id', type: 'uuid' })
  updatedById: string;

  @Column({ name: 'last_interaction_summary', type: 'varchar', length: 500, nullable: true })
  lastInteractionSummary: string;

  @Column({ name: 'last_interaction_at', type: 'timestamptz', nullable: true })
  lastInteractionAt: Date;

  @OneToMany(() => KanbanSubtask, (subtask) => subtask.card)
  subtasks: KanbanSubtask[];

  @OneToMany(() => KanbanComment, (comment) => comment.card)
  comments: KanbanComment[];

  @OneToMany(() => KanbanAttachment, (attachment) => attachment.card)
  attachments: KanbanAttachment[];

  @OneToMany(() => KanbanHistory, (history) => history.card)
  history: KanbanHistory[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
