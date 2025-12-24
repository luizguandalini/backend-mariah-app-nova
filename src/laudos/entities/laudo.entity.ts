import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Usuario } from '../../users/entities/usuario.entity';

export enum StatusLaudo {
  NAO_INICIADO = 'nao_iniciado',
  PROCESSANDO = 'processando',
  CONCLUIDO = 'concluido',
  PARALISADO = 'paralisado',
}

@Entity('laudos')
export class Laudo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @Column({ type: 'varchar', length: 500 })
  endereco: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  tipo: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  unidade: string;

  @Column({
    type: 'enum',
    enum: StatusLaudo,
    default: StatusLaudo.NAO_INICIADO,
  })
  status: StatusLaudo;

  @Column({ type: 'varchar', length: 100, nullable: true })
  tamanho: string;

  @Column({ name: 'pdf_url', type: 'text', nullable: true })
  pdfUrl: string;

  @Column({ name: 'total_ambientes', type: 'int', default: 0 })
  totalAmbientes: number;

  @Column({ name: 'total_fotos', type: 'int', default: 0 })
  totalFotos: number;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
  })
  updatedAt: Date;
}
