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

  @Column({ name: 'modo_preview_pdf', type: 'varchar', length: 20, default: 'detalhado' })
  modoPreviewPdf: 'detalhado' | 'compacto';

  @Column({ name: 'metodologia_texto', type: 'text', nullable: true })
  metodologiaTexto: string | null;

  // Texto de METODOLOGIA customizado por tipo de vistoria. Quando preenchido,
  // sobrescreve o padrão daquele tipo. Quando null, usa o padrão (ou o legado
  // `metodologiaTexto` compartilhado, para manter compatibilidade com
  // usuários que editaram o texto antes desta separação).
  @Column({ name: 'metodologia_entrada_texto', type: 'text', nullable: true })
  metodologiaEntradaTexto: string | null;

  @Column({ name: 'metodologia_saida_texto', type: 'text', nullable: true })
  metodologiaSaidaTexto: string | null;

  @Column({ name: 'metodologia_constatacao_texto', type: 'text', nullable: true })
  metodologiaConstatacaoTexto: string | null;

  @Column({ name: 'metodologia_periodica_texto', type: 'text', nullable: true })
  metodologiaPeriodicaTexto: string | null;

  @Column({ name: 'termos_gerais_texto', type: 'text', nullable: true })
  termosGeraisTexto: string | null;

  @Column({ name: 'assinatura_texto', type: 'text', nullable: true })
  assinaturaTexto: string | null;

  // --- Logo da capa (foto de perfil exibida no topo da capa do laudo) ---
  // Coordenadas/dimensões em px relativas a uma página A4 de referência (794 x 1123 @ 96dpi).
  @Column({ name: 'mostrar_logo_capa', type: 'boolean', default: true })
  mostrarLogoCapa: boolean;

  @Column({ name: 'logo_capa_x', type: 'real', nullable: true })
  logoCapaX: number | null;

  @Column({ name: 'logo_capa_y', type: 'real', nullable: true })
  logoCapaY: number | null;

  @Column({ name: 'logo_capa_largura', type: 'real', nullable: true })
  logoCapaLargura: number | null;

  @Column({ name: 'logo_capa_altura', type: 'real', nullable: true })
  logoCapaAltura: number | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
