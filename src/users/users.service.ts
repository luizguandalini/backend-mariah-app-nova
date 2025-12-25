import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Usuario } from './entities/usuario.entity';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { UserRole } from './enums/user-role.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
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

    // Bloqueia edição de role para DEV
    if (updateUsuarioDto.role === UserRole.DEV) {
      throw new ForbiddenException('Não é permitido criar ou alterar para role DEV');
    }

    // Não permite alterar role de um DEV existente
    if (usuario.role === UserRole.DEV) {
      throw new ForbiddenException('Não é permitido alterar dados de usuário DEV');
    }

    // Só DEV e ADMIN podem alterar quantidadeImagens
    if (updateUsuarioDto.quantidadeImagens !== undefined) {
      if (![UserRole.DEV, UserRole.ADMIN].includes(currentUser.role)) {
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
}
