import { Controller, Post, Get, Param, UseGuards, Request } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DownloadService } from './download.service';

@Controller('download')
@UseGuards(JwtAuthGuard)
export class DownloadController {
  constructor(private readonly downloadService: DownloadService) {}

  /**
   * Enfileira a geração do ZIP de um ambiente do laudo.
   * POST /download/laudo/:laudoId/ambiente/:ambiente
   */
  @Post('laudo/:laudoId/ambiente/:ambiente')
  @ApiOperation({ summary: 'Solicita o ZIP das fotos de um ambiente (assíncrono)' })
  async requestAmbienteZip(
    @Request() req,
    @Param('laudoId') laudoId: string,
    @Param('ambiente') ambiente: string,
  ) {
    return this.downloadService.requestAmbienteZip(
      req.user.id,
      laudoId,
      decodeURIComponent(ambiente),
      req.user.role,
    );
  }

  /**
   * Enfileira a geração do ZIP do laudo inteiro (organizado por ambiente).
   * POST /download/laudo/:laudoId
   */
  @Post('laudo/:laudoId')
  @ApiOperation({ summary: 'Solicita o ZIP de todas as fotos do laudo (assíncrono)' })
  async requestLaudoZip(@Request() req, @Param('laudoId') laudoId: string) {
    return this.downloadService.requestLaudoZip(req.user.id, laudoId, req.user.role);
  }

  /**
   * Consulta o status de um job de download.
   * GET /download/job/:jobId
   */
  @Get('job/:jobId')
  @ApiOperation({ summary: 'Consulta o status de um job de download de ZIP' })
  async getJobStatus(@Request() req, @Param('jobId') jobId: string) {
    return this.downloadService.getJobStatus(req.user.id, jobId, req.user.role);
  }
}
