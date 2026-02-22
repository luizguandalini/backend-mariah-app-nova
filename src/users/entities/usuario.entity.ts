import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
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

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @Column({ name: 'expo_push_token', type: 'varchar', length: 255, nullable: true })
  expoPushToken: string;

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
