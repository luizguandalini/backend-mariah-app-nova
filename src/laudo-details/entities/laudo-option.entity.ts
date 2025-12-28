import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { LaudoQuestion } from './laudo-question.entity';

@Entity('laudo_options')
export class LaudoOption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => LaudoQuestion, (question) => question.options, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question: LaudoQuestion;

  @Column({ name: 'question_id', type: 'uuid' })
  questionId: string;

  @Column({ type: 'varchar', length: 500 })
  optionText: string;

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
