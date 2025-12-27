import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
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

  async getLaudoDetalhes(id: string) {
    const laudo = await this.laudoRepository.findOne({ where: { id } });
    if (!laudo) {
      throw new NotFoundException('Laudo não encontrado');
    }
    // Retorna apenas os campos de detalhes
    return {
      incluirAtestado: laudo.incluirAtestado,
      atestado: laudo.atestado,
      analisesHidraulicas: laudo.analisesHidraulicas,
      analisesEletricas: laudo.analisesEletricas,
      sistemaAr: laudo.sistemaAr,
      mecanismosAbertura: laudo.mecanismosAbertura,
      revestimentos: laudo.revestimentos,
      mobilias: laudo.mobilias,
    };
  }

  async create(createLaudoDto: CreateLaudoDto): Promise<Laudo> {
    const laudo = this.laudoRepository.create(createLaudoDto);
    return await this.laudoRepository.save(laudo);
  }

  async findAll(): Promise<Partial<Laudo>[]> {
    const laudos = await this.laudoRepository.find({
      relations: ['usuario'],
      order: { createdAt: 'DESC' },
    });
    return laudos.map((l) => ({
      id: l.id,
      usuarioId: l.usuarioId,
      endereco: l.endereco,
      rua: l.rua,
      numero: l.numero,
      complemento: l.complemento,
      bairro: l.bairro,
      cidade: l.cidade,
      estado: l.estado,
      cep: l.cep,
      tipoVistoria: l.tipoVistoria,
      tipoUso: l.tipoUso,
      tipoImovel: l.tipoImovel,
      tipo: l.tipo,
      unidade: l.unidade,
      status: l.status,
      tamanho: l.tamanho,
      pdfUrl: l.pdfUrl,
      totalAmbientes: l.totalAmbientes,
      totalFotos: l.totalFotos,
      latitude: l.latitude,
      longitude: l.longitude,
      enderecoCompletoGps: l.enderecoCompletoGps,
      incluirAtestado: l.incluirAtestado,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    }));
  }

  async findByUsuario(usuarioId: string): Promise<Partial<Laudo>[]> {
    const laudos = await this.laudoRepository.find({
      where: { usuarioId },
      order: { createdAt: 'DESC' },
    });
    return laudos.map((l) => ({
      id: l.id,
      usuarioId: l.usuarioId,
      endereco: l.endereco,
      rua: l.rua,
      numero: l.numero,
      complemento: l.complemento,
      bairro: l.bairro,
      cidade: l.cidade,
      estado: l.estado,
      cep: l.cep,
      tipoVistoria: l.tipoVistoria,
      tipoUso: l.tipoUso,
      tipoImovel: l.tipoImovel,
      tipo: l.tipo,
      unidade: l.unidade,
      status: l.status,
      tamanho: l.tamanho,
      pdfUrl: l.pdfUrl,
      totalAmbientes: l.totalAmbientes,
      totalFotos: l.totalFotos,
      latitude: l.latitude,
      longitude: l.longitude,
      enderecoCompletoGps: l.enderecoCompletoGps,
      incluirAtestado: l.incluirAtestado,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    }));
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

  async remove(id: string, user: any): Promise<void> {
    const laudo = await this.findOne(id);

    // Verifica se o usuário é o dono do laudo ou é admin/dev
    const isOwner = laudo.usuario.id === user.id;
    const isAdminOrDev = user.role === 'ADMIN' || user.role === 'DEV';

    if (!isOwner && !isAdminOrDev) {
      throw new UnauthorizedException('Você não tem permissão para deletar este laudo');
    }

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

  async getRecentLaudos(usuarioId: string, limit: number = 5): Promise<Partial<Laudo>[]> {
    const laudos = await this.laudoRepository.find({
      where: { usuarioId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return laudos.map((l) => ({
      id: l.id,
      usuarioId: l.usuarioId,
      endereco: l.endereco,
      rua: l.rua,
      numero: l.numero,
      complemento: l.complemento,
      bairro: l.bairro,
      cidade: l.cidade,
      estado: l.estado,
      cep: l.cep,
      tipoVistoria: l.tipoVistoria,
      tipoUso: l.tipoUso,
      tipoImovel: l.tipoImovel,
      tipo: l.tipo,
      unidade: l.unidade,
      status: l.status,
      tamanho: l.tamanho,
      pdfUrl: l.pdfUrl,
      totalAmbientes: l.totalAmbientes,
      totalFotos: l.totalFotos,
      latitude: l.latitude,
      longitude: l.longitude,
      enderecoCompletoGps: l.enderecoCompletoGps,
      incluirAtestado: l.incluirAtestado,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    }));
  }
}
