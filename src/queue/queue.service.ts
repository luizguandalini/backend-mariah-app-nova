import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan, IsNull, In } from 'typeorm';
import { AnalysisQueue, AnalysisStatus } from './entities/analysis-queue.entity';
import { ImagemLaudo } from '../uploads/entities/imagem-laudo.entity';
import { Laudo, StatusLaudo } from '../laudos/entities/laudo.entity';
import { OpenAIService } from '../openai/openai.service';
import { Ambiente } from '../ambientes/entities/ambiente.entity';
import { ItemAmbiente } from '../ambientes/entities/item-ambiente.entity';
import { normalizeForMatch, textMatches } from '../common/utils/text-normalizer.util';
import { RabbitMQService, QueueMessage } from './rabbitmq.service';
import { UploadsService } from '../uploads/uploads.service';
import { SystemConfig } from '../config/entities/system-config.entity';
import { QueueGateway } from './queue.gateway';
import { SystemConfigService } from '../config/config.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface QueueItemResponse {
  id: string;
  laudoId: string;
  endereco: string;
  usuarioNome: string;
  usuarioEmail: string;
  status: AnalysisStatus;
  position: number;
  totalImages: number;
  processedImages: number;
  progressPercentage: number;
  createdAt: Date;
  startedAt?: Date;
}

