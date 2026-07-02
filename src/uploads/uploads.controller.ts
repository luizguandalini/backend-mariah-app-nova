import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  Request,
  Delete,
  Query,
  Patch,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FastifyReply } from 'fastify';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { UploadsService } from './uploads.service';
import { CheckLimitDto, PresignedUrlDto, ConfirmWebUploadDto, UpdateImagemMetadataDto, ClassifyItemWebDto } from './dto';
import { UpdateLegendaDto } from './dto/update-legenda.dto';
import { SignedUrlsBatchDto } from './dto/signed-urls-batch.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DriveReadonlyAuditInterceptor } from '../common/interceptors/drive-readonly-audit.interceptor';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  /**
   * Verifica se o usuário pode fazer upload de N imagens
   * POST /uploads/check-limit
   */
  @Post('check-limit')
  @UseGuards(JwtAuthGuard)
  async checkLimit(@Request() req, @Body() dto: CheckLimitDto) {
    return this.uploadsService.checkUploadLimit(req.user.id, dto);
  }

  /**
   * Gera URL pré-assinada para upload direto ao S3
   * POST /uploads/presigned-url
   */
  @Post('presigned-url')
  @UseGuards(JwtAuthGuard)
  async getPresignedUrl(@Request() req, @Body() dto: PresignedUrlDto) {
    return this.uploadsService.generatePresignedUrl(req.user.id, dto);
  }

  /**
   * Confirma upload e decrementa créditos
   * POST /uploads/confirm
   */
  @Post('confirm')
  @UseGuards(JwtAuthGuard)
  async confirmUpload(
    @Request() req,
    @Body() body: { laudoId: string; s3Key: string },
  ) {
    await this.uploadsService.confirmUpload(req.user.id, body.laudoId, body.s3Key);
    return { success: true };
  }

  /**
   * Confirma upload via WEB com metadados (sem Lambda/EXIF)
   * POST /uploads/confirm-web
   */
  @Post('confirm-web')
  @UseGuards(JwtAuthGuard)
  async confirmWebUpload(
    @Request() req,
    @Body() dto: ConfirmWebUploadDto,
  ) {
    const imagem = await this.uploadsService.confirmWebUpload(req.user.id, dto, req.user.role);
    return { success: true, imagem };
  }

  /**
   * Atualiza metadados de uma imagem (troca manual de item)
   * PATCH /uploads/imagem/:id/metadata
   */
  @Patch('imagem/:id/metadata')
  @UseGuards(JwtAuthGuard)
  async updateImagemMetadata(
    @Request() req,
    @Param('id') imagemId: string,
    @Body() dto: UpdateImagemMetadataDto,
  ) {
    return this.uploadsService.updateImagemMetadata(
      req.user.id,
      imagemId,
      dto,
      req.user.role,
    );
  }

  /**
   * Classifica um item via Inteligência Artificial usando créditos web
   * POST /uploads/classify-item
   */
  @Post('classify-item')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Classifica um item via IA para fluxo web' })
  @ApiResponse({ status: 200, description: 'Item classificado com sucesso' })
  async classifyWebItem(@Request() req, @Body() dto: ClassifyItemWebDto) {
    return this.uploadsService.classifyWebItem(req.user.id, dto);
  }

  /**
   * Lista imagens de um laudo

   * GET /uploads/laudo/:laudoId
   */
  @Get('laudo/:laudoId')
  @UseGuards(JwtAuthGuard)
  async getImagensByLaudo(@Request() req, @Param('laudoId') laudoId: string) {
    return this.uploadsService.getImagensByLaudo(req.user.id, laudoId, req.user.role);
  }

  /**
   * Gera URL temporária para visualização de imagem
   * GET /uploads/image/:id/view-url
   */
  @Get('image/:id/view-url')
  @UseGuards(JwtAuthGuard)
  async getViewUrl(@Request() req, @Param('id') imagemId: string) {
    const url = await this.uploadsService.getViewUrl(req.user.id, imagemId, req.user.role);
    return { url };
  }

  /**
   * Download de uma imagem específica, otimizada (mais leve), com headers
   * de download. Mantém o original intacto no S3.
   * GET /uploads/image/:id/download
   *
   * Permanece **estrito** (JWT + ownership/admin) — a UI desabilita/hide
   * o botão quando `viewer.canDownloadFoto === false` no payload da
   * rota liberalizada `GET /laudos/:id/ambientes-web`. Defesa em
   * profundidade: o byte da imagem é o mesmo da URL presigned em
   * `img.url`, mas este endpoint exige token server-side.
   */
  @Get('image/:id/download')
  @UseGuards(JwtAuthGuard)
  async downloadImagem(
    @Request() req,
    @Param('id') imagemId: string,
    @Res() reply: FastifyReply,
  ) {
    const { buffer, filename, contentType } = await this.uploadsService.downloadImagem(
      req.user.id,
      imagemId,
      req.user.role,
    );
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    reply.header('Content-Length', buffer.length);
    reply.type(contentType);
    reply.send(buffer);
  }

  /**
   * Retorna quantidade de imagens restantes do usuário
   * GET /uploads/remaining
   */
  @Get('remaining')
  @UseGuards(JwtAuthGuard)
  async getImagensRestantes(@Request() req) {
    const remaining = await this.uploadsService.getImagensRestantes(req.user.id);
    return { remaining };
  }
  /**
   * Lista imagens de um laudo com paginação
   * GET /uploads/laudo/:laudoId/imagens?page=1&limit=20
   */
  @Get('laudo/:laudoId/imagens')
  @UseGuards(JwtAuthGuard)
  async getImagensPaginadas(
    @Request() req,
    @Param('laudoId') laudoId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.uploadsService.getImagensPaginadas(
      req.user.id,
      laudoId,
      Number(page),
      Number(limit),
      req.user.role,
    );
  }

  /**
   * Lista ambientes distintos de um laudo com contagem de imagens
   * GET /uploads/laudo/:laudoId/ambientes?page=1&limit=10
   */
  @Get('laudo/:laudoId/ambientes')
  @UseGuards(JwtAuthGuard)
  async getAmbientesByLaudo(
    @Request() req,
    @Param('laudoId') laudoId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.uploadsService.getAmbientesByLaudo(
      req.user.id,
      laudoId,
      Number(page),
      Number(limit),
      req.user.role,
    );
  }

  /**
   * Lista imagens de um ambiente específico de forma paginada
   * `GET /uploads/laudo/:laudoId/ambiente/:ambiente/imagens?page=1&limit=20`
   *
   * **Leitura aberta da drive view** (liberalizada pela change
   * `add-drive-readonly-mode-for-non-owners`).
   * - `OptionalJwtAuthGuard`: aceita anônimo OU logado.
   * - `Throttle`: rate-limit por IP para reduzir scraping.
   * - `DriveReadonlyAuditInterceptor`: registra cada chamada.
   * - O service calcula `viewer` e devolve a forma plena (dono/admin)
   *   ou a projeção read-only (demais).
   */
  @Get('laudo/:laudoId/ambiente/:ambiente/imagens')
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @UseInterceptors(DriveReadonlyAuditInterceptor)
  @ApiOperation({ summary: 'Listar imagens de um ambiente do laudo (leitura aberta da drive view).' })
  @ApiResponse({ status: 200, description: 'Lista paginada de imagens + viewer.' })
  @ApiResponse({ status: 404, description: 'Laudo não encontrado' })
  async getImagensByAmbiente(
    @Param('laudoId') laudoId: string,
    @Param('ambiente') ambiente: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @CurrentUser() user?: any,
  ) {
    return this.uploadsService.getImagensByAmbiente(
      laudoId,
      decodeURIComponent(ambiente),
      user ? { id: user.id, role: user.role } : undefined,
      Number(page),
      Number(limit),
    );
  }

  /**
   * Deleta uma imagem
   * DELETE /uploads/imagem/:id
   */
  @Delete('imagem/:id')
  @UseGuards(JwtAuthGuard)
  async deleteImagem(@Request() req, @Param('id') imagemId: string) {
    await this.uploadsService.deleteImagem(
      req.user.id,
      imagemId,
      req.user.role,
    );
    return { success: true };
  }

  /**
   * Atualiza legenda de uma imagem
   * PATCH /uploads/imagem/:id/legenda
   */
  @Patch('imagem/:id/legenda')
  @UseGuards(JwtAuthGuard)
  async updateLegenda(
    @Request() req,
    @Param('id') imagemId: string,
    @Body() dto: UpdateLegendaDto,
  ) {
    return this.uploadsService.updateLegenda(imagemId, dto.legenda, req.user.id, req.user.role);
  }

  /**
   * Gera URLs pré-assinadas em batch para visualização
   * POST /uploads/signed-urls-batch
   */
  @Post('signed-urls-batch')
  @UseGuards(JwtAuthGuard)
  async getSignedUrlsBatch(@Body() dto: SignedUrlsBatchDto) {
    return this.uploadsService.getSignedUrlsBatch(dto.s3Keys);
  }
}
