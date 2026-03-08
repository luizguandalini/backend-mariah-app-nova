import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { KanbanCard } from './kanban-card.entity';

@Entity('kanban_history')
export class KanbanHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => KanbanCard, (card) => card.history, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'card_id' })
  card: KanbanCard;

  @Column({ name: 'card_id', type: 'uuid' })
  cardId: string;

  @Column({ name: 'actor_id', type: 'uuid' })
  actorId: string;

  @Column({ name: 'actor_name', type: 'varchar', length: 255 })
  actorName: string;

  @Column({ type: 'varchar', length: 80 })
  action: string;

  @Column({ type: 'varchar', length: 500 })
  summary: string;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
