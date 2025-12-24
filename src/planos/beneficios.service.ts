import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlanoBeneficio } from './entities/plano-beneficio.entity';
import { CreateBeneficioDto } from './dto/create-beneficio.dto';
import { UpdateBeneficioDto } from './dto/update-beneficio.dto';

@Injectable()
export class BeneficiosService {
  constructor(
    @InjectRepository(PlanoBeneficio)
    private readonly beneficioRepository: Repository<PlanoBeneficio>,
  ) {}

  async create(planoId: string, createBeneficioDto: CreateBeneficioDto): Promise<PlanoBeneficio> {
    // Define a ordem automaticamente (próximo número para este plano)
    const maxOrdem = await this.beneficioRepository
      .createQueryBuilder('beneficio')
      .where('beneficio.planoId = :planoId', { planoId })
      .select('MAX(beneficio.ordem)', 'max')
      .getRawOne();

    const proximaOrdem = (maxOrdem?.max || 0) + 1;

    const beneficio = this.beneficioRepository.create({
      ...createBeneficioDto,
      planoId,
      ordem: proximaOrdem,
    });
    
    return await this.beneficioRepository.save(beneficio);
  }

  async findAllByPlano(planoId: string): Promise<PlanoBeneficio[]> {
    return await this.beneficioRepository.find({
      where: { planoId },
      order: { ordem: 'ASC', createdAt: 'ASC' },
    });
  }

  async findOne(id: string): Promise<PlanoBeneficio> {
    const beneficio = await this.beneficioRepository.findOne({ where: { id } });

    if (!beneficio) {
      throw new NotFoundException('Benefício não encontrado');
    }

    return beneficio;
  }

  async update(id: string, updateBeneficioDto: UpdateBeneficioDto): Promise<PlanoBeneficio> {
    const beneficio = await this.findOne(id);

    // Se estiver mudando a ordem, fazer a troca inteligente
    if (updateBeneficioDto.ordem && updateBeneficioDto.ordem !== beneficio.ordem) {
      await this.trocarOrdem(beneficio.planoId, beneficio.id, beneficio.ordem, updateBeneficioDto.ordem);
    }

    Object.assign(beneficio, updateBeneficioDto);
    return await this.beneficioRepository.save(beneficio);
  }

  async remove(id: string): Promise<void> {
    const beneficio = await this.findOne(id);
    await this.beneficioRepository.remove(beneficio);
  }

  async removeAllByPlano(planoId: string): Promise<void> {
    await this.beneficioRepository.delete({ planoId });
  }

  private async trocarOrdem(planoId: string, beneficioId: string, ordemAtual: number, novaOrdem: number): Promise<void> {
    // Encontra o benefício que está na posição de destino (do mesmo plano)
    const beneficioNaPosicao = await this.beneficioRepository.findOne({
      where: { 
        planoId,
        ordem: novaOrdem,
      },
    });

    // Se existe um benefício na posição, troca as ordens
    if (beneficioNaPosicao && beneficioNaPosicao.id !== beneficioId) {
      beneficioNaPosicao.ordem = ordemAtual;
      await this.beneficioRepository.save(beneficioNaPosicao);
    }
  }
}
