import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { KanbanCard } from './kanban-card.entity';
import { KanbanComment } from './kanban-comment.entity';

@Entity('kanban_attachments')
export class KanbanAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => KanbanCard, (card) => card.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'card_id' })
  card: KanbanCard;

  @Column({ name: 'card_id', type: 'uuid' })
  cardId: string;

  @ManyToOne(() => KanbanComment, (comment) => comment.attachments, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'comment_id' })
  comment?: KanbanComment | null;

  @Column({ name: 'comment_id', type: 'uuid', nullable: true })
  commentId?: string | null;

  @Column({ name: 'uploaded_by_id', type: 'uuid' })
  uploadedById: string;

  @Column({ name: 'uploaded_by_name', type: 'varchar', length: 255 })
  uploadedByName: string;

  @Column({ type: 'varchar', length: 255 })
  filename: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 255, nullable: true })
  mimeType: string;

  @Column({ type: 'int' })
  size: number;

  @Column({ name: 's3_key', type: 'text', unique: true })
  s3Key: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
