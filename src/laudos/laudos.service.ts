import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Laudo, StatusLaudo } from './entities/laudo.entity';
import { CreateLaudoDto } from './dto/create-laudo.dto';
import { UpdateLaudoDto } from './dto/update-laudo.dto';
import { UpdateLaudoDetalhesDto } from './dto/update-laudo-detalhes.dto';
import { UpdateLaudoEnderecoDto } from './dto/update-laudo-endereco.dto';
import { DashboardStatsDto } from './dto/dashboard-stats.dto';
import { Usuario } from '../users/entities/usuario.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { LaudoOption } from '../laudo-details/entities/laudo-option.entity';
import { LaudoSection } from '../laudo-details/entities/laudo-section.entity';
import { ImagemLaudo } from '../uploads/entities/imagem-laudo.entity';
import { ImagensPdfResponseDto, ImagemPdfDto } from './dto/imagens-pdf-response.dto';
import { EstrategiaConflitoAmbienteWeb } from './dto/add-ambiente-web.dto';

import { UploadsService } from '../uploads/uploads.service';
import { RabbitMQService } from '../queue/rabbitmq.service';

export interface PaginatedLaudosResult {
  data: LaudoListItem[];
  total: number;
  page: number;
  lastPage: number;
}

export type LaudoListItem = Partial<Laudo> & {
  usuarioNome?: string;
  usuarioEmail?: string;
};

