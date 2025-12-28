import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { LaudoSection } from './laudo-section.entity';
import { LaudoOption } from './laudo-option.entity';

@Entity('laudo_questions')
export class LaudoQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => LaudoSection, (section) => section.questions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'section_id' })
  section: LaudoSection;

  @Column({ name: 'section_id', type: 'uuid' })
  sectionId: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  questionText: string; // Pode ser null se não houver pergunta específica

  @OneToMany(() => LaudoOption, (option) => option.question, { cascade: true })
  options: LaudoOption[];

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
