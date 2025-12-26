import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ItemAmbiente } from './item-ambiente.entity';
import { TipoUso, TipoImovel } from '../enums/ambiente-tipos.enum';

@Entity('ambientes')
export class Ambiente {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  nome: string;

  @Column({ type: 'text', nullable: true })
  descricao: string;

  @Column({ type: 'int', default: 0 })
  ordem: number;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @Column({
    type: 'enum',
    enum: TipoUso,
    array: true,
    default: '{}',
    name: 'tipos_uso',
  })
  tiposUso: TipoUso[];

  @Column({
    type: 'enum',
    enum: TipoImovel,
    array: true,
    default: '{}',
    name: 'tipos_imovel',
  })
  tiposImovel: TipoImovel[];

  @Column({ type: 'uuid', nullable: true, name: 'grupo_id' })
  grupoId: string;

  @OneToMany(() => ItemAmbiente, (item) => item.ambiente)
  itens: ItemAmbiente[];

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
