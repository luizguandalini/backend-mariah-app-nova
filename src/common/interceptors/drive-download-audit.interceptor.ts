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
 * Audit log mínimo para os QUATRO endpoints liberalizados de download
 * da drive view (change `enable-download-in-visualization`):
 *
 * - `GET /uploads/image/:id/download`         → `event: 'download_image'`
 * - `POST /download/laudo/:laudoId/ambiente/:amb` → `event: 'download_enqueue'`
 * - `POST /download/laudo/:laudoId`           → `event: 'download_enqueue'`
 * - `GET /download/job/:jobId`                → `event: 'download_status'`
 *
 * Logs são emitidos **apenas após** a resposta (sucesso ou erro) e
 * **nunca** contêm payload, presigned URL, conteúdo do buffer, ou
 * stack trace.
 *
 * Detecção do tipo de evento é feita por pattern-matching no path da
 * requisição. Metadados extras (`laudoId`, `imagemId`, `size`, `jobId`,
 * `jobStatus`, `reused`, `tipo`, `ambiente`) são extraídos de `req.*`
 * (populados pelo controller antes de `reply.send()`) ou da resposta
 * via `tap.next`.
 */
@Injectable()
export class DriveDownloadAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(DriveDownloadAuditInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse();
    const path = req.path || req.url || '';

    const ip = (
      req.ip ||
      (req.headers && (req.headers['x-forwarded-for'] as string)) ||
      ''
    )
      .toString();
    const userAgent = (req.headers && (req.headers['user-agent'] as string)) || '';
    const ts = new Date().toISOString();

    // Determina o tipo de evento pelo path. Mantém o switch simples —
    // se um novo path liberalizado for adicionado, basta uma nova
    // branch + o handler do controller setar os campos esperados em req.
    const kind = this.detectKind(path);

    return next.handle().pipe(
      tap({
        next: (responseBody) => {
          const baseFields = {
            ip,
            userAgent,
            statusCode: res.statusCode,
            ts,
          };

          if (kind === 'image') {
            const reqAny = req as any;
            this.logger.log(
              JSON.stringify({
                event: 'download_image',
                imagemId: reqAny.imagemIdFromHandler ?? req.params?.id ?? null,
                laudoId: reqAny.laudoIdFromHandler ?? null,
                size: reqAny.sizeFromHandler ?? null,
                ...baseFields,
              }),
            );
            return;
          }

          if (kind === 'enqueue') {
            const laudoId = req.params?.laudoId ?? null;
            const ambiente = req.params?.ambiente
              ? decodeURIComponent(String(req.params.ambiente))
              : null;
            const isAmbiente = !!ambiente;
            this.logger.log(
              JSON.stringify({
                event: 'download_enqueue',
                laudoId,
                tipo: isAmbiente ? 'ambiente' : 'laudo',
                ambiente,
                jobId: responseBody?.jobId ?? null,
                reused: responseBody?.reused ?? false,
                ...baseFields,
              }),
            );
            return;
          }

          if (kind === 'status') {
            this.logger.log(
              JSON.stringify({
                event: 'download_status',
                jobId: req.params?.jobId ?? null,
                jobStatus: responseBody?.status ?? null,
                ...baseFields,
              }),
            );
            return;
          }

          // Fallback — não deveria acontecer se kind foi detectado.
          this.logger.log(
            JSON.stringify({
              event: 'download_unknown',
              path,
              ...baseFields,
            }),
          );
        },
        error: (err) => {
          const reqAny = req as any;
          const laudoId =
            reqAny.laudoIdFromHandler ??
            req.params?.laudoId ??
            req.params?.id ??
            null;
          this.logger.warn(
            JSON.stringify({
              event: `download_${kind}_error`,
              laudoId,
              jobId: req.params?.jobId ?? null,
              statusCode: err?.status || 500,
              err: err?.message,
              ts,
            }),
          );
        },
      }),
    );
  }

  private detectKind(path: string): 'image' | 'enqueue' | 'status' {
    if (/^\/uploads\/image\/[^/]+\/download\/?$/.test(path)) {
      return 'image';
    }
    if (/^\/download\/laudo\/[^/]+(\/ambiente\/[^/]+)?\/?$/.test(path)) {
      return 'enqueue';
    }
    if (/^\/download\/job\/[^/]+\/?$/.test(path)) {
      return 'status';
    }
    return 'enqueue';
  }
}