type AmbienteWeb = { nomeAmbiente: string; tipoAmbiente: string; ordem: number };
const MAX_AMBIENTE_NOME_LENGTH = 100;

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
    @InjectRepository(ImagemLaudo)
    private readonly imagemRepository: Repository<ImagemLaudo>,
    private readonly uploadsService: UploadsService,
    private readonly rabbitMQService: RabbitMQService,
  ) {}

  // ... (métodos existentes)

  async requestPdfGeneration(
    laudoId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<{ message: string; status: string }> {
    const laudo = await this.findOne(laudoId);

    // Verificar permissão
    const isOwner = laudo.usuarioId === userId;
    const isAdminOrDev = [UserRole.DEV, UserRole.ADMIN].includes(userRole);

    if (!isOwner && !isAdminOrDev) {
      throw new ForbiddenException('Você não tem permissão para gerar o PDF deste laudo');
    }

    // Verificar se já está processando ou pendente na fila
    if (laudo.pdfStatus === 'PROCESSING' || laudo.pdfStatus === 'PENDING') {
      throw new BadRequestException('O PDF já está sendo gerado ou está na fila. Aguarde.');
    }

    // Se já foi gerado e está completed, talvez queiramos regenerar?
    // O usuário clicou em "Baixar Laudo" no front. Se tiver URL, o front baixa direto.
    // Se o front chamou esse endpoint, é porque quer gerar/regenerar.

    // Atualizar status para PENDING
    // NÃO limpamos pdfUrl aqui para que o PdfService possa acessar a URL antiga
    // e deletar o arquivo antigo do S3 após gerar o novo com sucesso
    await this.laudoRepository.update(laudoId, {
      pdfStatus: 'PENDING',
      pdfProgress: 0,
      // pdfUrl mantido para deleção do antigo
    });

    // Adicionar à fila
    const success = await this.rabbitMQService.addToPdfQueue({
      laudoId,
      usuarioId: userId,
      priority: 5, // Prioridade padrão
    });

    if (!success) {
      // Reverter status se falhar ao enfileirar
      await this.laudoRepository.update(laudoId, {
        pdfStatus: 'ERROR',
        pdfProgress: 0,
      });
      throw new BadRequestException('Erro ao enfileirar pedido de PDF. Tente novamente.');
    }

    return {
      message: 'Solicitação de PDF enviada com sucesso',
      status: 'PENDING',
    };
  }

  // ... (rest of methods)

  async remove(id: string, user: any): Promise<void> {
    const laudo = await this.findOne(id);

    // Verifica se o usuário é o dono do laudo ou é admin/dev
    const isOwner = laudo.usuario.id === user.id;
    const isAdminOrDev = user.role === 'ADMIN' || user.role === 'DEV';

    if (!isOwner && !isAdminOrDev) {
      throw new UnauthorizedException('Você não tem permissão para deletar este laudo');
    }

    await this.laudoRepository.manager.transaction(async (transactionalEntityManager) => {
      // 1. Calcular quantos créditos devolver (imagens não analisadas)
      // Apenas devolve se não for ADMIN/DEV (pois eles têm ilimitado)
      if (![UserRole.DEV, UserRole.ADMIN].includes(user.role)) {
        const refundableImagesCount = await this.imagemRepository.count({
          where: {
            laudoId: id,
            imagemJaFoiAnalisadaPelaIa: 'nao',
          },
        });

        if (refundableImagesCount > 0) {
          const usuario = await transactionalEntityManager.findOne(Usuario, {
            where: { id: laudo.usuario.id },
            lock: { mode: 'pessimistic_write' },
          });

          if (usuario) {
            usuario.quantidadeImagens += refundableImagesCount;
            await transactionalEntityManager.save(usuario);
          }
        }
      }

      // 2. Deletar PDF do S3 (se existir)
      if (laudo.pdfUrl) {
        try {
          // Extrair s3Key da URL do PDF usando regex
          // Padrão S3 Key: laudos/pdf/{id}_{timestamp}.pdf
          const match = laudo.pdfUrl.match(/(laudos\/pdf\/[^?]+)/);
          if (match && match[1]) {
            const pdfS3Key = match[1];
            await this.uploadsService.deleteFile(pdfS3Key);
          }
        } catch (err) {
          // Não interrompe o fluxo se falhar a deleção do PDF
          console.warn('Falha ao tentar remover PDF do S3:', err);
        }
      }

      // 3. Deletar imagens do S3 (operação async fora do banco)
      // Nota: Idealmente faríamos isso fora da transaction do banco se quiséssemos atomicidade rigorosa do banco vs falha S3,
      // mas aqui queremos garantir que o banco só muda se tudo correr "bem" ou pelo menos iniciarmos o processo.
      // Como o delete do S3 não é transacional com o banco, se falhar o S3, o banco pode rollbackar ou não dependendo de onde colocarmos.
      // O requisito diz "solução robusta".
      // Se colocarmos o S3 delete ANTES do remove do banco mas DENTRO da transaction function, se o S3 der erro (throw), a transaction do banco nem commita.
      // Porém, o S3 delete pode demorar. Vamos manter a chamada await aqui.
      await this.uploadsService.deleteImagensByLaudo(id);

      // 3. Remover o laudo (CASCADE irá remover as imagens do banco)
      await transactionalEntityManager.remove(laudo);
    });
  }

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
      dadosExtra: laudo.dadosExtra,
      // Estrutura completa para construir formulário de edição
      availableSections: sections,
    };
  }

  async create(createLaudoDto: CreateLaudoDto): Promise<Laudo> {
    if (!createLaudoDto.usuarioId) {
      throw new Error('usuarioId não foi fornecido ao criar o laudo.');
    }

    // TypeORM requer o objeto de relacionamento preenchido para chaves estrangeiras,
    // além da coluna simples, em alguns setups confiltantes de @JoinColumn + @Column.
    const laudo = this.laudoRepository.create({
      ...createLaudoDto,
      usuario: { id: createLaudoDto.usuarioId },
    });

    return await this.laudoRepository.save(laudo);
  }

  /**
   * Adiciona um ambiente à lista web de ambientes do laudo
   */
  async addAmbienteWeb(
    laudoId: string,
    userId: string,
    userRole: UserRole,
    nomeAmbiente: string,
    tipoAmbiente: string,
    numeroAmbiente: number,
    estrategiaConflito: EstrategiaConflitoAmbienteWeb = EstrategiaConflitoAmbienteWeb.ERRO,
  ): Promise<{ nomeAmbiente: string; tipoAmbiente: string; ordem: number }[]> {
    const laudo = await this.findOne(laudoId);

    const isOwner = laudo.usuarioId === userId;
    const isAdminOrDev = [UserRole.DEV, UserRole.ADMIN].includes(userRole);
    if (!isOwner && !isAdminOrDev) {
      throw new ForbiddenException('Você não tem permissão para editar este laudo');
    }

    const ambientes = this.normalizarOrdensAmbientes(laudo.ambientesWeb || []);
    const tipoAmbienteLimpo = (tipoAmbiente || '').trim();
    const nomeAmbienteLimpo = (nomeAmbiente || '').trim();

    if (!tipoAmbienteLimpo) {
      throw new BadRequestException('Tipo do ambiente é obrigatório');
    }

    const ordemDesejada = numeroAmbiente - 1;
    if (ordemDesejada < 0 || ordemDesejada > ambientes.length) {
      throw new BadRequestException(
        `Número do ambiente inválido. Informe um valor entre 1 e ${ambientes.length + 1}.`,
      );
    }

    const nomeFinal = `${numeroAmbiente} - ${tipoAmbienteLimpo}`;
    if (nomeFinal.length > MAX_AMBIENTE_NOME_LENGTH) {
      throw new BadRequestException(
        `O nome do ambiente deve ter no máximo ${MAX_AMBIENTE_NOME_LENGTH} caracteres`,
      );
    }

    if (
      ambientes.some(
        (a) =>
          a.nomeAmbiente.trim().toLowerCase() === nomeFinal.trim().toLowerCase() ||
          a.nomeAmbiente.trim().toLowerCase() === nomeAmbienteLimpo.toLowerCase(),
      )
    ) {
      throw new BadRequestException(`Já existe um ambiente chamado "${nomeFinal}" neste laudo`);
    }

    const ambienteConflitante = ambientes.find((a) => a.ordem === ordemDesejada);
    if (ambienteConflitante && estrategiaConflito !== EstrategiaConflitoAmbienteWeb.DESLOCAR) {
      throw new ConflictException(
        `A posição ${numeroAmbiente} já está ocupada por "${ambienteConflitante.nomeAmbiente}". Ajuste o número ou escolha deslocar os ambientes existentes.`,
      );
    }

    const ambientesAtualizados = ambientes.map((amb) => {
      if (amb.ordem >= ordemDesejada) {
        return { ...amb, ordem: amb.ordem + 1 };
      }
      return amb;
    });

    const novoAmbiente = {
      nomeAmbiente: nomeFinal,
      tipoAmbiente: tipoAmbienteLimpo,
      ordem: ordemDesejada,
    };

    ambientesAtualizados.push(novoAmbiente);
    const ambientesOrdenados = this.normalizarOrdensAmbientes(ambientesAtualizados);

    await this.laudoRepository.update(laudoId, {
      ambientesWeb: ambientesOrdenados,
      totalAmbientes: ambientesOrdenados.length,
    });

    return ambientesOrdenados;
  }

  async renomearAmbienteWeb(
    laudoId: string,
    userId: string,
    userRole: UserRole,
    nomeAtual: string,
    novoNome: string,
  ): Promise<AmbienteWeb[]> {
    const laudo = await this.findOne(laudoId);

    const isOwner = laudo.usuarioId === userId;
    const isAdminOrDev = [UserRole.DEV, UserRole.ADMIN].includes(userRole);
    if (!isOwner && !isAdminOrDev) {
      throw new ForbiddenException('Você não tem permissão para editar este laudo');
    }

    const nomeAtualLimpo = (nomeAtual || '').trim();
    const novoNomeLimpo = (novoNome || '').trim();

    if (!nomeAtualLimpo || !novoNomeLimpo) {
      throw new BadRequestException('Nome atual e novo nome do ambiente são obrigatórios');
    }

    if (novoNomeLimpo.length > MAX_AMBIENTE_NOME_LENGTH) {
      throw new BadRequestException(
        `O novo nome do ambiente deve ter no máximo ${MAX_AMBIENTE_NOME_LENGTH} caracteres`,
      );
    }

    const ambientes = this.normalizarOrdensAmbientes(laudo.ambientesWeb || []);
    const ambienteAtual = ambientes.find(
      (a) => a.nomeAmbiente.trim().toLowerCase() === nomeAtualLimpo.toLowerCase(),
    );

    if (!ambienteAtual) {
      throw new NotFoundException(`Ambiente "${nomeAtualLimpo}" não encontrado neste laudo`);
    }

    const ambienteDuplicado = ambientes.find(
      (a) =>
        a.nomeAmbiente.trim().toLowerCase() === novoNomeLimpo.toLowerCase() &&
        a.nomeAmbiente !== ambienteAtual.nomeAmbiente,
    );
    if (ambienteDuplicado) {
      throw new ConflictException(`Já existe um ambiente chamado "${novoNomeLimpo}" neste laudo`);
    }

    const ambientesAtualizados = ambientes.map((ambiente) => {
      if (ambiente.nomeAmbiente === ambienteAtual.nomeAmbiente) {
        return {
          ...ambiente,
          nomeAmbiente: novoNomeLimpo,
        };
      }
      return ambiente;
    });

    await this.laudoRepository.manager.transaction(async (transactionalEntityManager) => {
      await transactionalEntityManager.update(
        ImagemLaudo,
        { laudoId, ambiente: ambienteAtual.nomeAmbiente },
        { ambiente: novoNomeLimpo },
      );

      await transactionalEntityManager.update(
        Laudo,
        { id: laudoId },
        {
          ambientesWeb: ambientesAtualizados,
          totalAmbientes: ambientesAtualizados.length,
        },
      );
    });

    return ambientesAtualizados;
  }

  /**
   * Remove um ambiente da lista web de ambientes do laudo
   */
  async removeAmbienteWeb(
    laudoId: string,
    userId: string,
    userRole: UserRole,
    nomeAmbiente: string,
  ): Promise<{ nomeAmbiente: string; tipoAmbiente: string; ordem: number }[]> {
    const laudo = await this.findOne(laudoId);

    const isOwner = laudo.usuarioId === userId;
    const isAdminOrDev = [UserRole.DEV, UserRole.ADMIN].includes(userRole);
    if (!isOwner && !isAdminOrDev) {
      throw new ForbiddenException('Você não tem permissão para editar este laudo');
    }

    let ambientes = this.normalizarOrdensAmbientes(laudo.ambientesWeb || []);
    ambientes = ambientes.filter((a) => a.nomeAmbiente !== nomeAmbiente);

    ambientes.forEach((a, i) => {
      a.ordem = i;
    });

    const imagensDoAmbiente = await this.imagemRepository.find({
      where: { laudoId, ambiente: nomeAmbiente },
      select: ['id', 's3Key', 'imagemJaFoiAnalisadaPelaIa'],
    });
    const imagemIds = imagensDoAmbiente.map((img) => img.id);
    const s3Keys = imagensDoAmbiente.map((img) => img.s3Key);
    const deveDevolverCreditos = !isAdminOrDev;
    const creditosParaDevolver = deveDevolverCreditos
      ? imagensDoAmbiente.filter((img) => img.imagemJaFoiAnalisadaPelaIa === 'nao').length
      : 0;

    await this.laudoRepository.manager.transaction(async (transactionalEntityManager) => {
      if (imagemIds.length > 0) {
        await transactionalEntityManager.query(
          `UPDATE analysis_queue
           SET current_image_id = NULL
           WHERE current_image_id = ANY($1::uuid[])`,
          [imagemIds],
        );
      }

      if (creditosParaDevolver > 0) {
        const usuario = await transactionalEntityManager.findOne(Usuario, {
          where: { id: laudo.usuarioId },
          lock: { mode: 'pessimistic_write' },
        });
        if (usuario) {
          usuario.quantidadeImagens += creditosParaDevolver;
          await transactionalEntityManager.save(usuario);
        }
      }

      if (imagemIds.length > 0) {
        await transactionalEntityManager.delete(ImagemLaudo, {
          id: In(imagemIds),
        });
      }

      const totalFotosAtualizadas = await transactionalEntityManager.count(ImagemLaudo, {
        where: { laudoId },
      });

      await transactionalEntityManager.update(
        Laudo,
        { id: laudoId },
        {
          ambientesWeb: ambientes,
          totalAmbientes: ambientes.length,
          totalFotos: totalFotosAtualizadas,
        },
      );
    });

    await this.uploadsService.deleteS3ObjectsBatch(s3Keys);

    return ambientes;
  }

  /**
   * Lista ambientes web do laudo (do JSON + merge com imagens existentes)
   */
  async getAmbientesWeb(
    laudoId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<{
    ambientes: {
      nomeAmbiente: string;
      tipoAmbiente: string;
      ordem: number;
      totalImagens: number;
    }[];
    tipoUso?: string;
    tipoImovel?: string;
  }> {
    const laudo = await this.findOne(laudoId);

    const isOwner = laudo.usuarioId === userId;
    const isAdminOrDev = [UserRole.DEV, UserRole.ADMIN].includes(userRole);
    if (!isOwner && !isAdminOrDev) {
      throw new ForbiddenException('Você não tem permissão para ver este laudo');
    }

    const ambientesWeb = this.normalizarOrdensAmbientes(laudo.ambientesWeb || []);

    // Contar imagens por ambiente
    const imagensByAmbiente = await this.imagemRepository
      .createQueryBuilder('img')
      .select('img.ambiente', 'ambiente')
      .addSelect('COUNT(*)', 'totalImagens')
      .where('img.laudo_id = :laudoId', { laudoId })
      .andWhere('img.ambiente IS NOT NULL')
      .andWhere("img.ambiente != ''")
      .groupBy('img.ambiente')
      .getRawMany();

    const imagensMap = new Map<string, number>();
    imagensByAmbiente.forEach((row) => {
      imagensMap.set(row.ambiente, parseInt(row.totalImagens, 10));
    });

    // Combinar: ambientes web com contagem de imagens
    const resultado = ambientesWeb.map((amb) => ({
      ...amb,
      totalImagens: imagensMap.get(amb.nomeAmbiente) || 0,
    }));

    return {
      ambientes: resultado,
      tipoUso: laudo.tipoUso,
      tipoImovel: laudo.tipoImovel,
    };
  }

  async reordenarAmbientesWeb(
    laudoId: string,
    userId: string,
    userRole: UserRole,
    nomesAmbientes: string[],
  ): Promise<AmbienteWeb[]> {
    const laudo = await this.findOne(laudoId);

    const isOwner = laudo.usuarioId === userId;
    const isAdminOrDev = [UserRole.DEV, UserRole.ADMIN].includes(userRole);
    if (!isOwner && !isAdminOrDev) {
      throw new ForbiddenException('Você não tem permissão para editar este laudo');
    }

    const ambientes = this.normalizarOrdensAmbientes(laudo.ambientesWeb || []);
    if (ambientes.length === 0) {
      throw new BadRequestException('Não há ambientes para reordenar');
    }

    if (nomesAmbientes.length !== ambientes.length) {
      throw new BadRequestException(
        'A lista de reordenação deve conter todos os ambientes do laudo',
      );
    }

    const nomesExistentes = new Set(ambientes.map((a) => a.nomeAmbiente));
    if (new Set(nomesAmbientes).size !== nomesAmbientes.length) {
      throw new BadRequestException('A lista de reordenação contém ambientes duplicados');
    }

    for (const nome of nomesAmbientes) {
      if (!nomesExistentes.has(nome)) {
        throw new BadRequestException(`Ambiente "${nome}" não pertence ao laudo`);
      }
    }

    const ambienteMap = new Map(ambientes.map((a) => [a.nomeAmbiente, a] as const));
    const ambientesReordenados = nomesAmbientes.map((nome, index) => {
      const ambiente = ambienteMap.get(nome);
      return {
        nomeAmbiente: ambiente.nomeAmbiente,
        tipoAmbiente: ambiente.tipoAmbiente,
        ordem: index,
      };
    });

    await this.laudoRepository.update(laudoId, {
      ambientesWeb: ambientesReordenados,
      totalAmbientes: ambientesReordenados.length,
    });

    return ambientesReordenados;
  }

  private normalizarOrdensAmbientes(ambientes: AmbienteWeb[]): AmbienteWeb[] {
    return [...(ambientes || [])]
      .sort((a, b) => a.ordem - b.ordem)
      .map((ambiente, index) => ({
        nomeAmbiente: ambiente.nomeAmbiente,
        tipoAmbiente: ambiente.tipoAmbiente,
        ordem: index,
      }));
  }

  async findAll(
    page: number = 1,
    limit: number = 15,
    status?: string,
  ): Promise<PaginatedLaudosResult> {
    const sanitizedPage = Math.max(1, Number(page) || 1);
    const sanitizedLimit = Math.max(1, Math.min(100, Number(limit) || 15));
    const statusFilter = this.parseStatusFilter(status);

    const [laudos, total] = await this.laudoRepository.findAndCount({
      where: statusFilter ? { status: statusFilter } : {},
      relations: ['usuario'],
      order: { createdAt: 'DESC' },
      skip: (sanitizedPage - 1) * sanitizedLimit,
      take: sanitizedLimit,
    });

    if (laudos.length === 0) {
      return {
        data: [],
        total,
        page: sanitizedPage,
        lastPage: 0,
      };
    }

    const statsMap = await this.getLaudoImageStatsMap(laudos.map((l) => l.id));

    return {
      data: laudos.map((l) => this.mapLaudoListItem(l, statsMap, true)),
      total,
      page: sanitizedPage,
      lastPage: Math.ceil(total / sanitizedLimit),
    };
  }

  async findByUsuario(
    usuarioId: string,
    page: number = 1,
    limit: number = 10,
    status?: string,
  ): Promise<PaginatedLaudosResult> {
    const sanitizedPage = Math.max(1, Number(page) || 1);
    const sanitizedLimit = Math.max(1, Math.min(100, Number(limit) || 10));
    const statusFilter = this.parseStatusFilter(status);
    const where = statusFilter ? { usuarioId, status: statusFilter } : { usuarioId };

    const [laudos, total] = await this.laudoRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (sanitizedPage - 1) * sanitizedLimit,
      take: sanitizedLimit,
    });

    if (laudos.length === 0) {
      return {
        data: [],
        total,
        page: sanitizedPage,
        lastPage: 0,
      };
    }

    const statsMap = await this.getLaudoImageStatsMap(laudos.map((l) => l.id));

    return {
      data: laudos.map((l) => this.mapLaudoListItem(l, statsMap)),
      total,
      page: sanitizedPage,
      lastPage: Math.ceil(total / sanitizedLimit),
    };
  }

  private parseStatusFilter(status?: string): StatusLaudo | undefined {
    if (!status) {
      return undefined;
    }

    const normalizedStatus = String(status).toLowerCase() as StatusLaudo;
    const validStatuses = Object.values(StatusLaudo);

    if (!validStatuses.includes(normalizedStatus)) {
      throw new BadRequestException('Status de laudo inválido');
    }

    return normalizedStatus;
  }

  private async getLaudoImageStatsMap(laudosIds: string[]) {
    const statsMap = new Map<string, { total: number; unanalyzed: number }>();

    if (laudosIds.length === 0) {
      return statsMap;
    }

    const chunkSize = 500;
    for (let i = 0; i < laudosIds.length; i += chunkSize) {
      const chunk = laudosIds.slice(i, i + chunkSize);

      const statsQuery = await this.imagemRepository
        .createQueryBuilder('img')
        .select('img.laudo_id', 'laudoId')
        .addSelect('COUNT(*)', 'total')
        .addSelect(
          "SUM(CASE WHEN img.imagem_ja_foi_analisada_pela_ia = 'nao' THEN 1 ELSE 0 END)",
          'unanalyzed',
        )
        .where('img.laudo_id IN (:...ids)', { ids: chunk })
        .groupBy('img.laudo_id')
        .getRawMany();

      statsQuery.forEach((s) => {
        statsMap.set(s.laudoId, {
          total: Number(s.total),
          unanalyzed: Number(s.unanalyzed),
        });
      });
    }

    return statsMap;
  }

  private mapLaudoListItem(
    laudo: Laudo,
    statsMap: Map<string, { total: number; unanalyzed: number }>,
    includeUsuarioData: boolean = false,
  ): LaudoListItem {
    let smartStatus = laudo.status;
    const stats = statsMap.get(laudo.id) || { total: 0, unanalyzed: 0 };

    if (laudo.pdfUrl) {
      smartStatus = StatusLaudo.CONCLUIDO;
    } else if (
      smartStatus === StatusLaudo.NAO_INICIADO &&
      stats.total > 0 &&
      stats.unanalyzed === 0
    ) {
      smartStatus = StatusLaudo.CONCLUIDO;
    }

    return {
      id: laudo.id,
      usuarioId: laudo.usuarioId,
      usuarioNome: includeUsuarioData ? laudo.usuario?.nome || 'Usuário desconhecido' : undefined,
      usuarioEmail: includeUsuarioData ? laudo.usuario?.email || '' : undefined,
      endereco: laudo.endereco,
      rua: laudo.rua,
      numero: laudo.numero,
      complemento: laudo.complemento,
      bairro: laudo.bairro,
      cidade: laudo.cidade,
      estado: laudo.estado,
      cep: laudo.cep,
      tipoVistoria: laudo.tipoVistoria,
      tipoUso: laudo.tipoUso,
      tipoImovel: laudo.tipoImovel,
      tipo: laudo.tipo,
      unidade: laudo.unidade,
      status: smartStatus,
      tamanho: laudo.tamanho,
      pdfUrl: laudo.pdfUrl,
      totalAmbientes: laudo.totalAmbientes,
      totalFotos: laudo.totalFotos,
      latitude: laudo.latitude,
      longitude: laudo.longitude,
      enderecoCompletoGps: laudo.enderecoCompletoGps,
      incluirAtestado: laudo.incluirAtestado,
      createdAt: laudo.createdAt,
      updatedAt: laudo.updatedAt,
    };
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
      throw new UnauthorizedException('Você não tem permissão para editar este laudo');
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
    if (updateDto.dadosExtra !== undefined) {
      laudo.dadosExtra = updateDto.dadosExtra;
    }

    return await this.laudoRepository.save(laudo);
  }

  async updateLaudoEndereco(
    id: string,
    updateDto: UpdateLaudoEnderecoDto,
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
      throw new UnauthorizedException('Você não tem permissão para editar este laudo');
    }

    // Atualizar apenas os campos de endereço fornecidos
    if (updateDto.cep !== undefined) {
      // Normalizar CEP removendo hífen se necessário
      laudo.cep = updateDto.cep.replace('-', '');
    }
    if (updateDto.rua !== undefined) {
      laudo.rua = updateDto.rua;
    }
    if (updateDto.numero !== undefined) {
      laudo.numero = updateDto.numero;
    }
    if (updateDto.complemento !== undefined) {
      laudo.complemento = updateDto.complemento;
    }
    if (updateDto.bairro !== undefined) {
      laudo.bairro = updateDto.bairro;
    }
    if (updateDto.cidade !== undefined) {
      laudo.cidade = updateDto.cidade;
    }
    if (updateDto.estado !== undefined) {
      laudo.estado = updateDto.estado;
    }

    // Atualizar campo endereco completo para compatibilidade
    const enderecoCompleto = [laudo.rua, laudo.numero, laudo.bairro, laudo.cidade, laudo.estado]
      .filter(Boolean)
      .join(', ');

    if (enderecoCompleto) {
      laudo.endereco = enderecoCompleto;
    }

    return await this.laudoRepository.save(laudo);
  }

  /**
   * Valida se todos os valores fornecidos existem como opções cadastradas
   */
  private async validateLaudoDetalhes(updateDto: UpdateLaudoDetalhesDto): Promise<void> {
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
    collectValues(updateDto.dadosExtra);

    if (valuesToValidate.length === 0) {
      return; // Nada para validar
    }

    // Buscar todas as opções válidas do banco
    const validOptions = await this.optionRepository.find({
      select: ['optionText'],
    });

    const validTexts = new Set(validOptions.map((opt) => opt.optionText));

    // Verificar se todos os valores fornecidos são válidos
    const invalidValues = valuesToValidate.filter((value) => !validTexts.has(value));

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

  async getDashboardStats(usuarioId: string): Promise<DashboardStatsDto> {
    const usuario = await this.usuarioRepository.findOne({
      where: { id: usuarioId },
    });

    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const isAdminOrDev = [UserRole.DEV, UserRole.ADMIN].includes(usuario.role);

    // Para DEV e ADMIN, mostrar quantidade ilimitada
    const imagensRestantes = isAdminOrDev ? 999999 : usuario.quantidadeImagens;

    const classificacoesWebRestantes = isAdminOrDev
      ? 999999
      : usuario.quantidadeClassificacoesWeb || 0;

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
      classificacoesWebRestantes,
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

  async getImagensPdfPaginadas(
    laudoId: string,
    usuarioId: string,
    userRole: UserRole,
    page: number = 1,
    limit: number = 12,
  ): Promise<ImagensPdfResponseDto> {
    // Verificar se o laudo existe e pertence ao usuário
    const laudo = await this.laudoRepository.findOne({
      where: { id: laudoId },
    });

    if (!laudo) {
      throw new NotFoundException('Laudo não encontrado');
    }

    // Verificar permissão
    const isOwner = laudo.usuarioId === usuarioId;
    const isAdminOrDev = [UserRole.DEV, UserRole.ADMIN].includes(userRole);

    if (!isOwner && !isAdminOrDev) {
      throw new ForbiddenException('Você não tem permissão para visualizar as imagens deste laudo');
    }

    const ambientesNomesValidos = (laudo.ambientesWeb || []).map((a) => a.nomeAmbiente);

    // Buscar TODAS as imagens ordenadas por ambiente e ordem
    // mas apenas anexar as que constam ativamente no JSON de ambientes
    let todasImagens = await this.imagemRepository.find({
      where: { laudoId },
      order: {
        ambiente: 'ASC',
        ordem: 'ASC',
      },
    });

    todasImagens = todasImagens.filter((img) => ambientesNomesValidos.includes(img.ambiente));

    if (todasImagens.length === 0) {
      return {
        data: [],
        meta: {
          currentPage: page,
          totalPages: 0,
          totalImages: 0,
          imagesPerPage: limit,
        },
      };
    }

    // Criar mapa de numeração de ambientes
    const ambientesMap = new Map<string, { numeroAmbiente: number; contador: number }>();
    let numeroAmbienteAtual = 0;
    let ambienteAnterior: string | null = null;

    todasImagens.forEach((img) => {
      if (img.ambiente !== ambienteAnterior) {
        numeroAmbienteAtual++;
        ambientesMap.set(img.ambiente, {
          numeroAmbiente: numeroAmbienteAtual,
          contador: 0,
        });
        ambienteAnterior = img.ambiente;
      }
    });

    // Aplicar paginação
    const inicio = (page - 1) * limit;
    const imagensPaginadas = todasImagens.slice(inicio, inicio + limit);

    // Resetar contadores para numeração correta
    const contadoresPorAmbiente = new Map<string, number>();
    ambientesMap.forEach((value, key) => {
      contadoresPorAmbiente.set(key, 0);
    });

    // Processar todas as imagens até a página atual para contagem correta
    for (let i = 0; i < inicio + imagensPaginadas.length && i < todasImagens.length; i++) {
      const img = todasImagens[i];
      const contadorAtual = contadoresPorAmbiente.get(img.ambiente) || 0;
      contadoresPorAmbiente.set(img.ambiente, contadorAtual + 1);

      // Só adicionar ao resultado se estiver na página atual
      if (i >= inicio && i < inicio + limit) {
        // Processado abaixo
      }
    }

    // Mapear imagens com numeração
    const imagensComNumeracao: ImagemPdfDto[] = imagensPaginadas.map((img, index) => {
      const infoAmbiente = ambientesMap.get(img.ambiente);

      // Recontar imagens deste ambiente até esta posição
      const posDaImagemNoArray = inicio + index;
      let contadorImagemNoAmbiente = 0;
      for (let i = 0; i <= posDaImagemNoArray; i++) {
        if (todasImagens[i].ambiente === img.ambiente) {
          contadorImagemNoAmbiente++;
        }
      }

      return {
        id: img.id,
        s3Key: img.s3Key,
        ambiente: img.ambiente,
        numeroAmbiente: infoAmbiente?.numeroAmbiente || 0,
        numeroImagemNoAmbiente: contadorImagemNoAmbiente,
        legenda: img.legenda || 'sem legenda',
        ordem: img.ordem,
        categoria: img.categoria,
        tipo: img.tipo,
      };
    });

    return {
      data: imagensComNumeracao,
      meta: {
        currentPage: page,
        totalPages: Math.ceil(todasImagens.length / limit),
        totalImages: todasImagens.length,
        imagesPerPage: limit,
      },
    };
  }
}
