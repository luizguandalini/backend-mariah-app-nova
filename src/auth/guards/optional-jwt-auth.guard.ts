import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Variante opcional do `JwtAuthGuard` para rotas que aceitam tanto
 * chamadores autenticados quanto anônimos (ex.: leituras abertas da
 * drive view — `GET /laudos/:id/ambientes-web` e
 * `GET /uploads/laudo/:laudoId/ambiente/:ambiente/imagens`).
 *
 * Reaproveita o `JwtStrategy` já registrado em `AuthModule`:
 * - Se houver `Authorization: Bearer <token>` válido, popula `req.user`.
 * - Se ausente, malformado, expirado ou inválido, **não** lança — apenas
 *   deixa `req.user` indefinido e segue adiante. O controller/service
 *   decide o que fazer com a ausência de usuário.
 *
 * Aplicar em rota específica (`@UseGuards(OptionalJwtAuthGuard)`),
 * nunca em nível de classe — justamente para deixar explícito quais
 * rotas aceitam anônimo.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(
    err: any,
    user: any,
    info: any,
    _context: ExecutionContext,
    _status?: any,
  ): TUser | undefined {
    // Caso normal: passport validou o token e devolveu o usuário.
    if (user) return user as TUser;

    // Sem token OU token inválido: passport injeta o erro ou um `info`
    // (e.g. TokenExpiredError, JsonWebTokenError). Em vez de propagar,
    // seguimos sem `user` para que a rota aplique seu modo visualização.
    return undefined;
  }

  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}
