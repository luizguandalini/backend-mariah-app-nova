import { ApiProperty } from '@nestjs/swagger';

/**
 * Marcador de permissões do chamador sobre um laudo, embutido nas
 * respostas das DUAS leituras abertas da drive view
 * (`GET /laudos/:id/ambientes-web` e
 * `GET /uploads/laudo/:laudoId/ambiente/:ambiente/imagens`).
 *
 * Regras por flag:
 * - `isOwner`, `isAdmin`: binário (reflete o `req.user`/`laudo.usuarioId`).
 * - `canWrite`, `canDelete`: `true` só para dono OU `DEV`/`ADMIN`.
 *   Anônimo e logado não-dono não-admin recebem `false` (modo visualização
 *   — não podem mutar o laudo, mas podem ler).
 * - `canDownloadFoto`, `canRequestAmbienteZip`, `canRequestLaudoZip`:
 *   `true` para **todos** os chamadores que conseguiram ler a drive view
 *   (anônimo, logado não-dono, dono, admin/dev). Os endpoints de download
 *   foram liberalizados pela change `enable-download-in-visualization`:
 *   `GET /uploads/image/:id/download`, `POST /download/laudo/:laudoId/ambiente/:amb`,
 *   `POST /download/laudo/:laudoId`, `GET /download/job/:jobId`.
 *
 * O frontend usa esses flags para esconder/desabilitar botões de ação.
 * A trava **real** de escrita continua sendo o `JwtAuthGuard` +
 * checagem de ownership/admin no service das rotas de mutação —
 * `viewer` é uma sinalização, não a única linha de defesa.
 */
export class DriveViewerDto {
  @ApiProperty({ description: 'true se o chamador autenticado é dono do laudo (ou se já houver JWT válido na req e bater com laudo.usuarioId).' })
  isOwner: boolean;

  @ApiProperty({ description: 'true se o chamador autenticado tem papel DEV ou ADMIN.' })
  isAdmin: boolean;

  /**
   * Atalho. `canWrite = isOwner || isAdmin`. Todos os outros `can*`
   * derivam do mesmo flag, mas são listados separadamente para o
   * frontend poder esconder/desabilitar botões individualmente.
   */
  @ApiProperty({ description: 'true se o chamador pode mutar o laudo (dono OU admin/dev).' })
  canWrite: boolean;

  @ApiProperty({ description: 'true se o chamador pode deletar fotos (DELETE /uploads/imagem/:id).' })
  canDelete: boolean;

  @ApiProperty({ description: 'true se o chamador pode baixar a foto otimizada via GET /uploads/image/:id/download.' })
  canDownloadFoto: boolean;

  @ApiProperty({ description: 'true se o chamador pode enfileirar download ZIP de um ambiente (POST /download/laudo/:laudoId/ambiente/:amb).' })
  canRequestAmbienteZip: boolean;

  @ApiProperty({ description: 'true se o chamador pode enfileirar download ZIP do laudo inteiro (POST /download/laudo/:laudoId).' })
  canRequestLaudoZip: boolean;
}
