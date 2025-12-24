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

  async findAll(): Promise<Usuario[]> {
    return await this.usuarioRepository.find({
      order: { nome: 'ASC' },
    });
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

  async updateQuantidadeImagens(id: string, quantidade: number, currentUser: any): Promise<Usuario> {
    if (![UserRole.DEV, UserRole.ADMIN].includes(currentUser.role)) {
      throw new ForbiddenException('Apenas DEV e ADMIN podem alterar créditos de imagens');
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
      throw new ForbiddenException('Apenas DEV e ADMIN podem adicionar créditos de imagens');
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
    await this.usuarioRepository.remove(usuario);
  }

  async getMe(userId: string): Promise<Usuario> {
    return await this.findOne(userId);
  }
}
