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

export enum TipoVistoria {
  ENTRADA = 'ENTRADA',
  SAIDA = 'SAIDA',
}

export enum TipoUso {
  RESIDENCIAL = 'RESIDENCIAL',
  COMERCIAL = 'COMERCIAL',
  INDUSTRIAL = 'INDUSTRIAL',
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

  // Endereço completo (mantido para compatibilidade)
  @Column({ type: 'varchar', length: 500 })
  endereco: string;

  // Endereço detalhado
  @Column({ type: 'varchar', length: 200, nullable: true })
  rua: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  numero: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  complemento: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  bairro: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  cidade: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  estado: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  cep: string;

  // Classificação
  @Column({ name: 'tipo_vistoria', type: 'varchar', length: 20, nullable: true })
  tipoVistoria: string; // 'ENTRADA' | 'SAIDA'

  @Column({ name: 'tipo_uso', type: 'varchar', length: 20, nullable: true })
  tipoUso: string; // 'RESIDENCIAL' | 'COMERCIAL' | 'INDUSTRIAL'

  @Column({ name: 'tipo_imovel', type: 'varchar', length: 100, nullable: true })
  tipoImovel: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  tipo: string; // Mantido para compatibilidade

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

  // Geolocalização
  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number;

  @Column({ name: 'endereco_completo_gps', type: 'text', nullable: true })
  enderecoCompletoGps: string;

  // Questionários
  @Column({ name: 'incluir_atestado', type: 'int', nullable: true })
  incluirAtestado: number; // 0 ou 1

  @Column({ type: 'text', nullable: true })
  atestado: string;

  @Column({ name: 'analises_hidraulicas', type: 'jsonb', nullable: true })
  analisesHidraulicas: object; // {fluxo_agua: string, vazamentos: string}

  @Column({ name: 'analises_eletricas', type: 'jsonb', nullable: true })
  analisesEletricas: object; // {funcionamento: string, disjuntores: string}

  @Column({ name: 'sistema_ar', type: 'jsonb', nullable: true })
  sistemaAr: object; // {ar_condicionado: string, aquecimento: string}

  @Column({ name: 'mecanismos_abertura', type: 'jsonb', nullable: true })
  mecanismosAbertura: object; // {portas: string, janelas: string, outros: string}

  @Column({ type: 'jsonb', nullable: true })
  revestimentos: object; // {tetos: string, pisos: string, bancadas: string}

  @Column({ type: 'jsonb', nullable: true })
  mobilias: object; // {fixa: string, nao_fixa: string}

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
