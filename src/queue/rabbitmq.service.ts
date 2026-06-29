import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as amqp from 'amqplib';

export interface QueueMessage {
  laudoId: string;
  usuarioId: string;
  priority?: number;
  modoPreviewPdf?: 'detalhado' | 'compacto';
  // Overrides de layout vindos do preview (px). Quando presentes, o PDF é
  // gerado com os mesmos valores exibidos no preview, garantindo que o
  // tamanho das imagens seja idêntico.
  margemPagina?: number;
  espacamentoHorizontal?: number;
  espacamentoVertical?: number;
}

/**
 * Mensagem da fila de DOWNLOAD (geração assíncrona de ZIP).
 * `jobId` referencia o registro em `download_jobs`; `ambiente` é
 * preenchido apenas quando `tipo = 'ambiente'`.
 */
export interface DownloadQueueMessage {
  jobId: string;
  laudoId: string;
  usuarioId: string;
  tipo: 'ambiente' | 'laudo';
  ambiente?: string;
  priority?: number;
}

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;
  
  // Callbacks para notificar quando conectar
  private onConnectCallbacks: Array<() => void> = [];
  
  // Configurações da fila de Análise
  private readonly ANALYSIS_QUEUE_NAME = 'laudo_analysis_queue';
  private readonly ANALYSIS_EXCHANGE_NAME = 'laudo_analysis_exchange';
  private readonly ANALYSIS_ROUTING_KEY = 'analysis';

  // Configurações da fila de PDF
  private readonly PDF_QUEUE_NAME = 'laudo_pdf_queue';
  private readonly PDF_EXCHANGE_NAME = 'laudo_pdf_exchange';
  private readonly PDF_ROUTING_KEY = 'pdf_generation';

  // Configurações da fila de DOWNLOAD (ZIP de fotos)
  private readonly DOWNLOAD_QUEUE_NAME = 'laudo_download_queue';
  private readonly DOWNLOAD_EXCHANGE_NAME = 'laudo_download_exchange';
  private readonly DOWNLOAD_ROUTING_KEY = 'download_zip';
  
  // URL de conexão (pode ser sobrescrita por variável de ambiente)
  private readonly RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  /**
   * Conecta ao RabbitMQ
   */
  async connect(): Promise<boolean> {
    if (this.isConnecting) {
      return false;
    }

    this.isConnecting = true;

    try {
      this.connection = await amqp.connect(this.RABBITMQ_URL);
      this.channel = await this.connection.createChannel();

      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      // === SETUP FILA DE ANÁLISE ===
      await this.channel.assertExchange(this.ANALYSIS_EXCHANGE_NAME, 'direct', {
        durable: true,
      });

      await this.channel.assertQueue(this.ANALYSIS_QUEUE_NAME, {
        durable: true,
        maxPriority: 10,
      });

      await this.channel.bindQueue(this.ANALYSIS_QUEUE_NAME, this.ANALYSIS_EXCHANGE_NAME, this.ANALYSIS_ROUTING_KEY);

      // === SETUP FILA DE PDF ===
      await this.channel.assertExchange(this.PDF_EXCHANGE_NAME, 'direct', {
        durable: true,
      });

      await this.channel.assertQueue(this.PDF_QUEUE_NAME, {
        durable: true,
        maxPriority: 5, // Prioridade menor que análise, talvez? Ou igual.
      });

      await this.channel.bindQueue(this.PDF_QUEUE_NAME, this.PDF_EXCHANGE_NAME, this.PDF_ROUTING_KEY);

      // === SETUP FILA DE DOWNLOAD ===
      await this.channel.assertExchange(this.DOWNLOAD_EXCHANGE_NAME, 'direct', {
        durable: true,
      });

      await this.channel.assertQueue(this.DOWNLOAD_QUEUE_NAME, {
        durable: true,
        maxPriority: 5,
      });

      await this.channel.bindQueue(
        this.DOWNLOAD_QUEUE_NAME,
        this.DOWNLOAD_EXCHANGE_NAME,
        this.DOWNLOAD_ROUTING_KEY,
      );

      // Prefetch global (ajustar conforme necessidade, pdf/zip são pesados, 1 é ideal)
      await this.channel.prefetch(1);

      this.logger.log(`✅ Conectado ao RabbitMQ: ${this.RABBITMQ_URL}`);
      
      // Notificar callbacks de conexão
      this.onConnectCallbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          this.logger.error('Erro ao executar callback de conexão:', error);
        }
      });
      
      // Handlers de erro e reconexão
      this.connection.on('error', (err) => {
        this.logger.error('RabbitMQ connection error:', err);
      });

      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed, tentando reconectar...');
        this.connection = null;
        this.channel = null;
        this.scheduleReconnect();
      });

      return true;
    } catch (error) {
      this.logger.error(`❌ Falha ao conectar ao RabbitMQ: ${error.message}`);
      this.logger.warn('RabbitMQ não disponível - nova tentativa em 5 segundos');
      this.connection = null;
      this.channel = null;
      this.scheduleReconnect();
      return false;
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Desconecta do RabbitMQ
   */
  async disconnect(): Promise<void> {
    try {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.logger.log('Desconectado do RabbitMQ');
    } catch (error) {
      this.logger.error('Erro ao desconectar do RabbitMQ:', error);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  /**
   * Verifica se está conectado
   */
  isConnected(): boolean {
    return this.channel !== null && this.connection !== null;
  }

  /**
   * Registra callback para ser chamado quando conectar
   */
  onConnect(callback: () => void): void {
    this.onConnectCallbacks.push(callback);
    // Se já está conectado, executar imediatamente
    if (this.isConnected()) {
      callback();
    }
  }

  /**
   * Adiciona uma mensagem à fila de ANÁLISE
   */
  async addToQueue(message: QueueMessage): Promise<boolean> {
    if (!this.isConnected()) {
      this.logger.warn('RabbitMQ não conectado - não foi possível adicionar à fila');
      return false;
    }

    try {
      const msgBuffer = Buffer.from(JSON.stringify(message));
      
      this.channel!.publish(
        this.ANALYSIS_EXCHANGE_NAME,
        this.ANALYSIS_ROUTING_KEY,
        msgBuffer,
        {
          persistent: true,
          priority: message.priority || 5,
          contentType: 'application/json',
          timestamp: Date.now(),
        }
      );

      this.logger.log(`📨 Laudo ${message.laudoId} adicionado à fila RabbitMQ (Análise)`);
      return true;
    } catch (error) {
      this.logger.error('Erro ao adicionar à fila RabbitMQ:', error);
      return false;
    }
  }

  /**
   * Adiciona uma mensagem à fila de PDF
   */
  async addToPdfQueue(message: QueueMessage): Promise<boolean> {
    if (!this.isConnected()) {
      this.logger.warn('RabbitMQ não conectado - não foi possível adicionar à fila de PDF');
      return false;
    }

    try {
      const msgBuffer = Buffer.from(JSON.stringify(message));
      
      this.channel!.publish(
        this.PDF_EXCHANGE_NAME,
        this.PDF_ROUTING_KEY,
        msgBuffer,
        {
          persistent: true,
          priority: message.priority || 5,
          contentType: 'application/json',
          timestamp: Date.now(),
        }
      );

      this.logger.log(`📄 Laudo ${message.laudoId} adicionado à fila RabbitMQ (PDF)`);
      return true;
    } catch (error) {
      this.logger.error('Erro ao adicionar à fila de PDF RabbitMQ:', error);
      return false;
    }
  }

  /**
   * Consome mensagens da fila de ANÁLISE
   * @param handler Função que processa cada mensagem
   */
  async consume(handler: (message: QueueMessage) => Promise<void>): Promise<void> {
    if (!this.isConnected()) {
      this.logger.warn('RabbitMQ não conectado - consumo não iniciado');
      return;
    }

    try {
      await this.channel!.consume(
        this.ANALYSIS_QUEUE_NAME,
        async (msg) => {
          if (!msg) return;

          try {
            const message: QueueMessage = JSON.parse(msg.content.toString());
            this.logger.log(`📥 Processando laudo ${message.laudoId} (Análise)`);
            
            await handler(message);
            
            this.channel!.ack(msg);
            this.logger.log(`✅ Laudo ${message.laudoId} processado com sucesso (Análise)`);
          } catch (error) {
            this.logger.error(`❌ Erro ao processar mensagem (Análise): ${error.message}`);
            const requeue = msg.fields.redelivered === false;
            this.channel!.nack(msg, false, requeue);
          }
        },
        { noAck: false }
      );

      this.logger.log('🔄 Consumer RabbitMQ iniciado (Análise)');
    } catch (error) {
      this.logger.error('Erro ao iniciar consumer RabbitMQ:', error);
    }
  }

  /**
   * Consome mensagens da fila de PDF
   * @param handler Função que processa cada mensagem
   */
  async consumePdf(handler: (message: QueueMessage) => Promise<void>): Promise<void> {
    if (!this.isConnected()) {
      this.logger.warn('RabbitMQ não conectado - consumo de PDF não iniciado');
      return;
    }

    try {
      await this.channel!.consume(
        this.PDF_QUEUE_NAME,
        async (msg) => {
          if (!msg) return;

          try {
            const message: QueueMessage = JSON.parse(msg.content.toString());
            this.logger.log(`📥 Gerando PDF para laudo ${message.laudoId}`);
            
            await handler(message);
            
            this.channel!.ack(msg);
            this.logger.log(`✅ PDF do laudo ${message.laudoId} gerado com sucesso`);
          } catch (error) {
            this.logger.error(`❌ Erro ao gerar PDF: ${error.message}`);
            // Para PDF, talvez não queiramos retry infinito se for erro de código/dados
            // Mas se for timeout, queremos. Puppeteer pode dar timeout.
            // Vamos manter a lógica: 1 retry.
            const requeue = msg.fields.redelivered === false;
            this.channel!.nack(msg, false, requeue);
          }
        },
        { noAck: false }
      );

      this.logger.log('🔄 Consumer RabbitMQ iniciado (PDF)');
    } catch (error) {
      this.logger.error('Erro ao iniciar consumer PDF RabbitMQ:', error);
    }
  }

  /**
   * Adiciona uma mensagem à fila de DOWNLOAD (geração de ZIP)
   */
  async addToDownloadQueue(message: DownloadQueueMessage): Promise<boolean> {
    if (!this.isConnected()) {
      this.logger.warn('RabbitMQ não conectado - não foi possível adicionar à fila de Download');
      return false;
    }

    try {
      const msgBuffer = Buffer.from(JSON.stringify(message));

      this.channel!.publish(
        this.DOWNLOAD_EXCHANGE_NAME,
        this.DOWNLOAD_ROUTING_KEY,
        msgBuffer,
        {
          persistent: true,
          priority: message.priority || 5,
          contentType: 'application/json',
          timestamp: Date.now(),
        },
      );

      this.logger.log(
        `📦 Job de download ${message.jobId} (laudo ${message.laudoId}) adicionado à fila RabbitMQ (Download)`,
      );
      return true;
    } catch (error) {
      this.logger.error('Erro ao adicionar à fila de Download RabbitMQ:', error);
      return false;
    }
  }

  /**
   * Consome mensagens da fila de DOWNLOAD
   * @param handler Função que processa cada mensagem
   */
  async consumeDownload(handler: (message: DownloadQueueMessage) => Promise<void>): Promise<void> {
    if (!this.isConnected()) {
      this.logger.warn('RabbitMQ não conectado - consumo de Download não iniciado');
      return;
    }

    try {
      await this.channel!.consume(
        this.DOWNLOAD_QUEUE_NAME,
        async (msg) => {
          if (!msg) return;

          try {
            const message: DownloadQueueMessage = JSON.parse(msg.content.toString());
            this.logger.log(`📥 Gerando ZIP para job ${message.jobId} (laudo ${message.laudoId})`);

            await handler(message);

            this.channel!.ack(msg);
            this.logger.log(`✅ ZIP do job ${message.jobId} gerado com sucesso`);
          } catch (error) {
            this.logger.error(`❌ Erro ao gerar ZIP: ${error.message}`);
            // Não reenfileirar indefinidamente: 1 retry (igual à fila de PDF).
            const requeue = msg.fields.redelivered === false;
            this.channel!.nack(msg, false, requeue);
          }
        },
        { noAck: false },
      );

      this.logger.log('🔄 Consumer RabbitMQ iniciado (Download)');
    } catch (error) {
      this.logger.error('Erro ao iniciar consumer Download RabbitMQ:', error);
    }
  }

  /**
   * Retorna contagem de mensagens na fila
   */
  async getQueueLength(): Promise<number> {
    if (!this.isConnected()) {
      return 0;
    }

    try {
      // Retorna soma das duas filas? Ou só análise?
      // Mantendo compatibilidade, retorna da fila de análise.
      // Se precisar da de PDF, criamos outro método.
      const queueInfo = await this.channel!.checkQueue(this.ANALYSIS_QUEUE_NAME);
      return queueInfo.messageCount;
    } catch (error) {
      this.logger.error('Erro ao obter tamanho da fila:', error);
      return 0;
    }
  }

  /**
   * Limpa todas as mensagens da fila de ANÁLISE
   */
  async purgeQueue(): Promise<number> {
    if (!this.isConnected()) {
      return 0;
    }

    try {
      const result = await this.channel!.purgeQueue(this.ANALYSIS_QUEUE_NAME);
      this.logger.warn(`Fila de análise limpa: ${result.messageCount} mensagens removidas`);
      return result.messageCount;
    } catch (error) {
      this.logger.error('Erro ao limpar fila:', error);
      return 0;
    }
  }
}
