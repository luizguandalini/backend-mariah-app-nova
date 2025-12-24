import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Plano } from './plano.entity';

@Entity('planos_beneficios')
export class PlanoBeneficio {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'plano_id' })
  planoId: string;

  @ManyToOne(() => Plano, (plano) => plano.beneficios, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plano_id' })
  plano: Plano;

  @Column({ type: 'text' })
  descricao: string;

  @Column({ type: 'int', default: 0 })
  ordem: number;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

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
