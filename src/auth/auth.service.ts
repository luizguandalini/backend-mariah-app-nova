import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Usuario } from '../users/entities/usuario.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { WebLoginTicket } from './entities/web-login-ticket.entity';
import { LoginDto } from './dto/login.dto';
import { CreateUsuarioDto } from '../users/dto/create-usuario.dto';
import { UserRole } from '../users/enums/user-role.enum';
import { Laudo } from '../laudos/entities/laudo.entity';

@Injectable()
export class AuthService {
  private readonly REFRESH_TOKEN_EXPIRY_DAYS = 30;
  private readonly WEB_LOGIN_TICKET_EXPIRY_MINUTES = 5;

  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(WebLoginTicket)
    private readonly webLoginTicketRepository: Repository<WebLoginTicket>,
    @InjectRepository(Laudo)
    private readonly laudoRepository: Repository<Laudo>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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

    return this.generateTokens(usuario);
  }

  async register(createUsuarioDto: CreateUsuarioDto) {
    // Bloqueia criação de usuário DEV via API
    if (createUsuarioDto.role === UserRole.DEV) {
      throw new UnauthorizedException('Não é permitido criar usuário DEV. O usuário DEV é criado automaticamente.');
    }

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

    return this.generateTokens(usuarioSalvo);
  }

  /**
   * Renova os tokens usando um refresh token válido
   */
  async refreshTokens(refreshTokenString: string) {
    // Busca o refresh token no banco
    const refreshToken = await this.refreshTokenRepository.findOne({
      where: { token: refreshTokenString },
      relations: ['usuario'],
    });

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    // Verifica se foi revogado
    if (refreshToken.revoked) {
      throw new UnauthorizedException('Refresh token foi revogado');
    }

    // Verifica se expirou
    if (new Date() > refreshToken.expiresAt) {
      // Remove tokens expirados
      await this.refreshTokenRepository.delete({ id: refreshToken.id });
      throw new UnauthorizedException('Refresh token expirado');
    }

    // Verifica se o usuário ainda está ativo
    const usuario = await this.usuarioRepository.findOne({
      where: { id: refreshToken.usuarioId },
      select: ['id', 'email', 'nome', 'role', 'quantidadeImagens', 'ativo'],
    });

    if (!usuario || !usuario.ativo) {
      throw new UnauthorizedException('Usuário inativo ou não encontrado');
    }

    // Revoga o refresh token antigo (rotação de tokens)
    await this.refreshTokenRepository.update(
      { id: refreshToken.id },
      { revoked: true },
    );

    // Gera novos tokens
    return this.generateTokens(usuario);
  }

  async createWebLoginTicket(usuario: Usuario, laudoId: string) {
    const laudo = await this.laudoRepository.findOne({
      where: { id: laudoId },
      relations: ['usuario'],
    });

    if (!laudo) {
      throw new NotFoundException('Laudo não encontrado');
    }

    const isOwner = laudo.usuario?.id === usuario.id;
    const isAdminOrDev =
      usuario.role === UserRole.ADMIN || usuario.role === UserRole.DEV;

    if (!isOwner && !isAdminOrDev) {
      throw new UnauthorizedException('Você não tem permissão para este laudo');
    }

    const token = this.generateSecureToken();
    const expiresAt = new Date();
    expiresAt.setMinutes(
      expiresAt.getMinutes() + this.WEB_LOGIN_TICKET_EXPIRY_MINUTES,
    );

    const ticket = this.webLoginTicketRepository.create({
      token,
      usuarioId: usuario.id,
      laudoId: laudo.id,
      expiresAt,
    });

    await this.webLoginTicketRepository.save(ticket);

    return {
      ticket: token,
      expiresAt,
    };
  }

  async exchangeWebLoginTicket(ticketToken: string) {
    const ticket = await this.webLoginTicketRepository.findOne({
      where: { token: ticketToken },
    });

    if (!ticket || ticket.usedAt) {
      throw new UnauthorizedException('Ticket inválido');
    }

    if (ticket.expiresAt < new Date()) {
      throw new UnauthorizedException('Ticket expirado');
    }

    const usuario = await this.usuarioRepository.findOne({
      where: { id: ticket.usuarioId },
      select: ['id', 'email', 'nome', 'role', 'quantidadeImagens', 'ativo'],
    });

    if (!usuario || !usuario.ativo) {
      throw new UnauthorizedException('Usuário inativo ou não encontrado');
    }

    const laudo = await this.laudoRepository.findOne({
      where: { id: ticket.laudoId },
    });

    if (!laudo) {
      throw new NotFoundException('Laudo não encontrado');
    }

    ticket.usedAt = new Date();
    await this.webLoginTicketRepository.save(ticket);

    const tokens = await this.generateTokens(usuario);

    return {
      ...tokens,
      laudoId: laudo.id,
    };
  }

  /**
   * Revoga um refresh token (logout)
   */
  async revokeRefreshToken(refreshTokenString: string): Promise<void> {
    const result = await this.refreshTokenRepository.update(
      { token: refreshTokenString, revoked: false },
      { revoked: true },
    );

    if (result.affected === 0) {
      // Token não encontrado ou já revogado, mas não é um erro crítico
      console.log('Refresh token não encontrado ou já revogado');
    }
  }

  /**
   * Revoga todos os refresh tokens de um usuário (logout de todos os dispositivos)
   */
  async revokeAllUserRefreshTokens(usuarioId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { usuarioId, revoked: false },
      { revoked: true },
    );
  }

  /**
   * Limpa tokens expirados do banco (pode ser chamado via cron job)
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.refreshTokenRepository.delete({
      expiresAt: LessThan(new Date()),
    });
    return result.affected || 0;
  }

  /**
   * Gera par de tokens (access + refresh) para um usuário
   */
  private async generateTokens(usuario: Usuario) {
    const payload = {
      sub: usuario.id,
      email: usuario.email,
      nome: usuario.nome,
      role: usuario.role,
      quantidadeImagens: usuario.quantidadeImagens,
    };

    // Gera access token (curta duração - configurado no módulo)
    const accessToken = this.jwtService.sign(payload);

    // Gera refresh token (longa duração)
    const refreshTokenString = this.generateSecureToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.REFRESH_TOKEN_EXPIRY_DAYS);

    // Salva refresh token no banco
    const refreshToken = this.refreshTokenRepository.create({
      token: refreshTokenString,
      usuarioId: usuario.id,
      expiresAt,
    });
    await this.refreshTokenRepository.save(refreshToken);

    return {
      access_token: accessToken,
      refresh_token: refreshTokenString,
      user: {
        id: usuario.id,
        email: usuario.email,
        nome: usuario.nome,
        role: usuario.role,
        quantidadeImagens: usuario.quantidadeImagens,
      },
    };
  }

  /**
   * Gera um token seguro aleatório
   */
  private generateSecureToken(): string {
    return crypto.randomBytes(64).toString('hex');
  }
}
