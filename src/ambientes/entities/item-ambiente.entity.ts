import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Ambiente } from './ambiente.entity';

@Entity('itens_ambiente')
export class ItemAmbiente {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'ambiente_id' })
  ambienteId: string;

  @ManyToOne(() => Ambiente, (ambiente) => ambiente.itens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ambiente_id' })
  ambiente: Ambiente;

  @Column({ type: 'uuid', name: 'parent_id', nullable: true })
  parentId: string;

  @ManyToOne(() => ItemAmbiente, (item) => item.filhos, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: ItemAmbiente;

  @OneToMany(() => ItemAmbiente, (item) => item.parent)
  filhos: ItemAmbiente[];

  @Column({ type: 'varchar', length: 255 })
  nome: string;

  @Column({ type: 'text' })
  prompt: string;

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
