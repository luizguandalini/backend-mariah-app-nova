import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { UserRole } from '../enums/user-role.enum';

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  nome: string;

  @Column({ type: 'varchar', length: 255, select: false })
  senha: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USUARIO,
  })
  role: UserRole;

  @Column({ type: 'int', default: 0 })
  quantidadeImagens: number;

  @Column({ name: 'quantidade_classificacoes_web', type: 'int', default: 0 })
  quantidadeClassificacoesWeb: number;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @Column({ name: 'expo_push_token', type: 'varchar', length: 255, nullable: true })
  expoPushToken: string;

  @Column({ name: 'foto_perfil_s3_key', type: 'varchar', length: 512, nullable: true })
  fotoPerfilS3Key: string | null;

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

  /**
   * Soft-delete marker. `null` (or absent) means the user is active; a
   * non-null timestamp means the user has been deleted via the admin
   * endpoint. Soft-deleted users are filtered out of every read endpoint
   * and cannot authenticate; related domain records (laudos, images,
   * etc.) are preserved and remain FK'd to this row.
   *
   * The same email can be re-used on a re-created user because the
   * uniqueness constraint on `usuarios.email` is partial: it only
   * applies to rows where `deleted_at IS NULL`.
   */
  @DeleteDateColumn({
    name: 'deleted_at',
    type: 'timestamptz',
    nullable: true,
  })
  deletedAt: Date | null;
}
