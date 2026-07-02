import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Usuario } from '../../users/entities/usuario.entity';

/**
 * Estratégia JWT.
 *
 * O token em si é stateless e confiável até `JWT_EXPIRES_IN` (15m por
 * padrão), então para revogar o acesso de um usuário soft-deletado no
 * momento da deleção — em vez de esperar a expiração do token — o
 * `validate` faz uma checagem no banco: se a linha do usuário sumiu
 * (id não existe) ou tem `deletedAt` populado, o token é rejeitado com
 * 401 antes de chegar no controller. O mesmo vale para `ativo = false`.
 *
 * Custo: 1 query por request autenticado (PK lookup em `usuarios`).
 * É o preço por ter revogação imediata; alternativas com `tokenVersion`
 * também exigem 1 query, então optamos pela versão mais simples.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET') || 'secret-key-change-this',
    });
  }

  async validate(payload: any) {
    const usuario = await this.usuarioRepository.findOne({
      where: { id: payload.sub, deletedAt: IsNull() },
      select: ['id', 'email', 'nome', 'role', 'quantidadeImagens', 'ativo'],
    });

    if (!usuario || !usuario.ativo) {
      throw new UnauthorizedException('Usuário inativo ou não encontrado');
    }

    return {
      id: usuario.id,
      email: usuario.email,
      nome: usuario.nome,
      role: usuario.role,
      quantidadeImagens: usuario.quantidadeImagens,
    };
  }
}
