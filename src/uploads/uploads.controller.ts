import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  Delete,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadsService } from './uploads.service';
import { CheckLimitDto, PresignedUrlDto } from './dto';

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  /**
   * Verifica se o usuário pode fazer upload de N imagens
   * POST /uploads/check-limit
   */
  @Post('check-limit')
  async checkLimit(@Request() req, @Body() dto: CheckLimitDto) {
    return this.uploadsService.checkUploadLimit(req.user.id, dto);
  }

  /**
   * Gera URL pré-assinada para upload direto ao S3
   * POST /uploads/presigned-url
   */
  @Post('presigned-url')
  async getPresignedUrl(@Request() req, @Body() dto: PresignedUrlDto) {
    return this.uploadsService.generatePresignedUrl(req.user.id, dto);
  }

  /**
   * Confirma upload e decrementa créditos
   * POST /uploads/confirm
   */
  @Post('confirm')
  async confirmUpload(
    @Request() req,
    @Body() body: { laudoId: string; s3Key: string },
  ) {
    await this.uploadsService.confirmUpload(req.user.id, body.laudoId, body.s3Key);
    return { success: true };
  }

  /**
   * Lista imagens de um laudo
   * GET /uploads/laudo/:laudoId
   */
  @Get('laudo/:laudoId')
  async getImagensByLaudo(@Request() req, @Param('laudoId') laudoId: string) {
    return this.uploadsService.getImagensByLaudo(req.user.id, laudoId, req.user.role);
  }

  /**
   * Gera URL temporária para visualização de imagem
   * GET /uploads/image/:id/view-url
   */
  @Get('image/:id/view-url')
  async getViewUrl(@Request() req, @Param('id') imagemId: string) {
    const url = await this.uploadsService.getViewUrl(req.user.id, imagemId, req.user.role);
    return { url };
  }

  /**
   * Retorna quantidade de imagens restantes do usuário
   * GET /uploads/remaining
   */
  @Get('remaining')
  async getImagensRestantes(@Request() req) {
    const remaining = await this.uploadsService.getImagensRestantes(req.user.id);
    return { remaining };
  }
  /**
   * Lista imagens de um laudo com paginação
   * GET /uploads/laudo/:laudoId/imagens?page=1&limit=20
   */
  @Get('laudo/:laudoId/imagens')
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
   * Deleta uma imagem
   * DELETE /uploads/imagem/:id
   */
  @Delete('imagem/:id')
  async deleteImagem(@Request() req, @Param('id') imagemId: string) {
    await this.uploadsService.deleteImagem(
      req.user.id,
      imagemId,
      req.user.role,
    );
    return { success: true };
  }
}
