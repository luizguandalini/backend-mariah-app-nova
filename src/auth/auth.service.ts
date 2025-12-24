import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Usuario } from '../users/entities/usuario.entity';
import { LoginDto } from './dto/login.dto';
import { CreateUsuarioDto } from '../users/dto/create-usuario.dto';
import { UserRole } from '../users/enums/user-role.enum';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const usuario = await this.usuarioRepository.findOne({
      where: { email: loginDto.email },
      select: ['id', 'email', 'nome', 'senha', 'role', 'quantidadeImagens', 'ativo'],
    });

    if (!usuario) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (!usuario.ativo) {
      throw new UnauthorizedException('Usuário inativo');
    }

    const senhaValida = await bcrypt.compare(loginDto.senha, usuario.senha);

    if (!senhaValida) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const payload = {
      sub: usuario.id,
      email: usuario.email,
      nome: usuario.nome,
      role: usuario.role,
      quantidadeImagens: usuario.quantidadeImagens,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: usuario.id,
        email: usuario.email,
        nome: usuario.nome,
        role: usuario.role,
        quantidadeImagens: usuario.quantidadeImagens,
      },
    };
  }

  async register(createUsuarioDto: CreateUsuarioDto) {
    const usuarioExistente = await this.usuarioRepository.findOne({
      where: { email: createUsuarioDto.email },
    });

    if (usuarioExistente) {
      throw new UnauthorizedException('Email já cadastrado');
    }

    const senhaHash = await bcrypt.hash(createUsuarioDto.senha, 10);

    const usuario = this.usuarioRepository.create({
      ...createUsuarioDto,
      senha: senhaHash,
      role: createUsuarioDto.role || UserRole.USUARIO,
      quantidadeImagens: [UserRole.DEV, UserRole.ADMIN].includes(createUsuarioDto.role)
        ? 999999
        : 0,
    });

    const usuarioSalvo = await this.usuarioRepository.save(usuario);

    const payload = {
      sub: usuarioSalvo.id,
      email: usuarioSalvo.email,
      nome: usuarioSalvo.nome,
      role: usuarioSalvo.role,
      quantidadeImagens: usuarioSalvo.quantidadeImagens,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: usuarioSalvo.id,
        email: usuarioSalvo.email,
        nome: usuarioSalvo.nome,
        role: usuarioSalvo.role,
        quantidadeImagens: usuarioSalvo.quantidadeImagens,
      },
    };
  }
}
