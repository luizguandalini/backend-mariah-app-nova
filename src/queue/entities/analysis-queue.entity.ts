import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Usuario } from '../../users/entities/usuario.entity';
import { Laudo } from '../../laudos/entities/laudo.entity';
import { ImagemLaudo } from '../../uploads/entities/imagem-laudo.entity';

export enum AnalysisStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  ERROR = 'error',
  CANCELLED = 'cancelled',
  PAUSED = 'paused', // Pausado por erro crítico (401/403/404)
}

@Entity('analysis_queue')
export class AnalysisQueue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Laudo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'laudo_id' })
  laudo: Laudo;

  @Column({ name: 'laudo_id', type: 'uuid' })
  laudoId: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: AnalysisStatus.PENDING,
  })
  status: AnalysisStatus;

  @Column({ type: 'integer', nullable: true })
  position: number;

  @Column({ name: 'total_images', type: 'integer', default: 0 })
  totalImages: number;

  @Column({ name: 'processed_images', type: 'integer', default: 0 })
  processedImages: number;

  @ManyToOne(() => ImagemLaudo, { nullable: true })
  @JoinColumn({ name: 'current_image_id' })
  currentImage: ImagemLaudo;

  @Column({ name: 'current_image_id', type: 'uuid', nullable: true })
  currentImageId: string;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date;

  // Campos calculados para retorno
  get progressPercentage(): number {
    if (this.totalImages === 0) return 0;
    return Math.round((this.processedImages / this.totalImages) * 100);
  }
}
