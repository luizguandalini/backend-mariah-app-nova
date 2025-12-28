import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Laudo, StatusLaudo } from './entities/laudo.entity';
import { CreateLaudoDto } from './dto/create-laudo.dto';
import { UpdateLaudoDto } from './dto/update-laudo.dto';
import { UpdateLaudoDetalhesDto } from './dto/update-laudo-detalhes.dto';
import { DashboardStatsDto } from './dto/dashboard-stats.dto';
import { Usuario } from '../users/entities/usuario.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { LaudoOption } from '../laudo-details/entities/laudo-option.entity';
import { LaudoSection } from '../laudo-details/entities/laudo-section.entity';

@Injectable()
export class LaudosService {
  constructor(
    @InjectRepository(Laudo)
    private readonly laudoRepository: Repository<Laudo>,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    @InjectRepository(LaudoOption)
    private readonly optionRepository: Repository<LaudoOption>,
    @InjectRepository(LaudoSection)
    private readonly sectionRepository: Repository<LaudoSection>,
  ) {}

  async getLaudoDetalhes(id: string) {
    const laudo = await this.laudoRepository.findOne({ where: { id } });
    if (!laudo) {
      throw new NotFoundException('Laudo não encontrado');
    }

    // Buscar todas as seções com suas perguntas e opções
    const sections = await this.sectionRepository.find({
      relations: ['questions', 'questions.options'],
      order: { createdAt: 'ASC' },
    });

    // Retorna os detalhes do laudo + estrutura completa para edição
    return {
      incluirAtestado: laudo.incluirAtestado,
      atestado: laudo.atestado,
      analisesHidraulicas: laudo.analisesHidraulicas,
      analisesEletricas: laudo.analisesEletricas,
      sistemaAr: laudo.sistemaAr,
      mecanismosAbertura: laudo.mecanismosAbertura,
      revestimentos: laudo.revestimentos,
      mobilias: laudo.mobilias,
      // Estrutura completa para construir formulário de edição
      availableSections: sections,
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

  async updateLaudoDetalhes(
    id: string,
    updateDto: UpdateLaudoDetalhesDto,
    user: any,
  ): Promise<Laudo> {
    const laudo = await this.laudoRepository.findOne({
      where: { id },
      relations: ['usuario'],
    });

    if (!laudo) {
      throw new NotFoundException('Laudo não encontrado');
    }

    // Verifica permissão (dono ou admin/dev)
    const isOwner = laudo.usuario.id === user.id;
    const isAdminOrDev = user.role === UserRole.ADMIN || user.role === UserRole.DEV;

    if (!isOwner && !isAdminOrDev) {
      throw new UnauthorizedException(
        'Você não tem permissão para editar este laudo',
      );
    }

    // Validar todas as opções fornecidas
    await this.validateLaudoDetalhes(updateDto);

    // Atualizar apenas os campos de detalhes
    if (updateDto.atestado !== undefined) {
      laudo.atestado = updateDto.atestado;
    }
    if (updateDto.analisesHidraulicas !== undefined) {
      laudo.analisesHidraulicas = updateDto.analisesHidraulicas as any;
    }
    if (updateDto.analisesEletricas !== undefined) {
      laudo.analisesEletricas = updateDto.analisesEletricas as any;
    }
    if (updateDto.sistemaAr !== undefined) {
      laudo.sistemaAr = updateDto.sistemaAr as any;
    }
    if (updateDto.mecanismosAbertura !== undefined) {
      laudo.mecanismosAbertura = updateDto.mecanismosAbertura as any;
    }
    if (updateDto.revestimentos !== undefined) {
      laudo.revestimentos = updateDto.revestimentos as any;
    }
    if (updateDto.mobilias !== undefined) {
      laudo.mobilias = updateDto.mobilias as any;
    }

    return await this.laudoRepository.save(laudo);
  }

  /**
   * Valida se todos os valores fornecidos existem como opções cadastradas
   */
  private async validateLaudoDetalhes(
    updateDto: UpdateLaudoDetalhesDto,
  ): Promise<void> {
    const valuesToValidate: string[] = [];

    // Coletar todos os valores não-vazios
    if (updateDto.atestado) {
      valuesToValidate.push(updateDto.atestado);
    }

    const collectValues = (obj: any) => {
      if (obj && typeof obj === 'object') {
        Object.values(obj).forEach((value) => {
          if (typeof value === 'string' && value.trim() !== '') {
            valuesToValidate.push(value);
          }
        });
      }
    };

    collectValues(updateDto.analisesHidraulicas);
    collectValues(updateDto.analisesEletricas);
    collectValues(updateDto.sistemaAr);
    collectValues(updateDto.mecanismosAbertura);
    collectValues(updateDto.revestimentos);
    collectValues(updateDto.mobilias);

    if (valuesToValidate.length === 0) {
      return; // Nada para validar
    }

    // Buscar todas as opções válidas do banco
    const validOptions = await this.optionRepository.find({
      select: ['optionText'],
    });

    const validTexts = new Set(validOptions.map((opt) => opt.optionText));

    // Verificar se todos os valores fornecidos são válidos
    const invalidValues = valuesToValidate.filter(
      (value) => !validTexts.has(value),
    );

    if (invalidValues.length > 0) {
      throw new BadRequestException(
        `Os seguintes valores não são opções válidas: ${invalidValues.join(', ')}`,
      );
    }
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
