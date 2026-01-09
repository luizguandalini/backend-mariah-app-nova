import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  Request,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { LaudosService } from '../laudos/laudos.service';
import { QueueService } from './queue.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

@Controller('queue')
@UseGuards(JwtAuthGuard)
export class QueueController {
  constructor(
    private readonly queueService: QueueService,
    private readonly laudosService: LaudosService,
  ) {}

  /**
   * Adiciona um laudo à fila de análise
   */
  @Post('analisar-laudo/:laudoId')
  async addToQueue(@Param('laudoId') laudoId: string, @Request() req: any) {
    // Buscar laudo para verificar permissão
    const laudo = await this.laudosService.findOne(laudoId);
    if (!laudo) {
      throw new NotFoundException('Laudo não encontrado');
    }

    const isAdmin = req.user.role === UserRole.ADMIN || req.user.role === UserRole.DEV;

    // Se não for admin, verificar se é o dono
    if (!isAdmin && laudo.usuarioId !== req.user.id) {
      throw new ForbiddenException('Você não tem permissão para iniciar análise deste laudo');
    }
    
    // IMPORTANTE: Adicionar à fila usando o ID do DONO e não necessariamente de quem chamou a rota (caso seja admin)
    const queueItem = await this.queueService.addToQueue(laudoId, laudo.usuarioId);

    return {
      success: true,
      message: 'Laudo adicionado à fila',
      position: queueItem.position,
      totalImages: queueItem.totalImages,
    };
  }

  /**
   * Remove um laudo da fila (cancelar análise)
   */
  @Delete('cancelar/:laudoId')
  async removeFromQueue(@Param('laudoId') laudoId: string, @Request() req: any) {
    await this.queueService.removeFromQueue(laudoId, req.user.id);
    return { success: true, message: 'Análise cancelada' };
  }

  /**
   * Retorna status da fila para um laudo específico do usuário
   */
  @Get('status/:laudoId')
  async getStatus(@Param('laudoId') laudoId: string, @Request() req: any) {
    return await this.queueService.getUserQueueStatus(laudoId, req.user.id);
  }

  /**
   * Retorna estatísticas gerais da fila
   */
  @Get('stats')
  async getStats() {
    return await this.queueService.getQueueStats();
  }

  /**
   * Retorna a fila completa (Admin/Dev only)
   */
  @Get('admin/full')
  @UseGuards(RolesGuard)
  @Roles(UserRole.DEV, UserRole.ADMIN)
  async getFullQueue() {
    return await this.queueService.getFullQueue();
  }

  /**
   * Retorna status global da fila (pausada/motivo) - Admin/Dev only
   */
  @Get('admin/global-status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.DEV, UserRole.ADMIN)
  async getGlobalStatus() {
    return await this.queueService.getGlobalStatus();
  }

  /**
   * Retoma a fila após correção do problema - Admin/Dev only
   */
  @Post('admin/resume')
  @UseGuards(RolesGuard)
  @Roles(UserRole.DEV, UserRole.ADMIN)
  async resumeQueue() {
    return await this.queueService.resumeQueue();
  }
}

