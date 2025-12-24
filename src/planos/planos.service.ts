import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plano } from './entities/plano.entity';
import { CreatePlanoDto } from './dto/create-plano.dto';
import { UpdatePlanoDto } from './dto/update-plano.dto';

@Injectable()
export class PlanosService {
  constructor(
    @InjectRepository(Plano)
    private readonly planoRepository: Repository<Plano>,
  ) {}

  async create(createPlanoDto: CreatePlanoDto): Promise<Plano> {
    // Verifica se já existe um plano com esse nome
    const planoExistente = await this.planoRepository.findOne({
      where: { nome: createPlanoDto.nome },
    });

    if (planoExistente) {
      throw new ConflictException('Já existe um plano com este nome');
    }

    // Define a ordem automaticamente (próximo número)
    const maxOrdem = await this.planoRepository
      .createQueryBuilder('plano')
      .select('MAX(plano.ordem)', 'max')
      .getRawOne();

    const proximaOrdem = (maxOrdem?.max || 0) + 1;

    const plano = this.planoRepository.create({
      ...createPlanoDto,
      ordem: proximaOrdem,
    });
    
    return await this.planoRepository.save(plano);
  }

  async findAll(): Promise<Plano[]> {
    return await this.planoRepository.find({
      relations: ['beneficios'],
      where: { ativo: true },
      order: { ordem: 'ASC', nome: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Plano> {
    const plano = await this.planoRepository.findOne({ 
      where: { id },
      relations: ['beneficios'],
    });

    if (!plano) {
      throw new NotFoundException('Plano não encontrado');
    }

    return plano;
  }

  async update(id: string, updatePlanoDto: UpdatePlanoDto): Promise<Plano> {
    const plano = await this.findOne(id);
    
    // Verifica se está tentando mudar para um nome que já existe
    if (updatePlanoDto.nome && updatePlanoDto.nome !== plano.nome) {
      const planoExistente = await this.planoRepository.findOne({
        where: { nome: updatePlanoDto.nome },
      });

      if (planoExistente) {
        throw new ConflictException('Já existe um plano com este nome');
      }
    }

    // Se estiver mudando a ordem, fazer a troca inteligente
    if (updatePlanoDto.ordem && updatePlanoDto.ordem !== plano.ordem) {
      await this.trocarOrdem(plano.id, plano.ordem, updatePlanoDto.ordem);
    }

    Object.assign(plano, updatePlanoDto);
    return await this.planoRepository.save(plano);
  }

  async remove(id: string): Promise<void> {
    const plano = await this.findOne(id);
    await this.planoRepository.remove(plano);
  }

  private async trocarOrdem(planoId: string, ordemAtual: number, novaOrdem: number): Promise<void> {
    // Encontra o plano que está na posição de destino
    const planoNaPosicao = await this.planoRepository.findOne({
      where: { ordem: novaOrdem },
    });

    // Se existe um plano na posição, troca as ordens
    if (planoNaPosicao && planoNaPosicao.id !== planoId) {
      planoNaPosicao.ordem = ordemAtual;
      await this.planoRepository.save(planoNaPosicao);
    }
  }
}
