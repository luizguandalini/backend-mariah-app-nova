import { Injectable, NotFoundException, ConflictException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ambiente } from './entities/ambiente.entity';
import { CreateAmbienteDto } from './dto/create-ambiente.dto';
import { UpdateAmbienteDto } from './dto/update-ambiente.dto';
import { ItensAmbienteService } from './itens-ambiente.service';

@Injectable()
export class AmbientesService {
  constructor(
    @InjectRepository(Ambiente)
    private readonly ambienteRepository: Repository<Ambiente>,
    @Inject(forwardRef(() => ItensAmbienteService))
    private readonly itensAmbienteService: ItensAmbienteService,
  ) {}

  async create(createAmbienteDto: CreateAmbienteDto): Promise<Ambiente> {
    const ambienteExistente = await this.ambienteRepository.findOne({
      where: { nome: createAmbienteDto.nome },
    });

    if (ambienteExistente) {
      throw new ConflictException('Já existe um ambiente com este nome');
    }

    // Define a ordem automaticamente
    const maxOrdem = await this.ambienteRepository
      .createQueryBuilder('ambiente')
      .select('MAX(ambiente.ordem)', 'max')
      .getRawOne();

    const proximaOrdem = (maxOrdem?.max || 0) + 1;

    const ambiente = this.ambienteRepository.create({
      ...createAmbienteDto,
      ordem: proximaOrdem,
    });

    return await this.ambienteRepository.save(ambiente);
  }

  async findAll(): Promise<Ambiente[]> {
    return await this.ambienteRepository.find({
      where: { ativo: true },
      order: { ordem: 'ASC', nome: 'ASC' },
    });
  }

  async findAllWithTree(): Promise<any[]> {
    const ambientes = await this.ambienteRepository.find({
      where: { ativo: true },
      order: { ordem: 'ASC', nome: 'ASC' },
    });

    const ambientesComItens = await Promise.all(
      ambientes.map(async (ambiente) => {
        const itens = await this.itensAmbienteService.findAllByAmbiente(ambiente.id);
        return {
          ...ambiente,
          itens,
        };
      }),
    );

    return ambientesComItens;
  }

  async findOne(id: string): Promise<Ambiente> {
    const ambiente = await this.ambienteRepository.findOne({ 
      where: { id },
      relations: ['itens'],
    });

    if (!ambiente) {
      throw new NotFoundException('Ambiente não encontrado');
    }

    return ambiente;
  }

  async update(id: string, updateAmbienteDto: UpdateAmbienteDto): Promise<Ambiente> {
    const ambiente = await this.findOne(id);

    if (updateAmbienteDto.nome && updateAmbienteDto.nome !== ambiente.nome) {
      const ambienteExistente = await this.ambienteRepository.findOne({
        where: { nome: updateAmbienteDto.nome },
      });

      if (ambienteExistente) {
        throw new ConflictException('Já existe um ambiente com este nome');
      }
    }

    // Troca ordem se necessário
    if (updateAmbienteDto.ordem && updateAmbienteDto.ordem !== ambiente.ordem) {
      await this.trocarOrdem(ambiente.id, ambiente.ordem, updateAmbienteDto.ordem);
    }

    Object.assign(ambiente, updateAmbienteDto);
    return await this.ambienteRepository.save(ambiente);
  }

  async remove(id: string): Promise<void> {
    const ambiente = await this.findOne(id);
    await this.ambienteRepository.remove(ambiente);
  }

  private async trocarOrdem(ambienteId: string, ordemAtual: number, novaOrdem: number): Promise<void> {
    const ambienteNaPosicao = await this.ambienteRepository.findOne({
      where: { ordem: novaOrdem },
    });

    if (ambienteNaPosicao && ambienteNaPosicao.id !== ambienteId) {
      ambienteNaPosicao.ordem = ordemAtual;
      await this.ambienteRepository.save(ambienteNaPosicao);
    }
  }
}
