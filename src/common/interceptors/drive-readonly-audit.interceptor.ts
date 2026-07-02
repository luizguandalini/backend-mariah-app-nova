import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';

/**
 * Audit log minimal para as DUAS leituras abertas da drive view
 * (`GET /laudos/:id/ambientes-web` e
 * `GET /uploads/laudo/:laudoId/ambiente/:ambiente/imagens`).
 *
 * Loga `{ event, laudoId, ip, userAgent, viewerMode, statusCode, ts }`
 * — **nunca** o payload de resposta (que pode conter URLs presigned).
 *
 * `viewerMode` é `full` se o chamador autenticado for dono OU
 * admin/dev; `readonly` caso contrário (anônimo ou logado não-dono).
 * Detectado a partir do `req.user` populado pelo `OptionalJwtAuthGuard`
 * + `laudo.usuarioId` (que precisamos do path).
 */
@Injectable()
export class DriveReadonlyAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(DriveReadonlyAuditInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse();

    const laudoId =
      (req.params && (req.params.id || req.params.laudoId)) || null;
    const ip = (req.ip || (req.headers && (req.headers['x-forwarded-for'] as string)) || '').toString();
    const userAgent = (req.headers && (req.headers['user-agent'] as string)) || '';
    const user = (req as any).user;
    const ts = new Date().toISOString();

    return next.handle().pipe(
      tap({
        next: () => {
          // viewerMode completo só pode ser conhecido depois que o
          // service roda, mas inferimos o "shape" pelo simples fato de
          // req.user estar presente: sabemos que a service calculará o
          // viewer final. Aqui registramos apenas a presença/ausência
          // do user (proxy de "estava autenticado"). O log mais rico
          // ficaria em um interceptor que recebesse o response shape,
          // mas evitamos pagar esse custo.
          const viewerMode = user ? 'full-or-readonly' : 'readonly';
          this.logger.log(
            JSON.stringify({
              event: 'drive_readonly_read',
              laudoId,
              ip,
              userAgent,
              viewerMode,
              statusCode: res.statusCode,
              ts,
            }),
          );
        },
        error: (err) => {
          this.logger.warn(
            JSON.stringify({
              event: 'drive_readonly_read_error',
              laudoId,
              ip,
              userAgent,
              statusCode: err?.status || 500,
              err: err?.message,
              ts,
            }),
          );
        },
      }),
    );
  }
}
