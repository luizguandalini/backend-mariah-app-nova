import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Usuario } from './entities/usuario.entity';
import { ConfiguracaoPdfUsuario } from './entities/configuracao-pdf-usuario.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { UpdateConfiguracoesPdfDto } from './dto/update-configuracoes-pdf.dto';
import { UserRole } from './enums/user-role.enum';
import { UploadsService } from '../uploads/uploads.service';
import { canChangeRole } from './role-policy';
import { AccessFlags, DeleteActorShape, canDeleteUser, computeAccessFlags } from './user-access-policy';

/** User row augmented with the per-row flags exposed to the admin view. */
export type UsuarioComFlags = Usuario & AccessFlags;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    @InjectRepository(ConfiguracaoPdfUsuario)
    private readonly configuracaoPdfRepository: Repository<ConfiguracaoPdfUsuario>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly uploadsService: UploadsService,
  ) {}

  async findAll(
    actor: DeleteActorShape,
    page: number = 1,
    limit: number = 10,
    search?: string,
    role?: UserRole,
    ativo?: boolean,
  ): Promise<{ data: UsuarioComFlags[]; total: number; page: number; totalPages: number }> {
    const queryBuilder = this.usuarioRepository.createQueryBuilder('usuario');

    // Soft-deleted users are hidden from the admin view by spec. The
    // partial unique email index already lets a deleted user's email be
    // re-used, but the deleted row itself is no longer queryable here.
    queryBuilder.andWhere('usuario.deletedAt IS NULL');

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
    const [rows, total] = await queryBuilder.getManyAndCount();

    // Decora cada linha com isSelf / canDelete, computados pelo helper
    // puro. Mantém a regra no servidor e dá ao frontend um sinal
    // determinístico para esconder o toggle de role e o botão de deletar.
    const data: UsuarioComFlags[] = rows.map((row) => ({
      ...row,
      ...computeAccessFlags(row, actor),
    }));

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, actor: DeleteActorShape): Promise<UsuarioComFlags> {
    const usuario = await this.usuarioRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return { ...usuario, ...computeAccessFlags(usuario, actor) };
  }

  async update(id: string, updateUsuarioDto: UpdateUsuarioDto, currentUser: any): Promise<Usuario> {
    const usuario = await this.findOne(id, currentUser);

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

    // Toda alteração de role deve passar pelo endpoint dedicado PATCH /users/:id/role.
    // Direciona erros de auditoria e validação para um único caminho.
    if (updateUsuarioDto.role !== undefined) {
      throw new ForbiddenException(
        'Alteração de role deve ser feita via PATCH /users/:id/role',
      );
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

    const usuario = await this.findOne(id, currentUser);

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

    const usuario = await this.findOne(id, currentUser);

    if ([UserRole.DEV, UserRole.ADMIN].includes(usuario.role)) {
      throw new ForbiddenException('DEV e ADMIN têm acesso ilimitado');
    }

    usuario.quantidadeImagens += quantidade;
    return await this.usuarioRepository.save(usuario);
  }

  /**
   * Change the role of a target user.
   *
   * Authorization is delegated to `canChangeRole`. Self-edit, same-role
   * no-ops, and DEV-target/DEDESTINATION attempts are rejected here. The
   * `quantidadeImagens` (image-credit) counter is intentionally NOT touched
   * by this method — the field is preserved bit-for-bit across role
   * transitions per the OpenSpec change.
   */
  async changeRole(
    id: string,
    dto: ChangeRoleDto,
    currentUser: any,
  ): Promise<Usuario> {
    if (currentUser.id === id) {
      throw new BadRequestException('Não é permitido alterar o próprio role');
    }

    const target = await this.findOne(id, currentUser);

    if (target.role === dto.role) {
      throw new BadRequestException(
        `Usuário já possui o role ${dto.role}; transição sem efeito`,
      );
    }

    if (!canChangeRole(currentUser.role, target.role, dto.role)) {
      throw new ForbiddenException(
        `Você não tem permissão para alterar o role deste usuário para ${dto.role}`,
      );
    }

    const oldRole = target.role;
    target.role = dto.role;
    // Partial save: only the role field. quantidadeImagens is preserved.
    await this.usuarioRepository.save(target);

    this.logger.log(
      JSON.stringify({
        event: 'roleChange',
        actorId: currentUser.id,
        actorEmail: currentUser.email,
        targetId: target.id,
        targetEmail: target.email,
        from: oldRole,
        to: target.role,
        timestamp: new Date().toISOString(),
      }),
    );

    return target;
  }

  /**
   * Soft-delete a target user. The user row is kept (with `deletedAt`
   * set); all related domain records (laudos, images, configuracao_pdf,
   * etc.) are intentionally NOT touched and remain FK'd to this row.
   * The same identity can later be re-created as a brand-new user with
   * a new id; old records will not be re-attached to the new user.
   *
   * Side-effects (session state only, NOT domain data):
   *   - sets `ativo = false` so the existing login guard kicks in
   *     everywhere
   *   - revokes all non-revoked refresh tokens so the deleted user
   *     cannot continue to authenticate
   *   - writes an audit line with actor/target/role/timestamp
   *
   * Authorization (encoded in `canDeleteUser` + checked here too):
   *   - 400 if the target is the actor (self-delete forbidden)
   *   - 403 if the target has role DEV (DEV users are protected)
   *   - 403 if the actor is not ADMIN or DEV
   *   - 404 if the target does not exist OR is already soft-deleted
   *     (a re-created user is a brand-new id, not a resurrection)
   */
  async softDelete(id: string, currentUser: any): Promise<void> {
    if (currentUser.id === id) {
      throw new BadRequestException('Não é permitido deletar o próprio usuário');
    }

    const target = await this.usuarioRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!target) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (!canDeleteUser(currentUser, target)) {
      // canDeleteUser é false em dois casos: target é DEV, ou actor é
      // comum. A mensagem de erro escolhe o motivo mais provável.
      if (target.role === UserRole.DEV) {
        throw new ForbiddenException('Não é permitido deletar usuário DEV');
      }
      throw new ForbiddenException(
        'Você não tem permissão para deletar usuários',
      );
    }

    const now = new Date();
    target.deletedAt = now;
    target.ativo = false;
    await this.usuarioRepository.save(target);

    // Estado de sessão: revoga refresh tokens para que o usuário
    // deletado não consiga trocar um refresh válido por um novo access
    // token. Web login tickets não precisam ser tocados: o exchange já
    // verifica `!usuario.ativo` (que acabamos de setar como false) e
    // marca o ticket como usado.
    await this.refreshTokenRepository.update(
      { usuarioId: id, revoked: false },
      { revoked: true },
    );

    this.logger.warn(
      JSON.stringify({
        event: 'userSoftDelete',
        actorId: currentUser.id,
        actorEmail: currentUser.email,
        targetId: target.id,
        targetEmail: target.email,
        targetRole: target.role,
        timestamp: now.toISOString(),
      }),
    );
  }

  async getMe(userId: string, currentUser: any): Promise<Usuario & { fotoPerfilUrl: string | null }> {
    const usuario = await this.findOne(userId, currentUser);
    const fotoPerfilUrl = await this.uploadsService.getProfilePhotoUrl(usuario.fotoPerfilS3Key);
    return Object.assign(usuario, { fotoPerfilUrl });
  }

  /**
   * Gera URL pré-assinada para o usuário enviar sua foto de perfil ao S3.
   */
  async getFotoPerfilUploadUrl(
    userId: string,
    filename: string,
    contentType: string,
    fileSize?: number,
  ): Promise<{ uploadUrl: string; s3Key: string }> {
    return this.uploadsService.generateProfilePhotoUploadUrl(
      userId,
      filename,
      contentType,
      fileSize,
    );
  }

  /**
   * Confirma o upload da foto de perfil e persiste a chave no usuário.
   */
  async confirmFotoPerfil(userId: string, s3Key: string): Promise<{ fotoPerfilUrl: string }> {
    return this.uploadsService.confirmProfilePhoto(userId, s3Key);
  }

  /**
   * Remove a foto de perfil do usuário.
   */
  async removeFotoPerfil(userId: string): Promise<void> {
    return this.uploadsService.removeProfilePhoto(userId);
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
        modoPreviewPdf: 'detalhado',
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
    const usuario = await this.usuarioRepository.findOne({
      where: { id: usuarioId, deletedAt: IsNull() },
    });
    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado');
    }
    usuario.expoPushToken = expoPushToken || null;
    return await this.usuarioRepository.save(usuario);
  }
}
