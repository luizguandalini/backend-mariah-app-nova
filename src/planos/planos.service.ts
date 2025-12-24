import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plano } from './entities/plano.entity';
import { CreatePlanoDto } from './dto/create-plano.dto';

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

    const plano = this.planoRepository.create(createPlanoDto);
    return await this.planoRepository.save(plano);
  }

  async findAll(): Promise<Plano[]> {
    return await this.planoRepository.find({
      order: { nome: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Plano> {
    const plano = await this.planoRepository.findOne({ where: { id } });

    if (!plano) {
      throw new NotFoundException('Plano não encontrado');
    }

    return plano;
  }

  async remove(id: string): Promise<void> {
    const plano = await this.findOne(id);
    await this.planoRepository.remove(plano);
  }
}
