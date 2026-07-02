import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

/**
 * Compõe o stack de autenticação estrita usado pela maioria das rotas
 * (`JwtAuthGuard` + `RolesGuard`) e o marcador Swagger de Bearer.
 *
 * Aplicado **por método**, após a remoção do guard de classe
 * (necessária para liberar rotas com guard opcional). Evitar divergência
 * futura: novas rotas em controllers que antes usavam class-level
 * `@UseGuards(JwtAuthGuard, RolesGuard)` devem usar `@StrictAuth()`
 * no método.
 */
export function StrictAuth(): MethodDecorator {
  return applyDecorators(UseGuards(JwtAuthGuard, RolesGuard), ApiBearerAuth());
}