export interface UserQueueStatus {
  inQueue: boolean;
  position?: number;
  status?: AnalysisStatus;
  totalImages?: number;
  processedImages?: number;
  progressPercentage?: number;
  estimatedMinutes?: number;
}

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly logger = new Logger(QueueService.name);
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly metadataRetryDelayMs = 3000;
  private readonly metadataMaxWaitMs = 120000;

  constructor(
    @InjectRepository(AnalysisQueue)
    private readonly queueRepository: Repository<AnalysisQueue>,
    @InjectRepository(ImagemLaudo)
    private readonly imagemRepository: Repository<ImagemLaudo>,
    @InjectRepository(Laudo)
    private readonly laudoRepository: Repository<Laudo>,
    @InjectRepository(Ambiente)
    private readonly ambienteRepository: Repository<Ambiente>,
    @InjectRepository(ItemAmbiente)
    private readonly itemRepository: Repository<ItemAmbiente>,
    @InjectRepository(SystemConfig)
    private readonly configRepository: Repository<SystemConfig>,
    private readonly openaiService: OpenAIService,
    private readonly rabbitMQService: RabbitMQService,
    private readonly uploadsService: UploadsService,
    private readonly queueGateway: QueueGateway,
    private readonly systemConfigService: SystemConfigService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async onModuleInit() {
    // Recalcular posições ao iniciar
    await this.recalculatePositions();

    // Recuperar itens travados (zumbis de restart)
    // Verificar itens PENDING ou PROCESSING que já terminaram (processedImages >= totalImages)
    const allActiveItems = await this.queueRepository.find({
      where: [{ status: AnalysisStatus.PROCESSING }, { status: AnalysisStatus.PENDING }],
    });

    if (allActiveItems.length > 0) {
      for (const item of allActiveItems) {
        // Se já processou tudo, marcar como COMPLETED
        if (item.processedImages >= item.totalImages && item.totalImages > 0) {
          this.logger.log(
            `Item ${item.laudoId} já está 100% processado (${item.processedImages}/${item.totalImages}). Marcando como COMPLETED.`,
          );
          item.status = AnalysisStatus.COMPLETED;
          item.completedAt = new Date();
          item.position = null;
          await this.queueRepository.save(item);

          // Atualizar o Laudo também
          await this.laudoRepository.update(item.laudoId, { status: StatusLaudo.CONCLUIDO });
        }
        // Se estava PROCESSING mas não terminou, volta para PENDING
        else if (item.status === AnalysisStatus.PROCESSING) {
          this.logger.warn(
            `Item ${item.laudoId} travado em PROCESSING (${item.processedImages}/${item.totalImages}). Retornando para PENDING.`,
          );
          item.status = AnalysisStatus.PENDING;
          await this.queueRepository.save(item);
        }
      }
      // Recalcular posições
      await this.recalculatePositions();
    }

    // Registrar callback para quando RabbitMQ conectar
    this.rabbitMQService.onConnect(async () => {
      // Parar fallback de polling se estiver ativo
      if (this.processingInterval) {
        clearInterval(this.processingInterval);
        this.processingInterval = null;
        this.logger.log('⬆️ RabbitMQ conectou! Parando fallback de polling...');
      }

      // Iniciar consumer RabbitMQ
      try {
        await this.rabbitMQService.consume(async (message: QueueMessage) => {
          await this.processLaudo(message.laudoId);
        });
        this.logger.log('✅ Queue Service usando RabbitMQ consumer');
      } catch (error) {
        this.logger.error('Erro ao registrar consumer RabbitMQ:', error);
      }
    });

    // Se RabbitMQ não está conectado ainda, usar fallback de polling
    if (!this.rabbitMQService.isConnected()) {
      this.logger.warn('RabbitMQ ainda não conectou - usando fallback de polling temporário');
      this.processingInterval = setInterval(() => {
        this.processNextInQueue();
      }, 30000);
      this.logger.log('Queue Service inicializado (fallback: polling a cada 30s)');
    }
  }

  /**
   * Adiciona um laudo à fila de análise
   */
  async addToQueue(
    laudoId: string,
    userId: string,
    force: boolean = false,
  ): Promise<AnalysisQueue> {
    // Verificar se já está na fila
    const existing = await this.queueRepository.findOne({
      where: { laudoId },
    });

    if (existing) {
      // Se force for true, permite reanalisar se não estiver PROCESSANDO
      if (force) {
        if (existing.status === AnalysisStatus.PROCESSING) {
          throw new BadRequestException('Este laudo já está sendo analisado no momento');
        }
        // Se estiver em qualquer outro estado (COMPLETED, ERROR, CANCELLED, PAUSED, PENDING), removemos para reiniciar
        await this.queueRepository.remove(existing);
      } else {
        // Comportamento padrão (sem force)
        if (existing.status === AnalysisStatus.PROCESSING) {
          throw new BadRequestException('Este laudo já está sendo analisado');
        }
        if (existing.status === AnalysisStatus.PENDING) {
          throw new BadRequestException('Este laudo já está na fila');
        }
        // Se já foi completado ou deu erro, remover para re-adicionar
        await this.queueRepository.remove(existing);
      }
    }

    // Verificar se OpenAI está configurada
    if (!this.openaiService.isConfigured()) {
      throw new BadRequestException(
        'Análise por IA não está configurada. Contate o administrador.',
      );
    }

    // LÓGICA FORCE: Resetar status de todas as imagens do laudo
    if (force) {
      await this.imagemRepository
        .createQueryBuilder()
        .update(ImagemLaudo)
        .set({
          imagemJaFoiAnalisadaPelaIa: 'nao',
          // Opcional: limpar legenda também? Por enquanto manter a antiga até ser substituída
        })
        .where('laudoId = :laudoId', { laudoId })
        .execute();

      this.logger.log(`[FORCE] Resetado status de imagens para laudo ${laudoId}`);
    }

    // Contar imagens não analisadas do laudo
    const totalImages = await this.imagemRepository.count({
      where: {
        laudoId,
        imagemJaFoiAnalisadaPelaIa: 'nao',
      },
    });

    if (totalImages === 0) {
      // Auto-correção: Se não tem imagens pendentes -> marca como concluído
      // (Só lança erro se NÃO for force, pois se for force acabamos de resetar, então deveria ter imagens)
      // Se mesmo com force deu 0, é porque laudo não tem imagens.
      await this.laudoRepository.update(laudoId, { status: StatusLaudo.CONCLUIDO });
      throw new BadRequestException('Laudo não possui imagens para analisar');
    }

    // Calcular próxima posição
    const lastInQueue = await this.queueRepository.findOne({
      where: { status: AnalysisStatus.PENDING },
      order: { position: 'DESC' },
    });
    const nextPosition = (lastInQueue?.position || 0) + 1;

    // Criar entrada na fila
    const queueItem = this.queueRepository.create({
      laudoId,
      usuarioId: userId,
      status: AnalysisStatus.PENDING,
      position: nextPosition,
      totalImages,
      processedImages: 0,
    });

    const saved = await this.queueRepository.save(queueItem);
    this.logger.log(
      `Laudo ${laudoId} adicionado à fila na posição ${nextPosition} (Force: ${force})`,
    );

    // Enviar para RabbitMQ se conectado
    if (this.rabbitMQService.isConnected()) {
      await this.rabbitMQService.addToQueue({
        laudoId,
        usuarioId: userId,
        priority: 5,
      });
    }

    return saved;
  }

  /**
   * Remove um laudo da fila (cancelar)
   */
  async removeFromQueue(laudoId: string, userId: string): Promise<void> {
    const item = await this.queueRepository.findOne({
      where: { laudoId, usuarioId: userId },
    });

    if (!item) {
      throw new NotFoundException('Laudo não encontrado na fila');
    }

    if (item.status === AnalysisStatus.PROCESSING) {
      // Marcar como cancelado - o worker vai parar
      item.status = AnalysisStatus.CANCELLED;
      await this.queueRepository.save(item);
    } else {
      await this.queueRepository.remove(item);
    }

    await this.recalculatePositions();
    this.logger.log(`Laudo ${laudoId} removido da fila`);
  }

  /**
   * Retorna status da fila para um usuário específico
   */
  async getUserQueueStatus(laudoId: string, userId: string): Promise<UserQueueStatus> {
    const item = await this.queueRepository.findOne({
      where: { laudoId, usuarioId: userId },
    });

    if (!item) {
      return { inQueue: false };
    }

    // Estimar tempo baseado na posição (aprox. 3 segundos por imagem)
    const pendingBefore = await this.queueRepository.count({
      where: {
        status: AnalysisStatus.PENDING,
        position: LessThan(item.position),
      },
    });

    // Somar imagens dos laudos anteriores
    const queueBefore = await this.queueRepository.find({
      where: {
        status: AnalysisStatus.PENDING,
        position: LessThan(item.position),
      },
    });
    const totalImagesBefore = queueBefore.reduce((sum, q) => sum + q.totalImages, 0);
    const estimatedSeconds = totalImagesBefore * 3 + (item.totalImages - item.processedImages) * 3;

    return {
      inQueue: true,
      position: item.position,
      status: item.status,
      totalImages: item.totalImages,
      processedImages: item.processedImages,
      progressPercentage:
        item.totalImages > 0 ? Math.round((item.processedImages / item.totalImages) * 100) : 0,
      estimatedMinutes: Math.ceil(estimatedSeconds / 60),
    };
  }

  /**
   * Retorna a fila completa (para admin)
   */
  async getFullQueue(): Promise<QueueItemResponse[]> {
    const items = await this.queueRepository.find({
      where: [
        { status: AnalysisStatus.PENDING },
        { status: AnalysisStatus.PROCESSING },
        { status: AnalysisStatus.PAUSED }, // Incluir itens pausados na lista
      ],
      relations: ['laudo', 'usuario'],
      order: { position: 'ASC' },
    });

    return items.map((item) => ({
      id: item.id,
      laudoId: item.laudoId,
      endereco: item.laudo?.endereco || 'N/A',
      usuarioNome: item.usuario?.nome || 'N/A',
      usuarioEmail: item.usuario?.email || 'N/A',
      status: item.status,
      position: item.position,
      totalImages: item.totalImages,
      processedImages: item.processedImages,
      progressPercentage:
        item.totalImages > 0 ? Math.round((item.processedImages / item.totalImages) * 100) : 0,
      createdAt: item.createdAt,
      startedAt: item.startedAt,
    }));
  }

  /**
   * Recalcula posições na fila
   */
  private async recalculatePositions(): Promise<void> {
    const pendingItems = await this.queueRepository.find({
      where: { status: AnalysisStatus.PENDING },
      order: { createdAt: 'ASC' },
    });

    for (let i = 0; i < pendingItems.length; i++) {
      pendingItems[i].position = i + 1;
    }

    if (pendingItems.length > 0) {
      await this.queueRepository.save(pendingItems);
    }
  }

  private async notifyLaudoConcluido(laudoId: string): Promise<void> {
    const laudo = await this.laudoRepository.findOne({
      where: { id: laudoId },
      select: ['id', 'usuarioId', 'endereco', 'pushNotifiedAt'],
    });

    if (!laudo || laudo.pushNotifiedAt) return;

    const endereco = laudo.endereco ? ` - ${laudo.endereco}` : '';
    const sent = await this.notificationsService.sendToUser(
      laudo.usuarioId,
      'Laudo concluído',
      `Seu laudo foi finalizado${endereco}`,
      { laudoId },
    );

    if (sent) {
      await this.laudoRepository.update(laudoId, { pushNotifiedAt: new Date() });
    }
  }

  /**
   * Processa um laudo específico (chamado pelo consumer RabbitMQ)
   */
  async processLaudo(laudoId: string): Promise<void> {
    const queueItem = await this.queueRepository.findOne({
      where: { laudoId },
    });

    if (!queueItem) {
      this.logger.warn(`Laudo ${laudoId} não encontrado na fila`);
      return;
    }

    if (queueItem.status === AnalysisStatus.COMPLETED) {
      this.logger.log(`Laudo ${laudoId} já foi processado`);
      return;
    }

    if (queueItem.status === AnalysisStatus.CANCELLED) {
      this.logger.log(`Laudo ${laudoId} foi cancelado`);
      return;
    }

    queueItem.status = AnalysisStatus.PROCESSING;
    queueItem.startedAt = new Date();
    await this.queueRepository.save(queueItem);

    // Atualizar status do LAUDO para PROCESSANDO
    await this.laudoRepository.update(laudoId, { status: StatusLaudo.PROCESSANDO });

    this.queueGateway.notifyStatusChange(laudoId, AnalysisStatus.PROCESSING);

    try {
      while (true) {
        const nextTask = await this.getNextTaskForLaudo(laudoId);

        if (!nextTask) {
          queueItem.status = AnalysisStatus.COMPLETED;
          queueItem.completedAt = new Date();
          queueItem.position = null;
          queueItem.processedImages =
            queueItem.processedImages < queueItem.totalImages
              ? queueItem.totalImages
              : queueItem.processedImages;
          await this.queueRepository.save(queueItem);
          await this.recalculatePositions();

          // Atualizar status do LAUDO para CONCLUIDO
          await this.laudoRepository.update(laudoId, { status: StatusLaudo.CONCLUIDO });

          this.logger.log(`Laudo ${laudoId} análise concluída!`);
          this.queueGateway.notifyStatusChange(laudoId, AnalysisStatus.COMPLETED);
          await this.notifyLaudoConcluido(laudoId);
          return;
        }

        // Verificar se foi cancelado
        const currentStatus = await this.queueRepository.findOne({
          where: { id: queueItem.id },
        });
        if (currentStatus?.status === AnalysisStatus.CANCELLED) {
          this.logger.log(`Laudo ${laudoId} cancelado durante processamento`);
          return;
        }

        // Atualizar imagem atual
        queueItem.currentImageId = nextTask.imagem.id;
        await this.queueRepository.save(queueItem);

        const processed =
          nextTask.type === 'classify-item'
            ? await this.processItemClassification(nextTask.imagem, queueItem)
            : await this.processImage(nextTask.imagem, queueItem);
        if (!processed) {
          await new Promise((resolve) => setTimeout(resolve, this.metadataRetryDelayMs));
          continue;
        }

        if (nextTask.type === 'analyze-description') {
          queueItem.processedImages += 1;
          await this.queueRepository.save(queueItem);

          const percentage = Math.round((queueItem.processedImages / queueItem.totalImages) * 100);
          this.queueGateway.notifyProgress(laudoId, {
            laudoId,
            processedImages: queueItem.processedImages,
            totalImages: queueItem.totalImages,
            percentage,
          });
        }
      }
    } catch (error) {
      this.logger.error(`Erro ao processar laudo ${laudoId}: ${error.message}`);

      // Recarregar item para verificar se foi pausado pelo handleCriticalError
      const updatedItem = await this.queueRepository.findOne({ where: { id: queueItem.id } });
      if (updatedItem?.status !== AnalysisStatus.PAUSED) {
        // Só marca como ERROR se não foi pausado por erro crítico
        queueItem.status = AnalysisStatus.ERROR;
        queueItem.errorMessage = error.message;
        await this.queueRepository.save(queueItem);
        this.queueGateway.notifyStatusChange(laudoId, AnalysisStatus.ERROR);
      }
      throw error; // Re-throw para RabbitMQ fazer nack
    }
  }

  /**
   * Processa o próximo item da fila
   */
  private async processNextInQueue(): Promise<void> {
    if (this.isProcessing) return;
    if (!this.openaiService.isConfigured()) return;

    // Buscar item em processamento ou próximo da fila
    let currentItem = await this.queueRepository.findOne({
      where: { status: AnalysisStatus.PROCESSING },
    });

    if (!currentItem) {
      currentItem = await this.queueRepository.findOne({
        where: { status: AnalysisStatus.PENDING },
        order: { position: 'ASC' },
      });
    }

    if (!currentItem) return;

    this.isProcessing = true;

    try {
      // Marcar como em processamento
      if (currentItem.status === AnalysisStatus.PENDING) {
        currentItem.status = AnalysisStatus.PROCESSING;
        currentItem.startedAt = new Date();
        await this.queueRepository.save(currentItem);

        // Atualizar status do LAUDO para PROCESSANDO
        await this.laudoRepository.update(currentItem.laudoId, { status: StatusLaudo.PROCESSANDO });

        this.queueGateway.notifyStatusChange(currentItem.laudoId, AnalysisStatus.PROCESSING);
      }

      const nextTask = await this.getNextTaskForLaudo(currentItem.laudoId);

      if (!nextTask) {
        // Laudo concluído (Se caiu aqui, é porque já acabou tudo, mesmo que tenha acabado de reiniciar)
        currentItem.status = AnalysisStatus.COMPLETED;
        currentItem.completedAt = new Date();
        currentItem.position = null;

        // Garantir que processados = total para coerência visual
        currentItem.processedImages =
          currentItem.processedImages < currentItem.totalImages
            ? currentItem.totalImages
            : currentItem.processedImages;

        await this.queueRepository.save(currentItem);
        await this.recalculatePositions();

        // Atualizar status do LAUDO para CONCLUIDO
        await this.laudoRepository.update(currentItem.laudoId, { status: StatusLaudo.CONCLUIDO });

        this.logger.log(`Laudo ${currentItem.laudoId} análise concluída!`);
        this.queueGateway.notifyStatusChange(currentItem.laudoId, AnalysisStatus.COMPLETED);
        await this.notifyLaudoConcluido(currentItem.laudoId);

        // Enviar progresso 100% final
        this.queueGateway.notifyProgress(currentItem.laudoId, {
          laudoId: currentItem.laudoId,
          processedImages: currentItem.totalImages,
          totalImages: currentItem.totalImages,
          percentage: 100,
        });

        this.isProcessing = false;

        // Se tinha acabado, verifique se temos mais coisa na fila imediatamente
        setTimeout(() => this.processNextInQueue(), 1000);
        return;
      }

      // Atualizar imagem atual
      currentItem.currentImageId = nextTask.imagem.id;
      await this.queueRepository.save(currentItem);

      const processed =
        nextTask.type === 'classify-item'
          ? await this.processItemClassification(nextTask.imagem, currentItem)
          : await this.processImage(nextTask.imagem, currentItem);
      if (!processed) {
        setTimeout(() => this.processNextInQueue(), this.metadataRetryDelayMs);
        return;
      }

      if (nextTask.type === 'analyze-description') {
        currentItem.processedImages += 1;
        await this.queueRepository.save(currentItem);

        const percentage = Math.round(
          (currentItem.processedImages / currentItem.totalImages) * 100,
        );
        this.queueGateway.notifyProgress(currentItem.laudoId, {
          laudoId: currentItem.laudoId,
          processedImages: currentItem.processedImages,
          totalImages: currentItem.totalImages,
          percentage,
        });
      }

      // Trigger next image processing immediately (chaining)
      setTimeout(() => this.processNextInQueue(), 1000);
    } catch (error) {
      this.logger.error(`Erro ao processar fila: ${error.message}`);
      if (currentItem) {
        // Recarregar item para verificar se foi pausado pelo handleCriticalError
        const updatedItem = await this.queueRepository.findOne({ where: { id: currentItem.id } });
        if (updatedItem?.status !== AnalysisStatus.PAUSED) {
          // Só marca como ERROR se não foi pausado por erro crítico
          currentItem.status = AnalysisStatus.ERROR;
          currentItem.errorMessage = error.message;
          await this.queueRepository.save(currentItem);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async getNextTaskForLaudo(
    laudoId: string,
  ): Promise<{ imagem: ImagemLaudo; type: 'classify-item' | 'analyze-description' } | null> {
    const tiposNaoIdentificados = ['Não identificado', 'Nao identificado'];

    const imagemSemItem = await this.imagemRepository
      .createQueryBuilder('img')
      .where('img.laudo_id = :laudoId', { laudoId })
      .andWhere('(img.tipo IS NULL OR img.tipo IN (:...tiposNaoIdentificados))', {
        tiposNaoIdentificados,
      })
      .andWhere('img.item_ja_foi_analisado_pela_ia = :nao', { nao: 'nao' })
      .orderBy('img.ordem', 'ASC')
      .addOrderBy('img.created_at', 'ASC')
      .getOne();

    if (imagemSemItem) {
      return { imagem: imagemSemItem, type: 'classify-item' };
    }

    const imagemParaDescricao = await this.imagemRepository.findOne({
      where: {
        laudoId,
        imagemJaFoiAnalisadaPelaIa: 'nao',
      },
      order: { ordem: 'ASC' },
    });

    if (!imagemParaDescricao) {
      return null;
    }

    return { imagem: imagemParaDescricao, type: 'analyze-description' };
  }

  private async processItemClassification(
    imagem: ImagemLaudo,
    queueItem: AnalysisQueue,
  ): Promise<boolean> {
    const currentStatus = await this.queueRepository.findOne({
      where: { id: queueItem.id },
    });
    if (currentStatus?.status === AnalysisStatus.CANCELLED) {
      throw new Error('Análise cancelada pelo usuário');
    }

    if (imagem.itemJaFoiAnalisadoPelaIa === 'sim') {
      return true;
    }

    const tipoAtual = (imagem.tipo || '').trim();
    const isAvariaImage = (imagem.categoria || '').trim().toUpperCase() === 'AVARIA';
    const tipoEhNaoIdentificado =
      !tipoAtual ||
      textMatches(tipoAtual, 'Não identificado') ||
      textMatches(tipoAtual, 'Nao identificado');

    if (isAvariaImage) {
      if (!tipoAtual) {
        imagem.tipo = 'Não identificado';
      }
      imagem.itemJaFoiAnalisadoPelaIa = 'sim';
      await this.imagemRepository.save(imagem);
      return true;
    }

    if (!tipoEhNaoIdentificado || !imagem.tipoAmbiente) {
      imagem.itemJaFoiAnalisadoPelaIa = 'sim';
      await this.imagemRepository.save(imagem);
      return true;
    }

    this.logger.log(
      `[AUTO-CLASSIFY] Imagem ${imagem.id} sem item definido. Classificando antes da análise de descrição...`,
    );

    try {
      const autoClassResult = await this.autoClassifyItem(imagem, imagem.tipoAmbiente);
      if (autoClassResult) {
        imagem.tipo = autoClassResult;
        this.logger.log(`[AUTO-CLASSIFY] ✅ Item classificado como: ${autoClassResult}`);
      } else {
        imagem.tipo = 'Não identificado';
        this.logger.warn(
          `[AUTO-CLASSIFY] ❌ Não foi possível classificar a imagem ${imagem.id}. Seguirá para descrição com item não identificado.`,
        );
      }
    } catch (err) {
      imagem.tipo = 'Não identificado';
      this.logger.error(`[AUTO-CLASSIFY] Erro ao classificar imagem ${imagem.id}: ${err.message}`);
    }

    imagem.itemJaFoiAnalisadoPelaIa = 'sim';
    await this.imagemRepository.save(imagem);
    return true;
  }

  /**
   * Processa uma imagem individual
   */
  private async processImage(imagem: ImagemLaudo, queueItem: AnalysisQueue): Promise<boolean> {
    // Verificar se foi cancelado
    const currentStatus = await this.queueRepository.findOne({
      where: { id: queueItem.id },
    });
    if (currentStatus?.status === AnalysisStatus.CANCELLED) {
      throw new Error('Análise cancelada pelo usuário');
    }

    // Carregar prompt padrão do banco via SystemConfigService
    const defaultPrompt = await this.systemConfigService.getDefaultPrompt();

    // Buscar prompt baseado no tipo e tipo_ambiente
    const tipoAmbiente = (imagem.tipoAmbiente || '').trim() || this.resolveTipoAmbiente(imagem.ambiente);
    const tipoItem = imagem.tipo;

    if (!tipoAmbiente || !tipoItem) {
      const createdAtMs = imagem.createdAt ? new Date(imagem.createdAt).getTime() : Date.now();
      const ageMs = Date.now() - createdAtMs;
      if (ageMs < this.metadataMaxWaitMs) {
        this.logAnalysis({
          ambiente: imagem.ambiente || 'N/A',
          item: tipoItem || 'N/A',
          filho: null,
          promptEnviado: '(metadados pendentes)',
          resposta: 'Aguardando metadados do EXIF',
          sucesso: false,
        });
        return false;
      }
      this.logAnalysis({
        ambiente: imagem.ambiente || 'N/A',
        item: tipoItem || 'N/A',
        filho: null,
        promptEnviado: '(metadados ausentes)',
        resposta: 'Metadados não encontrados',
        sucesso: false,
      });
      imagem.legenda = 'Metadados não encontrados';
      imagem.imagemJaFoiAnalisadaPelaIa = 'sim';
      await this.imagemRepository.save(imagem);
      return true;
    }

    const laudo = await this.laudoRepository.findOne({
      where: { id: imagem.laudoId },
      select: ['id', 'tipoUso', 'tipoImovel'],
    });
    const tipoUsoFormatado = laudo?.tipoUso
      ? `${laudo.tipoUso.charAt(0)}${laudo.tipoUso.slice(1).toLowerCase()}`
      : null;
    const tipoImovelLaudo = laudo?.tipoImovel || null;

    const ambientes = await this.ambienteRepository.find({
      where: { ativo: true },
    });
    const ambiente = ambientes.find((a) => {
      if (!textMatches(a.nome, tipoAmbiente)) {
        return false;
      }
      const matchUso =
        !tipoUsoFormatado || !a.tiposUso?.length || a.tiposUso.includes(tipoUsoFormatado as any);
      const matchImovel =
        !tipoImovelLaudo ||
        !a.tiposImovel?.length ||
        a.tiposImovel.some((tipoImovel) => textMatches(tipoImovel, tipoImovelLaudo));
      return matchUso && matchImovel;
    });

    if (!ambiente) {
      this.logAnalysis({
        ambiente: tipoAmbiente,
        item: tipoItem,
        filho: null,
        promptEnviado: '(ambiente não encontrado)',
        resposta: `Ambiente "${tipoAmbiente}" não encontrado para o contexto ${tipoUsoFormatado || 'N/A'} / ${tipoImovelLaudo || 'N/A'}`,
        sucesso: false,
      });
      imagem.legenda = `Ambiente "${tipoAmbiente}" não encontrado`;
      imagem.imagemJaFoiAnalisadaPelaIa = 'sim';
      await this.imagemRepository.save(imagem);
      return true;
    }

    const isAvariaImage = (imagem.categoria || '').trim().toUpperCase() === 'AVARIA';
    const hasDetalheApontado = this.hasDetalheApontado(imagem);
    const imageUrl = await this.uploadsService.getSignedUrlForAi(imagem.s3Key);

    if (isAvariaImage) {
      const avariaPrompt = await this.systemConfigService.getAvariaPrompt();
      const avariaPromptSanitizado = avariaPrompt.trim();

      if (!avariaPromptSanitizado) {
        this.logAnalysis({
          ambiente: ambiente.nome,
          item: tipoItem,
          filho: null,
          promptEnviado: '(prompt de avaria não configurado)',
          resposta: 'Prompt de avaria não configurado',
          sucesso: false,
        });
        imagem.legenda = 'Prompt de avaria não configurado';
        imagem.imagemJaFoiAnalisadaPelaIa = 'sim';
        await this.imagemRepository.save(imagem);
        return true;
      }

      const promptFinal = [defaultPrompt.trim(), avariaPromptSanitizado].filter(Boolean).join(' ');

      this.logAnalysis({
        ambiente: ambiente.nome,
        item: `${tipoItem} (AVARIA)`,
        filho: null,
        promptEnviado: promptFinal,
        resposta: '🔄 Aguardando resposta...',
        sucesso: true,
        defaultPromptUsado: !!defaultPrompt.trim(),
      });

      const result = await this.openaiService.analyzeImage(imageUrl, promptFinal);

      if (result.success) {
        this.logAnalysis({
          ambiente: ambiente.nome,
          item: `${tipoItem} (AVARIA)`,
          filho: null,
          promptEnviado: promptFinal,
          resposta: result.content,
          sucesso: true,
          defaultPromptUsado: !!defaultPrompt.trim(),
        });
        imagem.legenda = result.content.substring(0, 200).trim();
        imagem.imagemJaFoiAnalisadaPelaIa = 'sim';
      } else {
        if (result.criticalError) {
          const errorMsg = result.error?.message || 'Erro crítico da OpenAI';
          await this.handleCriticalError(`${errorMsg}`);
          throw new Error(`Erro crítico: ${errorMsg}`);
        }
        this.logAnalysis({
          ambiente: ambiente.nome,
          item: `${tipoItem} (AVARIA)`,
          filho: null,
          promptEnviado: promptFinal,
          resposta: `❌ Erro: ${result.error?.message || 'Falha na API'}`,
          sucesso: false,
        });
        imagem.legenda = 'Erro na análise';
        imagem.imagemJaFoiAnalisadaPelaIa = 'sim';
      }

      await this.imagemRepository.save(imagem);
      this.logger.debug(`Imagem ${imagem.id} analisada: ${imagem.legenda}`);
      return true;
    }

    const ambientesDoMesmoGrupo = ambiente.grupoId
      ? ambientes.filter((a) => a.grupoId === ambiente.grupoId && a.ativo)
      : [ambiente];
    const ambienteIdsContexto = ambientesDoMesmoGrupo.map((a) => a.id);

    const itensBrutos = await this.itemRepository.find({
      where: {
        ambienteId: In(ambienteIdsContexto),
        ativo: true,
        parentId: IsNull(),
      },
      relations: ['filhos'],
    });

    const itensPorNome = new Map<string, ItemAmbiente>();
    for (const item of itensBrutos) {
      const chave = normalizeForMatch(item.nome);
      const atual = itensPorNome.get(chave);
      if (!atual) {
        itensPorNome.set(chave, item);
        continue;
      }

      const filhosAtivosAtual = (atual.filhos || []).filter((f) => f.ativo).length;
      const filhosAtivosNovo = (item.filhos || []).filter((f) => f.ativo).length;
      if (filhosAtivosNovo > filhosAtivosAtual) {
        itensPorNome.set(chave, item);
        continue;
      }

      if (
        filhosAtivosNovo === filhosAtivosAtual &&
        (item.prompt || '').trim().length > (atual.prompt || '').trim().length
      ) {
        itensPorNome.set(chave, item);
      }
    }

    const itens = Array.from(itensPorNome.values());
    const tipoItemNormalizado = normalizeForMatch(tipoItem);
    let item = itens.find((i) => textMatches(i.nome, tipoItem));

    if (!item) {
      item = itens.find((i) => {
        const nomeItemNormalizado = normalizeForMatch(i.nome);
        return (
          nomeItemNormalizado.includes(tipoItemNormalizado) ||
          tipoItemNormalizado.includes(nomeItemNormalizado)
        );
      });
    }

    if (!item) {
      this.logAnalysis({
        ambiente: ambiente.nome,
        item: tipoItem,
        filho: null,
        promptEnviado: '(item não encontrado)',
        resposta: `Item "${tipoItem}" não encontrado no ambiente "${ambiente.nome}"`,
        sucesso: false,
      });
      imagem.legenda = `Item "${tipoItem}" não encontrado`;
      imagem.imagemJaFoiAnalisadaPelaIa = 'sim';
      await this.imagemRepository.save(imagem);
      return true;
    }

    // Verificar se item tem filhos (precisa de análise em duas etapas)
    const filhosAtivos = (item.filhos || [])
      .filter((filho) => filho.ativo)
      .sort((a, b) => a.ordem - b.ordem);

    if (filhosAtivos.length > 0) {
      const identifyPrompt = this.buildTechnicalIdentifyPrompt(item.nome, filhosAtivos);

      this.logAnalysis({
        ambiente: ambiente.nome,
        item: item.nome,
        filho: '(identificando...)',
        promptEnviado: identifyPrompt,
        resposta: '🔄 Aguardando resposta...',
        sucesso: true,
        etapa: 1,
      });

      const identifyResult = await this.openaiService.analyzeImage(imageUrl, identifyPrompt);
      imagem.subitemJaFoiAnalisadoPelaIa = 'sim';

      if (!identifyResult.success) {
        // Verificar se é erro crítico que deve pausar a fila
        if (identifyResult.criticalError) {
          const errorMsg = identifyResult.error?.message || 'Erro crítico da OpenAI';
          await this.handleCriticalError(`${identifyResult.error?.status}: ${errorMsg}`);
          throw new Error(`Erro crítico: ${errorMsg}`);
        }
        this.logAnalysis({
          ambiente: ambiente.nome,
          item: item.nome,
          filho: null,
          promptEnviado: identifyPrompt,
          resposta: `❌ Erro: ${identifyResult.error?.message || 'Falha na API'}`,
          sucesso: false,
          etapa: 1,
        });
        imagem.legenda = 'Erro ao analisar imagem';
        imagem.imagemJaFoiAnalisadaPelaIa = 'sim';
        await this.imagemRepository.save(imagem);
        return true;
      }

      // Tentar identificar qual filho corresponde
      const childNames = filhosAtivos.map((f) => f.nome);
      const matchedChild = this.openaiService.identifyChildItem(identifyResult.content, childNames);

      // Buscar prompt do filho
      const childItem = matchedChild
        ? filhosAtivos.find((f) => textMatches(f.nome, matchedChild))
        : filhosAtivos[0];
      if (!childItem) {
        imagem.legenda = 'Não identificado';
        imagem.imagemJaFoiAnalisadaPelaIa = 'sim';
        await this.imagemRepository.save(imagem);
        return true;
      }

      // SEGUNDA ETAPA: análise com prompt do filho
      // Regra: ADICIONA prompt padrão ao prompt do filho
      const childPromptFinal = defaultPrompt
        ? `${defaultPrompt} ${childItem.prompt}`
        : childItem.prompt;

      this.logAnalysis({
        ambiente: ambiente.nome,
        item: item.nome,
        filho: childItem.nome,
        promptEnviado: childPromptFinal,
        resposta: '🔄 Aguardando resposta...',
        sucesso: true,
        etapa: 2,
        defaultPromptUsado: !!defaultPrompt,
      });

      const finalResult = await this.openaiService.analyzeImage(imageUrl, childPromptFinal);

      if (finalResult.success) {
        this.logAnalysis({
          ambiente: ambiente.nome,
          item: item.nome,
          filho: childItem.nome,
          promptEnviado: childPromptFinal,
          resposta: finalResult.content,
          sucesso: true,
          etapa: 2,
          defaultPromptUsado: !!defaultPrompt,
        });
        const suffix = hasDetalheApontado ? ' com detalhe apontado' : ' sem avarias aparentes';
        const maxContentLen = 200 - suffix.length;
        imagem.legenda = finalResult.content.substring(0, maxContentLen).trim() + suffix;
        imagem.imagemJaFoiAnalisadaPelaIa = 'sim';
      } else {
        // Verificar se é erro crítico que deve pausar a fila
        if (finalResult.criticalError) {
          const errorMsg = finalResult.error?.message || 'Erro crítico da OpenAI';
          await this.handleCriticalError(`${finalResult.error?.status}: ${errorMsg}`);
          throw new Error(`Erro crítico: ${errorMsg}`);
        }
        this.logAnalysis({
          ambiente: ambiente.nome,
          item: item.nome,
          filho: childItem.nome,
          promptEnviado: childPromptFinal,
          resposta: `❌ Erro: ${finalResult.error?.message || 'Falha na API'}`,
          sucesso: false,
          etapa: 2,
        });
        imagem.legenda = 'Erro na análise';
        imagem.imagemJaFoiAnalisadaPelaIa = 'sim';
      }
    } else {
      // ITEM SEM FILHOS - análise direta
      // Regra: ADICIONA prompt padrão ao prompt do item
      const promptFinal = defaultPrompt ? `${defaultPrompt} ${item.prompt}` : item.prompt;

      this.logAnalysis({
        ambiente: ambiente.nome,
        item: item.nome,
        filho: null,
        promptEnviado: promptFinal,
        resposta: '🔄 Aguardando resposta...',
        sucesso: true,
        defaultPromptUsado: !!defaultPrompt,
      });

      const result = await this.openaiService.analyzeImage(imageUrl, promptFinal);

      if (result.success) {
        this.logAnalysis({
          ambiente: ambiente.nome,
          item: item.nome,
          filho: null,
          promptEnviado: promptFinal,
          resposta: result.content,
          sucesso: true,
          defaultPromptUsado: !!defaultPrompt,
        });
        const suffix = hasDetalheApontado ? ' com detalhe apontado' : ' sem avarias aparentes';
        const maxContentLen = 200 - suffix.length;
        imagem.legenda = result.content.substring(0, maxContentLen).trim() + suffix;
        imagem.imagemJaFoiAnalisadaPelaIa = 'sim';
      } else {
        // Verificar se é erro crítico que deve pausar a fila
        if (result.criticalError) {
          const errorMsg = result.error?.message || 'Erro crítico da OpenAI';
          await this.handleCriticalError(`${errorMsg}`);
          throw new Error(`Erro crítico: ${errorMsg}`);
        }
        this.logAnalysis({
          ambiente: ambiente.nome,
          item: item.nome,
          filho: null,
          promptEnviado: promptFinal,
          resposta: `❌ Erro: ${result.error?.message || 'Falha na API'}`,
          sucesso: false,
        });
        imagem.legenda = 'Erro na análise';
        imagem.imagemJaFoiAnalisadaPelaIa = 'sim';
      }
    }

    await this.imagemRepository.save(imagem);
    this.logger.debug(`Imagem ${imagem.id} analisada: ${imagem.legenda}`);
    return true;
  }

  private buildTechnicalIdentifyPrompt(nomeItemPai: string, filhos: ItemAmbiente[]): string {
    const opcoes = filhos.map((filho) => `"${filho.nome}"`).join(', ');
    return `Item base: "${nomeItemPai}". Selecione exatamente uma opção entre: ${opcoes}. Analise a imagem e escolha a opção que melhor representa o conteúdo, mesmo em caso de dúvida. Responda apenas com o nome exato da opção escolhida. Nunca responda fora das opções listadas.`;
  }

  private hasDetalheApontado(imagem: ImagemLaudo): boolean {
    const categoria = (imagem.categoria || '').trim().toUpperCase();
    if (categoria === 'AVARIA') {
      return false;
    }

    const avariaLocalNormalizada = normalizeForMatch(imagem.avariaLocal || '');
    if (!avariaLocalNormalizada) {
      return false;
    }

    const marcadores = new Set(['comdetalheapontado', 'detalheapontado']);
    return marcadores.has(avariaLocalNormalizada);
  }

  private resolveTipoAmbiente(ambiente?: string | null): string | null {
    if (!ambiente) {
      return null;
    }
    const semPrefixoNumerico = ambiente.replace(/^\s*\d+\s*-\s*/, '').trim();
    return semPrefixoNumerico || null;
  }

  /**
   * Log colorido e estruturado para análise de imagens
   */
  private logAnalysis(params: {
    ambiente: string;
    item: string;
    filho: string | null;
    promptEnviado: string;
    resposta: string;
    sucesso: boolean;
    etapa?: number;
    defaultPromptUsado?: boolean;
  }): void {
    const { ambiente, item, filho, promptEnviado, resposta, sucesso, etapa, defaultPromptUsado } =
      params;

    // Cores ANSI
    const reset = '\x1b[0m';
    const bold = '\x1b[1m';
    const cyan = '\x1b[36m';
    const green = '\x1b[32m';
    const yellow = '\x1b[33m';
    const red = '\x1b[31m';
    const magenta = '\x1b[35m';
    const blue = '\x1b[34m';
    const bgBlue = '\x1b[44m';
    const white = '\x1b[37m';

    const statusColor = sucesso ? green : red;
    const statusIcon = sucesso ? '✅' : '❌';
    const etapaLabel = etapa ? ` (Etapa ${etapa}/2)` : '';
    const defaultLabel = defaultPromptUsado ? `${magenta}[+PROMPT PADRÃO]${reset} ` : '';

    // Truncar prompt e resposta para log legível
    const promptTruncado =
      promptEnviado.length > 150 ? promptEnviado.substring(0, 150) + '...' : promptEnviado;
    const respostaTruncada = resposta.length > 200 ? resposta.substring(0, 200) + '...' : resposta;

    console.log(`
${bgBlue}${white}${bold}╔══════════════════════════════════════════════════════════════════════╗${reset}
${bgBlue}${white}${bold}║  🖼️  ANÁLISE DE IMAGEM${etapaLabel}                                          ${reset}
${bgBlue}${white}${bold}╠══════════════════════════════════════════════════════════════════════╣${reset}
${cyan}${bold}  📍 Ambiente:${reset} ${ambiente}
${yellow}${bold}  📦 Item:${reset} ${item}
${blue}${bold}  👶 Filho:${reset} ${filho || '(nenhum - análise direta)'}
${bgBlue}${white}${bold}╠══════════════════════════════════════════════════════════════════════╣${reset}
${magenta}${bold}  📝 PROMPT ENVIADO:${reset} ${defaultLabel}
     "${promptTruncado}"
${bgBlue}${white}${bold}╠══════════════════════════════════════════════════════════════════════╣${reset}
${statusColor}${bold}  ${statusIcon} RESPOSTA:${reset}
     "${respostaTruncada}"
${bgBlue}${white}${bold}╚══════════════════════════════════════════════════════════════════════╝${reset}
`);
  }

  /**
   * Retorna estatísticas da fila
   */
  async getQueueStats() {
    const pending = await this.queueRepository.count({
      where: { status: AnalysisStatus.PENDING },
    });
    const processing = await this.queueRepository.count({
      where: { status: AnalysisStatus.PROCESSING },
    });
    const paused = await this.queueRepository.count({
      where: { status: AnalysisStatus.PAUSED },
    });
    const completedToday = await this.queueRepository.count({
      where: {
        status: AnalysisStatus.COMPLETED,
        completedAt: MoreThan(new Date(Date.now() - 24 * 60 * 60 * 1000)),
      },
    });

    return {
      pending,
      processing,
      paused,
      completedToday,
      total: pending + processing + paused,
    };
  }

  /**
   * Retorna status global da fila (pausada/motivo)
   */
  async getGlobalStatus(): Promise<{
    paused: boolean;
    reason?: string;
    pausedAt?: Date;
    pausedItems: number;
  }> {
    const pausedConfig = await this.configRepository.findOne({
      where: { key: 'queue_paused' },
    });

    const pausedItems = await this.queueRepository.count({
      where: { status: AnalysisStatus.PAUSED },
    });

    if (!pausedConfig || pausedConfig.value !== 'true') {
      return { paused: false, pausedItems };
    }

    const reasonConfig = await this.configRepository.findOne({
      where: { key: 'queue_paused_reason' },
    });

    return {
      paused: true,
      reason: reasonConfig?.value || 'Motivo desconhecido',
      pausedAt: pausedConfig.updatedAt,
      pausedItems,
    };
  }

  /**
   * Pausa a fila globalmente (chamado quando erro crítico é detectado)
   */
  async pauseQueue(reason: string): Promise<void> {
    this.logger.error(`🛑 PAUSANDO FILA GLOBAL: ${reason}`);

    // Salvar estado de pausa
    await this.configRepository.upsert({ key: 'queue_paused', value: 'true' }, ['key']);
    await this.configRepository.upsert({ key: 'queue_paused_reason', value: reason }, ['key']);

    // Mudar todos itens PENDING e PROCESSING para PAUSED
    await this.queueRepository.update(
      { status: In([AnalysisStatus.PENDING, AnalysisStatus.PROCESSING]) },
      { status: AnalysisStatus.PAUSED },
    );

    const pausedCount = await this.queueRepository.count({
      where: { status: AnalysisStatus.PAUSED },
    });

    this.logger.warn(`⏸️ Fila pausada: ${pausedCount} itens afetados`);
  }

  /**
   * Retoma a fila após correção do problema
   */
  async resumeQueue(): Promise<{ resumed: number; message: string }> {
    // Verificar se a conexão com OpenAI está OK
    const connectionTest = await this.openaiService.testConnection();
    if (!connectionTest.success) {
      return {
        resumed: 0,
        message: `Não foi possível retomar: ${connectionTest.message}`,
      };
    }

    // Mudar itens PAUSED de volta para PENDING
    const pausedItems = await this.queueRepository.find({
      where: { status: AnalysisStatus.PAUSED },
    });

    for (const item of pausedItems) {
      item.status = AnalysisStatus.PENDING;
      await this.queueRepository.save(item);

      // Re-enviar para RabbitMQ se conectado
      if (this.rabbitMQService.isConnected()) {
        await this.rabbitMQService.addToQueue({
          laudoId: item.laudoId,
          usuarioId: item.usuarioId,
          priority: 5,
        });
      }
    }

    // Limpar estado de pausa
    await this.configRepository.upsert({ key: 'queue_paused', value: 'false' }, ['key']);
    await this.configRepository.delete({ key: 'queue_paused_reason' });

    // Recalcular posições
    await this.recalculatePositions();

    this.logger.log(`▶️ Fila retomada: ${pausedItems.length} itens re-enfileirados`);

    return {
      resumed: pausedItems.length,
      message: `Fila retomada com sucesso. ${pausedItems.length} itens re-enfileirados.`,
    };
  }

  /**
   * Verifica se deve pausar o processamento (erro crítico detectado)
   */
  async handleCriticalError(errorMessage: string): Promise<void> {
    await this.pauseQueue(errorMessage);
  }

  /**
   * Auto-classifica o item de uma imagem usando IA (chamado durante processamento da fila).
   * Usa a mesma lógica do classifyWebItem mas sem consumir créditos de classificação,
   * pois está sendo feito como parte da análise de descrição (que já consumiu crédito de imagem).
   */
  private async autoClassifyItem(
    imagem: ImagemLaudo,
    tipoAmbiente: string,
  ): Promise<string | null> {
    // 1. Encontrar o ambiente base
    const tipoAmbienteNormalizado = normalizeForMatch(tipoAmbiente);
    const ambientes = await this.ambienteRepository.find();
    let ambiente = ambientes.find((a) => textMatches(a.nome, tipoAmbiente));

    if (!ambiente) {
      ambiente = ambientes.find((a) => {
        const nomeNorm = normalizeForMatch(a.nome);
        return (
          nomeNorm.includes(tipoAmbienteNormalizado) || tipoAmbienteNormalizado.includes(nomeNorm)
        );
      });
    }

    if (!ambiente) {
      this.logger.warn(`[AUTO-CLASSIFY] Ambiente "${tipoAmbiente}" não encontrado`);
      return null;
    }

    // 2. Buscar itens pai ativos
    const ambientesPai = ambiente.grupoId
      ? await this.ambienteRepository.find({ where: { grupoId: ambiente.grupoId } })
      : [ambiente];
    const ambienteIds = ambientesPai.map((a) => a.id);

    const itensBrutos = await this.itemRepository
      .createQueryBuilder('item')
      .where('item.ambienteId IN (:...ambienteIds)', { ambienteIds })
      .andWhere('item.ativo = :ativo', { ativo: true })
      .andWhere('item.parentId IS NULL')
      .getMany();

    // Deduplicar por nome
    const itensPorNome = new Map<string, ItemAmbiente>();
    for (const item of itensBrutos) {
      const chave = normalizeForMatch(item.nome);
      itensPorNome.set(chave, item);
    }

    const itemsPaiAtivos = Array.from(itensPorNome.values());
    if (itemsPaiAtivos.length === 0) {
      this.logger.warn(`[AUTO-CLASSIFY] Sem itens cadastrados no ambiente "${tipoAmbiente}"`);
      return null;
    }

    // 3. Gerar URL assinada para a imagem
    const imageUrl = await this.uploadsService.getSignedUrlForAi(imagem.s3Key);

    // 4. Montar prompt de identificação
    const itemsListString = itemsPaiAtivos.map((i) => `- ${i.nome}`).join('\n');
    const identifyPrompt = `Analise esta imagem em um(a) ${tipoAmbiente}.
Abaixo está uma lista **estrita** de opções possíveis de Itens.
Responda APENAS com o NOME EXATO de uma das opções abaixo que melhor descreve o objeto em destaque na foto.
Se a imagem for de uma pessoa, documento, ou não pertencer a nenhuma das opções, responda apenas "Nao identificado".

OPÇÕES:
${itemsListString}`;

    this.logger.debug(
      `[AUTO-CLASSIFY] Prompt para imagem ${imagem.id}: ${identifyPrompt.substring(0, 200)}...`,
    );

    // 5. Chamar OpenAI
    const aiResult = await this.openaiService.analyzeImage(imageUrl, identifyPrompt);

    if (!aiResult.success || !aiResult.content) {
      this.logger.warn(`[AUTO-CLASSIFY] Falha na análise IA para imagem ${imagem.id}`);
      return null;
    }

    // 6. Match do resultado com os itens disponíveis
    const identificacaoPai = this.openaiService.identifyChildItem(
      aiResult.content,
      itemsPaiAtivos.map((i) => i.nome),
    );

    this.logger.log(
      `[AUTO-CLASSIFY] Resultado para ${imagem.id}: "${aiResult.content}" → Matched: "${identificacaoPai || 'Nenhum'}"`,
    );

    return identificacaoPai || null;
  }
}
