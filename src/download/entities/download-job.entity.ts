import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Usuario } from '../../users/entities/usuario.entity';
import { Laudo } from '../../laudos/entities/laudo.entity';

export enum DownloadJobTipo {
  AMBIENTE = 'ambiente',
  LAUDO = 'laudo',
}

export enum DownloadJobStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  READY = 'ready',
  ERROR = 'error',
}

/**
 * Job de geração assíncrona de ZIP para download das fotos de um laudo
 * (por ambiente ou laudo inteiro). O ZIP é montado por um worker
 * (DownloadProcessor) que consome a fila RabbitMQ, sobe o arquivo no S3
 * e notifica o usuário via WebSocket. A URL de download é gerada sob
 * demanda (presigned) a partir de `zipS3Key`, não é persistida.
 */
@Entity('download_jobs')
@Index('IDX_download_jobs_laudo', ['laudoId'])
@Index('IDX_download_jobs_status', ['status'])
export class DownloadJob {
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

  @Column({ type: 'varchar', length: 20 })
  tipo: DownloadJobTipo;

  // Preenchido apenas quando `tipo = ambiente`.
  @Column({ type: 'varchar', length: 255, nullable: true })
  ambiente: string | null;

  @Column({ type: 'varchar', length: 20, default: DownloadJobStatus.QUEUED })
  status: DownloadJobStatus;

  // Quantidade de imagens incluídas no ZIP (preenchido pelo worker).
  @Column({ name: 'total_imagens', type: 'integer', default: 0 })
  totalImagens: number;

  // Chave do ZIP gerado no S3 (preenchida quando status = ready).
  @Column({ name: 'zip_s3_key', type: 'varchar', length: 1024, nullable: true })
  zipS3Key: string | null;

  @Column({ type: 'text', nullable: true })
  erro: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
