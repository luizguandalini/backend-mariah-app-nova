import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Laudo } from '../../laudos/entities/laudo.entity';
import { Usuario } from '../../users/entities/usuario.entity';

/**
 * Imagem anexada à contestação ("Registros Complementares") de um laudo.
 * O caminho S3 segue o mesmo padrão do projeto:
 *   users/{userId}/laudos/{laudoId}/contestacao/{uuid}_{filename}
 */
@Entity('contestacao_imagens')
export class ContestacaoImagem {
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

  @Column({ name: 's3_key', type: 'text', unique: true })
  s3Key: string;

  /**
   * Legenda individual da foto, definida pelo usuário antes de enviar.
   * OBRIGATÓRIA — é renderizada no PDF junto da imagem.
   */
  @Column({ type: 'varchar', length: 500 })
  legenda: string;

  @Column({ type: 'int', default: 0 })
  ordem: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}