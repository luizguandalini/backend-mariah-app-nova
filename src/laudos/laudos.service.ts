import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Laudo, StatusLaudo } from './entities/laudo.entity';
import { CreateLaudoDto } from './dto/create-laudo.dto';
import { UpdateLaudoDto } from './dto/update-laudo.dto';
import { DashboardStatsDto } from './dto/dashboard-stats.dto';
import { Usuario } from '../users/entities/usuario.entity';
import { UserRole } from '../users/enums/user-role.enum';

@Injectable()
export class LaudosService {
  constructor(
    @InjectRepository(Laudo)
    private readonly laudoRepository: Repository<Laudo>,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
  ) {}

  async create(createLaudoDto: CreateLaudoDto): Promise<Laudo> {
    const laudo = this.laudoRepository.create(createLaudoDto);
    return await this.laudoRepository.save(laudo);
  }

  async findAll(): Promise<Laudo[]> {
    return await this.laudoRepository.find({
      relations: ['usuario'],
      order: { createdAt: 'DESC' },
    });
  }

  async findByUsuario(usuarioId: string): Promise<Laudo[]> {
    return await this.laudoRepository.find({
      where: { usuarioId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Laudo> {
    const laudo = await this.laudoRepository.findOne({
      where: { id },
      relations: ['usuario'],
    });

    if (!laudo) {
      throw new NotFoundException('Laudo não encontrado');
    }

    return laudo;
  }

  async update(id: string, updateLaudoDto: UpdateLaudoDto): Promise<Laudo> {
    const laudo = await this.findOne(id);
    Object.assign(laudo, updateLaudoDto);
    return await this.laudoRepository.save(laudo);
  }

  async remove(id: string): Promise<void> {
    const laudo = await this.findOne(id);
    await this.laudoRepository.remove(laudo);
  }

  async getDashboardStats(usuarioId: string): Promise<DashboardStatsDto> {
    const usuario = await this.usuarioRepository.findOne({
      where: { id: usuarioId },
    });

    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Para DEV e ADMIN, mostrar quantidade ilimitada
    const imagensRestantes = [UserRole.DEV, UserRole.ADMIN].includes(usuario.role)
      ? 999999
      : usuario.quantidadeImagens;

    const [totalLaudos, emProcessamento, concluidos] = await Promise.all([
      this.laudoRepository.count({ where: { usuarioId } }),
      this.laudoRepository.count({
        where: { usuarioId, status: StatusLaudo.PROCESSANDO },
      }),
      this.laudoRepository.count({
        where: { usuarioId, status: StatusLaudo.CONCLUIDO },
      }),
    ]);

    return {
      totalLaudos,
      emProcessamento,
      concluidos,
      imagensRestantes,
    };
  }

  async getRecentLaudos(usuarioId: string, limit: number = 5): Promise<Laudo[]> {
    return await this.laudoRepository.find({
      where: { usuarioId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
