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

  @Column({ name: 'metodologia_texto', type: 'text', nullable: true })
  metodologiaTexto: string | null;

  @Column({ name: 'termos_gerais_texto', type: 'text', nullable: true })
  termosGeraisTexto: string | null;

  @Column({ name: 'assinatura_texto', type: 'text', nullable: true })
  assinaturaTexto: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
