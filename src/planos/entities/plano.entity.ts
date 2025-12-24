import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { PlanoBeneficio } from './plano-beneficio.entity';

@Entity('planos')
export class Plano {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  nome: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  subtitulo: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  preco: number;

  @Column({ type: 'int' })
  quantidadeImagens: number;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @Column({ type: 'int', default: 0 })
  ordem: number;

  @OneToMany(() => PlanoBeneficio, (beneficio) => beneficio.plano, { cascade: true })
  beneficios: PlanoBeneficio[];

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
