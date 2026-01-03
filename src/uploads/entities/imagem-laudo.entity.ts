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

@Entity('imagens_laudo')
export class ImagemLaudo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Laudo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'laudo_id' })
  laudo: Laudo;

  @Column({ name: 'laudo_id', type: 'uuid' })
  laudoId: string;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @Column({ name: 's3_key', type: 'text' })
  s3Key: string;

  // Metadados extraídos do EXIF (preenchidos pela Lambda)
  @Column({ type: 'varchar', length: 255, nullable: true })
  ambiente: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  tipo: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  categoria: string;

  @Column({ name: 'avaria_local', type: 'varchar', length: 255, nullable: true })
  avariaLocal: string;

  @Column({ type: 'text', nullable: true })
  descricao: string;

  @Column({ name: 'data_captura', type: 'timestamptz', nullable: true })
  dataCaptura: Date;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number;

  // Status de análise por IA
  @Column({
    name: 'imagem_ja_foi_analisada_pela_ia',
    type: 'varchar',
    length: 3,
    default: 'nao',
  })
  imagemJaFoiAnalisadaPelaIa: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt: Date;
}
