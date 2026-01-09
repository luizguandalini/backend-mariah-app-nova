import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan, IsNull, Not } from 'typeorm';
import { AnalysisQueue, AnalysisStatus } from './entities/analysis-queue.entity';
import { ImagemLaudo } from '../uploads/entities/imagem-laudo.entity';
import { Laudo } from '../laudos/entities/laudo.entity';
import { OpenAIService } from '../openai/openai.service';
import { Ambiente } from '../ambientes/entities/ambiente.entity';
import { ItemAmbiente } from '../ambientes/entities/item-ambiente.entity';
import {
  normalizeForMatch,
  textMatches,
} from '../common/utils/text-normalizer.util';
import { RabbitMQService, QueueMessage } from './rabbitmq.service';
import { UploadsService } from '../uploads/uploads.service';
import { SystemConfig } from '../config/entities/system-config.entity';
import { In } from 'typeorm';
import { QueueGateway } from './queue.gateway';

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
  ) {}

  async onModuleInit() {
    // Recalcular posições ao iniciar
    await this.recalculatePositions();

    // Se RabbitMQ está conectado, usar consumer. Senão, fallback para polling
    if (this.rabbitMQService.isConnected()) {
      // Iniciar consumer RabbitMQ
      await this.rabbitMQService.consume(async (message: QueueMessage) => {
        await this.processLaudo(message.laudoId);
      });
      this.logger.log('Queue Service inicializado com RabbitMQ consumer');
    } else {
      // Fallback: polling a cada 30 segundos
      this.logger.warn('RabbitMQ não disponível - usando fallback de polling');
      this.processingInterval = setInterval(() => {
        this.processNextInQueue();
      }, 30000);
      this.logger.log('Queue Service inicializado (fallback: polling a cada 30s)');
    }
  }

  /**
   * Adiciona um laudo à fila de análise
   */
  async addToQueue(laudoId: string, userId: string): Promise<AnalysisQueue> {
    // Verificar se já está na fila
    const existing = await this.queueRepository.findOne({
      where: { laudoId },
    });

    if (existing) {
      if (existing.status === AnalysisStatus.PROCESSING) {
        throw new BadRequestException('Este laudo já está sendo analisado');
      }
      if (existing.status === AnalysisStatus.PENDING) {
        throw new BadRequestException('Este laudo já está na fila');
      }
      // Se já foi completado ou deu erro, remover para re-adicionar
      await this.queueRepository.remove(existing);
    }

    // Verificar se OpenAI está configurada
    if (!this.openaiService.isConfigured()) {
      throw new BadRequestException('Análise por IA não está configurada. Contate o administrador.');
    }

    // Contar imagens não analisadas do laudo
    const totalImages = await this.imagemRepository.count({
      where: {
        laudoId,
        imagemJaFoiAnalisadaPelaIa: 'nao',
      },
    });

    if (totalImages === 0) {
      // Auto- correção: Se não tem imagens pendentes, marca como concluído
      await this.laudoRepository.update(laudoId, { status: AnalysisStatus.COMPLETED as any }); // Cast necessário pois o enum pode ser diferente no LaudoEntity vs QueueEntity, mas os strings batem
      throw new BadRequestException('Laudo já possui todas as imagens analisadas');
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
    this.logger.log(`Laudo ${laudoId} adicionado à fila na posição ${nextPosition}`);

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
      progressPercentage: item.totalImages > 0 
        ? Math.round((item.processedImages / item.totalImages) * 100) 
        : 0,
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
      progressPercentage: item.totalImages > 0 
        ? Math.round((item.processedImages / item.totalImages) * 100) 
        : 0,
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

    // Processar todas as imagens do laudo
    queueItem.status = AnalysisStatus.PROCESSING;
    queueItem.startedAt = new Date();
    await this.queueRepository.save(queueItem);
    
    this.queueGateway.notifyStatusChange(laudoId, AnalysisStatus.PROCESSING);

    try {
      while (true) {
        // Buscar próxima imagem não analisada
        const nextImage = await this.imagemRepository.findOne({
          where: {
            laudoId,
            imagemJaFoiAnalisadaPelaIa: 'nao',
          },
          order: { ordem: 'ASC' },
        });

        if (!nextImage) {
          // Laudo concluído
          queueItem.status = AnalysisStatus.COMPLETED;
          queueItem.completedAt = new Date();
          queueItem.position = null;
          await this.queueRepository.save(queueItem);
          await this.recalculatePositions();
          this.logger.log(`Laudo ${laudoId} análise concluída!`);
          this.queueGateway.notifyStatusChange(laudoId, AnalysisStatus.COMPLETED);
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
        queueItem.currentImageId = nextImage.id;
        await this.queueRepository.save(queueItem);

        // Processar imagem
        await this.processImage(nextImage, queueItem);

        // Atualizar progresso
        queueItem.processedImages += 1;
        await this.queueRepository.save(queueItem);
        
        // Notify progress
        const percentage = Math.round((queueItem.processedImages / queueItem.totalImages) * 100);
        this.queueGateway.notifyProgress(laudoId, {
            laudoId,
            processedImages: queueItem.processedImages,
            totalImages: queueItem.totalImages,
            percentage,
        });
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
        this.queueGateway.notifyStatusChange(currentItem.laudoId, AnalysisStatus.PROCESSING);
      }

      // Buscar próxima imagem não analisada
      const nextImage = await this.imagemRepository.findOne({
        where: {
          laudoId: currentItem.laudoId,
          imagemJaFoiAnalisadaPelaIa: 'nao',
        },
        order: { ordem: 'ASC' },
      });

      if (!nextImage) {
        // Laudo concluído
        currentItem.status = AnalysisStatus.COMPLETED;
        currentItem.completedAt = new Date();
        currentItem.position = null;
        await this.queueRepository.save(currentItem);
        await this.recalculatePositions();
        await this.recalculatePositions();
        this.logger.log(`Laudo ${currentItem.laudoId} análise concluída!`);
        this.queueGateway.notifyStatusChange(currentItem.laudoId, AnalysisStatus.COMPLETED);
        this.isProcessing = false;
        return;
      }

      // Atualizar imagem atual
      currentItem.currentImageId = nextImage.id;
      await this.queueRepository.save(currentItem);

      // Processar imagem
      await this.processImage(nextImage, currentItem);

      // Atualizar progresso
       currentItem.processedImages += 1;
       await this.queueRepository.save(currentItem);
       
       const percentage = Math.round((currentItem.processedImages / currentItem.totalImages) * 100);
       this.queueGateway.notifyProgress(currentItem.laudoId, {
           laudoId: currentItem.laudoId,
           processedImages: currentItem.processedImages,
           totalImages: currentItem.totalImages,
           percentage,
       });

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

  /**
   * Processa uma imagem individual
   */
  private async processImage(
    imagem: ImagemLaudo,
    queueItem: AnalysisQueue,
  ): Promise<void> {
    // Verificar se foi cancelado
    const currentStatus = await this.queueRepository.findOne({
      where: { id: queueItem.id },
    });
    if (currentStatus?.status === AnalysisStatus.CANCELLED) {
      throw new Error('Análise cancelada pelo usuário');
    }

    // Buscar prompt baseado no tipo e tipo_ambiente
    const tipoAmbiente = imagem.tipoAmbiente;
    const tipoItem = imagem.tipo;

    if (!tipoAmbiente || !tipoItem) {
      // Sem tipo definido - marcar como analisado sem legenda útil
      imagem.legenda = 'Tipo não identificado';
      imagem.imagemJaFoiAnalisadaPelaIa = 'sim';
      await this.imagemRepository.save(imagem);
      return;
    }

    // Buscar ambiente pelo nome (normalizado)
    const ambientes = await this.ambienteRepository.find();
    const ambiente = ambientes.find((a) => textMatches(a.nome, tipoAmbiente));

    if (!ambiente) {
      imagem.legenda = `Ambiente "${tipoAmbiente}" não encontrado`;
      imagem.imagemJaFoiAnalisadaPelaIa = 'sim';
      await this.imagemRepository.save(imagem);
      return;
    }

    // Buscar item pelo nome (normalizado)
    const itens = await this.itemRepository.find({
      where: { ambienteId: ambiente.id },
      relations: ['filhos'],
    });
    const item = itens.find((i) => textMatches(i.nome, tipoItem));

    if (!item) {
      imagem.legenda = `Item "${tipoItem}" não encontrado`;
      imagem.imagemJaFoiAnalisadaPelaIa = 'sim';
      await this.imagemRepository.save(imagem);
      return;
    }

    // Gerar URL da imagem (pré-assinada)
    const imageUrl = await this.uploadsService.getSignedUrlForAi(imagem.s3Key);

    // Verificar se item tem filhos (precisa de análise em duas etapas)
    if (item.filhos && item.filhos.length > 0) {
      // Primeira etapa: identificar qual sub-item é
      const identifyResult = await this.openaiService.analyzeImage(
        imageUrl,
        item.prompt,
      );

      if (!identifyResult.success) {
        // Verificar se é erro crítico que deve pausar a fila
        if (identifyResult.criticalError) {
          const errorMsg = identifyResult.error?.message || 'Erro crítico da OpenAI';
          await this.handleCriticalError(`${identifyResult.error?.status}: ${errorMsg}`);
          throw new Error(`Erro crítico: ${errorMsg}`);
        }
        imagem.legenda = 'Erro ao analisar imagem';
        imagem.imagemJaFoiAnalisadaPelaIa = 'sim';
        await this.imagemRepository.save(imagem);
        return;
      }

      // Tentar identificar qual filho corresponde
      const childNames = item.filhos.map((f) => f.nome);
      const matchedChild = this.openaiService.identifyChildItem(
        identifyResult.content,
        childNames,
      );

      if (!matchedChild) {
        // Não conseguiu identificar - usar resposta como referência
        imagem.legenda = 'Não identificado';
        imagem.imagemJaFoiAnalisadaPelaIa = 'sim';
        await this.imagemRepository.save(imagem);
        return;
      }

      // Buscar prompt do filho
      const childItem = item.filhos.find((f) => textMatches(f.nome, matchedChild));
      if (!childItem) {
        imagem.legenda = 'Não identificado';
        imagem.imagemJaFoiAnalisadaPelaIa = 'sim';
        await this.imagemRepository.save(imagem);
        return;
      }

      // Segunda etapa: análise com prompt do filho
      const finalResult = await this.openaiService.analyzeImage(
        imageUrl,
        childItem.prompt,
      );

      if (finalResult.success) {
        imagem.legenda = finalResult.content.substring(0, 200); // Limitar a 200 chars
        imagem.imagemJaFoiAnalisadaPelaIa = 'sim';
      } else {
        // Verificar se é erro crítico que deve pausar a fila
        if (finalResult.criticalError) {
          const errorMsg = finalResult.error?.message || 'Erro crítico da OpenAI';
          await this.handleCriticalError(`${finalResult.error?.status}: ${errorMsg}`);
          throw new Error(`Erro crítico: ${errorMsg}`);
        }
        imagem.legenda = 'Erro na análise';
        imagem.imagemJaFoiAnalisadaPelaIa = 'sim';
      }
    } else {
      // Item sem filhos - análise direta
      const result = await this.openaiService.analyzeImage(imageUrl, item.prompt);

      if (result.success) {
        imagem.legenda = result.content.substring(0, 200);
        imagem.imagemJaFoiAnalisadaPelaIa = 'sim';
      } else {
        // Verificar se é erro crítico que deve pausar a fila
        if (result.criticalError) {
          const errorMsg = result.error?.message || 'Erro crítico da OpenAI';
          await this.handleCriticalError(`${result.error?.status}: ${errorMsg}`);
          throw new Error(`Erro crítico: ${errorMsg}`);
        }
        imagem.legenda = 'Erro na análise';
        imagem.imagemJaFoiAnalisadaPelaIa = 'sim';
      }
    }

    await this.imagemRepository.save(imagem);
    this.logger.debug(`Imagem ${imagem.id} analisada: ${imagem.legenda}`);
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
    await this.configRepository.upsert(
      { key: 'queue_paused', value: 'true' },
      ['key'],
    );
    await this.configRepository.upsert(
      { key: 'queue_paused_reason', value: reason },
      ['key'],
    );

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
    await this.configRepository.upsert(
      { key: 'queue_paused', value: 'false' },
      ['key'],
    );
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
}

