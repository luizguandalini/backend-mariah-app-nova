import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { KanbanCard } from './kanban-card.entity';
import { KanbanAttachment } from './kanban-attachment.entity';

@Entity('kanban_comments')
export class KanbanComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => KanbanCard, (card) => card.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'card_id' })
  card: KanbanCard;

  @Column({ name: 'card_id', type: 'uuid' })
  cardId: string;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId: string;

  @Column({ name: 'author_name', type: 'varchar', length: 255 })
  authorName: string;

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => KanbanAttachment, (attachment) => attachment.comment)
  attachments: KanbanAttachment[];
}
