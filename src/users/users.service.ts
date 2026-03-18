import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Usuario } from './entities/usuario.entity';
import { ConfiguracaoPdfUsuario } from './entities/configuracao-pdf-usuario.entity';
import { Laudo } from '../laudos/entities/laudo.entity';
import { ImagemLaudo } from '../uploads/entities/imagem-laudo.entity';
import { AnalysisQueue } from '../queue/entities/analysis-queue.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { WebLoginTicket } from '../auth/entities/web-login-ticket.entity';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { UpdateConfiguracoesPdfDto } from './dto/update-configuracoes-pdf.dto';
import { UserRole } from './enums/user-role.enum';
import { UploadsService } from '../uploads/uploads.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    @InjectRepository(ConfiguracaoPdfUsuario)
    private readonly configuracaoPdfRepository: Repository<ConfiguracaoPdfUsuario>,
    @InjectRepository(Laudo)
    private readonly laudoRepository: Repository<Laudo>,
    @InjectRepository(ImagemLaudo)
    private readonly imagemLaudoRepository: Repository<ImagemLaudo>,
    @InjectRepository(AnalysisQueue)
    private readonly analysisQueueRepository: Repository<AnalysisQueue>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(WebLoginTicket)
    private readonly webLoginTicketRepository: Repository<WebLoginTicket>,
    private readonly uploadsService: UploadsService,
  ) {}

  async findAll(
    page: number = 1,
    limit: number = 10,
    search?: string,
    role?: UserRole,
    ativo?: boolean,
  ): Promise<{ data: Usuario[]; total: number; page: number; totalPages: number }> {
    const queryBuilder = this.usuarioRepository.createQueryBuilder('usuario');

    // Filtro de busca por nome ou email
    if (search) {
      queryBuilder.andWhere(
        '(LOWER(usuario.nome) LIKE LOWER(:search) OR LOWER(usuario.email) LIKE LOWER(:search))',
        { search: `%${search}%` },
      );
    }

    // Filtro por role
    if (role) {
      queryBuilder.andWhere('usuario.role = :role', { role });
    }

    // Filtro por status ativo
    if (ativo !== undefined) {
      queryBuilder.andWhere('usuario.ativo = :ativo', { ativo });
    }

    // Paginação
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    // Ordenação
    queryBuilder.orderBy('usuario.nome', 'ASC');

    // Executar query
    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<Usuario> {
    const usuario = await this.usuarioRepository.findOne({ where: { id } });

    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return usuario;
  }

  async update(id: string, updateUsuarioDto: UpdateUsuarioDto, currentUser: any): Promise<Usuario> {
    const usuario = await this.findOne(id);

    // Permissões:
    // 1. Usuário pode editar a si mesmo (mas com restrições de campos)
    // 2. ADMIN/DEV podem editar qualquer um (com restrições para o role DEV)
    
    const isEditingSelf = currentUser.id === id;
    const isAdminOrDev = [UserRole.DEV, UserRole.ADMIN].includes(currentUser.role);

    if (!isEditingSelf && !isAdminOrDev) {
      throw new ForbiddenException('Você não tem permissão para atualizar este usuário');
    }

    // Se não for admin/dev, só pode editar o próprio NOME
    if (isEditingSelf && !isAdminOrDev) {
      // Remove campos sensíveis se o usuário comum tentar enviar
      const { nome } = updateUsuarioDto;
      updateUsuarioDto = { nome } as UpdateUsuarioDto;
      
      if (!nome) {
        throw new ForbiddenException('Apenas o nome pode ser editado pelo próprio usuário');
      }
    }

    // Bloqueia edição de role para DEV (mesmo para ADMIN)
    if (updateUsuarioDto.role === UserRole.DEV) {
      throw new ForbiddenException('Não é permitido criar ou alterar para role DEV');
    }

    // Não permite alterar role de um DEV existente
    if (usuario.role === UserRole.DEV && !isEditingSelf) {
      throw new ForbiddenException('Não é permitido alterar dados de usuário DEV');
    }

    // Só DEV e ADMIN podem alterar quantidadeImagens
    if (updateUsuarioDto.quantidadeImagens !== undefined) {
      if (!isAdminOrDev) {
        throw new ForbiddenException('Você não tem permissão para alterar quantidade de imagens');
      }
    }

    // Se está atualizando senha, fazer hash
    if (updateUsuarioDto.senha) {
      updateUsuarioDto.senha = await bcrypt.hash(updateUsuarioDto.senha, 10);
    }

    Object.assign(usuario, updateUsuarioDto);
    return await this.usuarioRepository.save(usuario);
  }

  async updateQuantidadeImagens(
    id: string,
    quantidade: number,
    currentUser: any,
  ): Promise<Usuario> {
    if (![UserRole.DEV, UserRole.ADMIN].includes(currentUser.role)) {
      throw new ForbiddenException(
        'Apenas DEV e ADMIN podem alterar quantidade de imagens disponíveis',
      );
    }

    const usuario = await this.findOne(id);

    // DEV e ADMIN não podem ter seus créditos alterados (acesso ilimitado)
    if ([UserRole.DEV, UserRole.ADMIN].includes(usuario.role)) {
      throw new ForbiddenException('DEV e ADMIN têm acesso ilimitado, não é possível alterar');
    }

    usuario.quantidadeImagens = quantidade;
    return await this.usuarioRepository.save(usuario);
  }

  async addQuantidadeImagens(id: string, quantidade: number, currentUser: any): Promise<Usuario> {
    if (![UserRole.DEV, UserRole.ADMIN].includes(currentUser.role)) {
      throw new ForbiddenException('Apenas DEV e ADMIN podem adicionar imagens disponíveis');
    }

    const usuario = await this.findOne(id);

    if ([UserRole.DEV, UserRole.ADMIN].includes(usuario.role)) {
      throw new ForbiddenException('DEV e ADMIN têm acesso ilimitado');
    }

    usuario.quantidadeImagens += quantidade;
    return await this.usuarioRepository.save(usuario);
  }

  async remove(id: string): Promise<void> {
    const usuario = await this.findOne(id);

    // Não permite deletar usuário DEV
    if (usuario.role === UserRole.DEV) {
      throw new ForbiddenException('Não é permitido deletar usuário DEV');
    }

    this.logger.warn(`🗑️ Iniciando deleção completa do usuário: ${usuario.nome} (${usuario.email}) - ID: ${id}`);

    // 1. Buscar todos os laudos do usuário para deletar imagens do S3
    const laudos = await this.laudoRepository.find({ where: { usuarioId: id } });
    const laudoIds = laudos.map(l => l.id);

    // 2. Deletar imagens do S3 (fora da transação do banco)
    for (const laudoId of laudoIds) {
      try {
        await this.uploadsService.deleteImagensByLaudo(laudoId);
        this.logger.log(`  ✅ Imagens S3 do laudo ${laudoId} deletadas`);
      } catch (error) {
        this.logger.error(`  ⚠️ Erro ao deletar imagens S3 do laudo ${laudoId}:`, error);
        // Continua mesmo com erro no S3
      }
    }

    // 3. Deletar PDFs do S3 (se existirem)
    for (const laudo of laudos) {
      if (laudo.pdfUrl) {
        try {
          const s3Key = `users/${id}/laudos/${laudo.id}/relatorio.pdf`;
          await this.uploadsService.deleteFile(s3Key);
        } catch (error) {
          this.logger.error(`  ⚠️ Erro ao deletar PDF do laudo ${laudo.id}:`, error);
        }
      }
    }

    // 4. Deletar registros do banco em transação
    await this.usuarioRepository.manager.transaction(async (manager) => {
      // 4a. Deletar registros da fila de análise
      await manager.delete(AnalysisQueue, { usuarioId: id });
      this.logger.log(`  ✅ Registros da fila de análise deletados`);

      // 4b. Deletar imagens do banco (vinculadas ao usuário)
      await manager.delete(ImagemLaudo, { usuarioId: id });
      this.logger.log(`  ✅ Registros de imagens deletados do banco`);

      // 4c. Deletar web login tickets
      await manager.delete(WebLoginTicket, { usuarioId: id });
      this.logger.log(`  ✅ Web login tickets deletados`);

      // 4d. Deletar refresh tokens
      await manager.delete(RefreshToken, { usuarioId: id });
      this.logger.log(`  ✅ Refresh tokens deletados`);

      // 4e. Deletar laudos
      if (laudoIds.length > 0) {
        await manager.delete(Laudo, { usuarioId: id });
        this.logger.log(`  ✅ ${laudoIds.length} laudos deletados`);
      }

      // 4f. Deletar configurações de PDF
      await manager.delete(ConfiguracaoPdfUsuario, { usuarioId: id });
      this.logger.log(`  ✅ Configurações de PDF deletadas`);

      // 4g. Deletar o próprio usuário
      await manager.remove(usuario);
      this.logger.log(`  ✅ Usuário removido do banco`);
    });

    this.logger.warn(`🗑️ Deleção completa do usuário ${usuario.nome} (${usuario.email}) finalizada com sucesso`);
  }

  async getMe(userId: string): Promise<Usuario> {
    return await this.findOne(userId);
  }

  async getConfiguracoesPdf(usuarioId: string): Promise<ConfiguracaoPdfUsuario> {
    let config = await this.configuracaoPdfRepository.findOne({
      where: { usuarioId },
    });

    // Se não existir, criar com valores padrão
    if (!config) {
      config = this.configuracaoPdfRepository.create({
        usuarioId,
        espacamentoHorizontal: 10,
        espacamentoVertical: 15,
        margemPagina: 20,
      });
      await this.configuracaoPdfRepository.save(config);
    }

    return config;
  }

  async updateConfiguracoesPdf(
    usuarioId: string,
    updateDto: UpdateConfiguracoesPdfDto,
  ): Promise<ConfiguracaoPdfUsuario> {
    let config = await this.configuracaoPdfRepository.findOne({
      where: { usuarioId },
    });

    if (!config) {
      config = this.configuracaoPdfRepository.create({
        usuarioId,
        ...updateDto,
      });
    } else {
      Object.assign(config, updateDto);
    }

    return await this.configuracaoPdfRepository.save(config);
  }

  async updatePushToken(usuarioId: string, expoPushToken?: string): Promise<Usuario> {
    const usuario = await this.findOne(usuarioId);
    usuario.expoPushToken = expoPushToken || null;
    return await this.usuarioRepository.save(usuario);
  }
}
