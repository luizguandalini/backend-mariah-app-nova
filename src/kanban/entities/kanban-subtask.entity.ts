import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { KanbanCard } from './kanban-card.entity';

@Entity('kanban_subtasks')
export class KanbanSubtask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => KanbanCard, (card) => card.subtasks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'card_id' })
  card: KanbanCard;

  @Column({ name: 'card_id', type: 'uuid' })
  cardId: string;

  @Column({ type: 'varchar', length: 300 })
  title: string;

  @Column({ type: 'boolean', default: false })
  done: boolean;

  @Column({ type: 'int', default: 0 })
  position: number;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
