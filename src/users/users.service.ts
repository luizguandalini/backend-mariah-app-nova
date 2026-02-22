import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Usuario } from './entities/usuario.entity';
import { ConfiguracaoPdfUsuario } from './entities/configuracao-pdf-usuario.entity';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { UpdateConfiguracoesPdfDto } from './dto/update-configuracoes-pdf.dto';
import { UserRole } from './enums/user-role.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    @InjectRepository(ConfiguracaoPdfUsuario)
    private readonly configuracaoPdfRepository: Repository<ConfiguracaoPdfUsuario>,
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

    await this.usuarioRepository.remove(usuario);
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
