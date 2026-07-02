import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DownloadService } from './download.service';
import { DriveDownloadAuditInterceptor } from '../common/interceptors/drive-download-audit.interceptor';

/**
 * Controller dos endpoints de download de ZIP. **Liberalizado** pela
 * change `enable-download-in-visualization`: anônimo OU logado
 * (qualquer papel) consegue enfileirar e pollar jobs. A defesa
 * server-side fica por conta de:
 * - rate limit por IP (`@Throttle`)
 * - audit log granular (`DriveDownloadAuditInterceptor`)
 * - o `OptionalJwtAuthGuard` apenas popula `req.user` quando há token
 *   válido (não nega entrada).
 *
 * As escritas adjacentes (delete imagem, patch legenda, presigned-url,
 * etc.) vivem em outros controllers e **não** foram tocadas por esta
 * change — continuam estritas.
 */
@Controller('download')
export class DownloadController {
  constructor(private readonly downloadService: DownloadService) {}

  /**
   * Enfileira a geração do ZIP de um ambiente do laudo.
   * POST /download/laudo/:laudoId/ambiente/:ambiente
   *
   * Liberalizado: aceita anônimo OU logado. A checagem de ownership foi
   * removida do service; o rate limit + audit log cobrem a defesa.
   */
  @Post('laudo/:laudoId/ambiente/:ambiente')
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @UseInterceptors(DriveDownloadAuditInterceptor)
  @ApiOperation({ summary: 'Solicita o ZIP das fotos de um ambiente (assíncrono, modo visualização aceita anônimo).' })
  @ApiResponse({ status: 202, description: 'Job enfileirado' })
  @ApiResponse({ status: 400, description: 'Ambiente não possui fotos' })
  async requestAmbienteZip(
    @Param('laudoId') laudoId: string,
    @Param('ambiente') ambiente: string,
    @CurrentUser() user?: any,
  ) {
    return this.downloadService.requestAmbienteZip(
      laudoId,
      decodeURIComponent(ambiente),
      user ? { id: user.id, role: user.role } : undefined,
    );
  }

  /**
   * Enfileira a geração do ZIP do laudo inteiro (organizado por ambiente).
   * POST /download/laudo/:laudoId
   *
   * Liberalizado: mesma regra do requestAmbienteZip acima.
   */
  @Post('laudo/:laudoId')
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @UseInterceptors(DriveDownloadAuditInterceptor)
  @ApiOperation({ summary: 'Solicita o ZIP de todas as fotos do laudo (assíncrono, modo visualização aceita anônimo).' })
  @ApiResponse({ status: 202, description: 'Job enfileirado' })
  @ApiResponse({ status: 400, description: 'Laudo não possui fotos' })
  async requestLaudoZip(
    @Param('laudoId') laudoId: string,
    @CurrentUser() user?: any,
  ) {
    return this.downloadService.requestLaudoZip(
      laudoId,
      user ? { id: user.id, role: user.role } : undefined,
    );
  }

  /**
   * Consulta o status de um job de download. Inclui a presigned URL
   * quando o job está `ready`.
   * GET /download/job/:jobId
   *
   * Liberalizado: capacidade = conhecer o `jobId` (UUID v4). A checagem
   * `job.usuarioId === currentUser.id` foi removida — anônimo que
   * enfileirou consegue pollar.
   */
  @Get('job/:jobId')
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @UseInterceptors(DriveDownloadAuditInterceptor)
  @ApiOperation({ summary: 'Consulta o status de um job de download de ZIP (modo visualização aceita anônimo).' })
  @ApiResponse({ status: 200, description: 'Status do job; `url` presente apenas quando status === ready' })
  @ApiResponse({ status: 404, description: 'Job não encontrado' })
  async getJobStatus(
    @Param('jobId') jobId: string,
    @CurrentUser() user?: any,
  ) {
    return this.downloadService.getJobStatus(
      jobId,
      user ? { id: user.id, role: user.role } : undefined,
    );
  }
}