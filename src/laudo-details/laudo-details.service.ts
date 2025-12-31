import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LaudoSection } from './entities/laudo-section.entity';
import { LaudoQuestion } from './entities/laudo-question.entity';
import { LaudoOption } from './entities/laudo-option.entity';
import {
  CreateLaudoSectionDto,
  UpdateLaudoSectionDto,
  CreateLaudoQuestionDto,
  UpdateLaudoQuestionDto,
  CreateLaudoOptionDto,
  UpdateLaudoOptionDto,
} from './dto/laudo-details.dto';

@Injectable()
export class LaudoDetailsService {
  constructor(
    @InjectRepository(LaudoSection)
    private sectionRepository: Repository<LaudoSection>,
    @InjectRepository(LaudoQuestion)
    private questionRepository: Repository<LaudoQuestion>,
    @InjectRepository(LaudoOption)
    private optionRepository: Repository<LaudoOption>,
  ) {}

  /**
   * Buscar todas as seções ativas com perguntas e opções para sincronização (app mobile)
   * Retorna estrutura completa com timestamp de última atualização
   */
  async getTodosComEstrutura(): Promise<any> {
    // Buscar todas as seções ativas ordenadas
    const secoes = await this.sectionRepository.find({
      where: { ativo: true },
      relations: ['questions', 'questions.options'],
      order: {
        ordem: 'ASC',
        questions: {
          ordem: 'ASC',
          options: {
            ordem: 'ASC',
          },
        },
      },
    });

    // Filtrar apenas perguntas e opções ativas
    const secoesFormatadas = secoes.map((secao) => ({
      id: secao.id,
      nome: secao.name,
      ordem: secao.ordem,
      perguntas: secao.questions
        .filter((q) => q.ativo)
        .map((pergunta) => ({
          id: pergunta.id,
          texto: pergunta.questionText,
          ordem: pergunta.ordem,
          opcoes: pergunta.options
            .filter((o) => o.ativo)
            .map((opcao) => ({
              id: opcao.id,
              texto: opcao.optionText,
              ordem: opcao.ordem,
            })),
        })),
    }));

    return {
      secoes: secoesFormatadas,
      ultima_atualizacao: new Date().toISOString(),
    };
  }

  // Sections
  async createSection(dto: CreateLaudoSectionDto): Promise<LaudoSection> {
    const section = this.sectionRepository.create(dto);
    return this.sectionRepository.save(section);
  }

  async findAllSections(
    page: number = 1,
    limit: number = 10,
    includeDetails: boolean = false,
  ): Promise<{
    data: LaudoSection[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  }> {
    const relations = includeDetails ? ['questions', 'questions.options'] : [];

    const [data, total] = await this.sectionRepository.findAndCount({
      relations,
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'ASC' },
    });

    return {
      data,
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };
  }

  async findSectionById(id: string): Promise<LaudoSection> {
    const section = await this.sectionRepository.findOne({
      where: { id },
      relations: ['questions', 'questions.options'],
    });
    if (!section) throw new NotFoundException('Section not found');
    return section;
  }

  async findSectionDetails(id: string): Promise<LaudoSection> {
    const section = await this.sectionRepository.findOne({
      where: { id },
      relations: ['questions', 'questions.options'],
    });
    if (!section) throw new NotFoundException('Section not found');
    return section;
  }

  async updateSection(id: string, dto: UpdateLaudoSectionDto): Promise<LaudoSection> {
    await this.sectionRepository.update(id, dto);
    return this.findSectionById(id);
  }

  async deleteSection(id: string): Promise<void> {
    const result = await this.sectionRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException('Section not found');
  }

  // Questions
  async createQuestion(dto: CreateLaudoQuestionDto): Promise<LaudoQuestion> {
    const question = this.questionRepository.create(dto);
    return this.questionRepository.save(question);
  }

  async findAllQuestions(
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    data: LaudoQuestion[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  }> {
    const [data, total] = await this.questionRepository.findAndCount({
      relations: ['section', 'options'],
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'ASC' },
    });

    return {
      data,
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };
  }

  async findQuestionById(id: string): Promise<LaudoQuestion> {
    const question = await this.questionRepository.findOne({
      where: { id },
      relations: ['section', 'options'],
    });
    if (!question) throw new NotFoundException('Question not found');
    return question;
  }

  async updateQuestion(id: string, dto: UpdateLaudoQuestionDto): Promise<LaudoQuestion> {
    await this.questionRepository.update(id, dto);
    return this.findQuestionById(id);
  }

  async deleteQuestion(id: string): Promise<void> {
    const result = await this.questionRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException('Question not found');
  }

  // Options
  async createOption(dto: CreateLaudoOptionDto): Promise<LaudoOption> {
    const option = this.optionRepository.create(dto);
    return this.optionRepository.save(option);
  }

  async findAllOptions(
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    data: LaudoOption[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  }> {
    const [data, total] = await this.optionRepository.findAndCount({
      relations: ['question'],
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'ASC' },
    });

    return {
      data,
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };
  }

  async findOptionById(id: string): Promise<LaudoOption> {
    const option = await this.optionRepository.findOne({
      where: { id },
      relations: ['question'],
    });
    if (!option) throw new NotFoundException('Option not found');
    return option;
  }

  async updateOption(id: string, dto: UpdateLaudoOptionDto): Promise<LaudoOption> {
    await this.optionRepository.update(id, dto);
    return this.findOptionById(id);
  }

  async deleteOption(id: string): Promise<void> {
    const result = await this.optionRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException('Option not found');
  }
}
