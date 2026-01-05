import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Usuario } from './usuario.entity';

@Entity('configuracoes_pdf_usuario')
export class ConfiguracaoPdfUsuario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'usuario_id', type: 'uuid', unique: true })
  usuarioId: string;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  @Column({ name: 'espacamento_horizontal', type: 'integer', default: 10 })
  espacamentoHorizontal: number;

  @Column({ name: 'espacamento_vertical', type: 'integer', default: 15 })
  espacamentoVertical: number;

  @Column({ name: 'margem_pagina', type: 'integer', default: 20 })
  margemPagina: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
