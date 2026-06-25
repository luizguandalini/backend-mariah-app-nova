import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';

import { ContestacaoService } from './contestacao.service';
import { PresignedUrlContestacaoDto } from './dto/presigned-url-contestacao.dto';
import { ConfirmContestacaoUploadDto } from './dto/confirm-contestacao-upload.dto';
import { SubmitContestacaoDto } from './dto/submit-contestacao.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('contestacao')
@Controller('contestacao')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ContestacaoController {
  constructor(private readonly contestacaoService: ContestacaoService) {}

  @Get('laudos/:laudoId')
  @ApiOperation({ summary: 'Obter contestação do laudo (descrição + imagens)' })
  @ApiParam({ name: 'laudoId', description: 'ID do laudo' })
  async getContestacao(@Param('laudoId') laudoId: string, @CurrentUser() user: any) {
    return this.contestacaoService.getContestacao(laudoId, user.id, user.role);
  }

  @Post('laudos/:laudoId/presigned-url')
  @ApiOperation({
    summary: 'Gerar URL pré-assinada para upload de imagem da contestação',
  })
  @ApiParam({ name: 'laudoId', description: 'ID do laudo' })
  @ApiResponse({ status: 201, description: 'URL gerada com sucesso' })
  async getPresignedUrl(
    @Param('laudoId') laudoId: string,
    @Body() dto: PresignedUrlContestacaoDto,
    @CurrentUser() user: any,
  ): Promise<{ uploadUrl: string; s3Key: string }> {
    return this.contestacaoService.generatePresignedUrl(
      laudoId,
      user.id,
      user.role,
      dto,
    );
  }

  @Post('laudos/:laudoId/confirm')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Confirmar upload de imagem da contestação (cria registro no banco). Legenda obrigatória.',
  })
  @ApiParam({ name: 'laudoId', description: 'ID do laudo' })
  @ApiResponse({ status: 201, description: 'Imagem confirmada' })
  async confirmUpload(
    @Param('laudoId') laudoId: string,
    @Body() dto: ConfirmContestacaoUploadDto,
    @CurrentUser() user: any,
  ): Promise<{ id: string; s3Key: string; ordem: number; legenda: string }> {
    return this.contestacaoService.confirmUpload(laudoId, user.id, user.role, dto);
  }

  @Post('laudos/:laudoId/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Trava os registros complementares. Apenas uma vez por laudo. Exige ≥1 imagem já confirmada (com legenda).',
  })
  @ApiParam({ name: 'laudoId', description: 'ID do laudo' })
  @ApiResponse({ status: 200, description: 'Registros complementares enviados' })
  async submit(
    @Param('laudoId') laudoId: string,
    @Body() _dto: SubmitContestacaoDto,
    @CurrentUser() user: any,
  ) {
    return this.contestacaoService.submit(laudoId, user.id, user.role);
  }
}