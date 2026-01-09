import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as amqp from 'amqplib';

export interface QueueMessage {
  laudoId: string;
  usuarioId: string;
  priority?: number;
}

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  
  // Configurações da fila
  private readonly QUEUE_NAME = 'laudo_analysis_queue';
  private readonly EXCHANGE_NAME = 'laudo_analysis_exchange';
  private readonly ROUTING_KEY = 'analysis';
  
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
    try {
      this.connection = await amqp.connect(this.RABBITMQ_URL);
      this.channel = await this.connection.createChannel();

      // Configurar exchange do tipo direct
      await this.channel.assertExchange(this.EXCHANGE_NAME, 'direct', {
        durable: true,
      });

      // Configurar fila com controle de prioridade
      await this.channel.assertQueue(this.QUEUE_NAME, {
        durable: true,
        maxPriority: 10, // Suporta prioridades de 0-10
      });

      // Bind da fila ao exchange
      await this.channel.bindQueue(this.QUEUE_NAME, this.EXCHANGE_NAME, this.ROUTING_KEY);

      // Prefetch para controlar rate limit (processa 1 por vez)
      await this.channel.prefetch(1);

      this.logger.log(`✅ Conectado ao RabbitMQ: ${this.RABBITMQ_URL}`);
      
      // Handlers de erro e reconexão
      this.connection.on('error', (err) => {
        this.logger.error('RabbitMQ connection error:', err);
      });

      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed, tentando reconectar...');
        setTimeout(() => this.connect(), 5000);
      });

      return true;
    } catch (error) {
      this.logger.error(`❌ Falha ao conectar ao RabbitMQ: ${error.message}`);
      this.logger.warn('RabbitMQ não disponível - usando fallback para fila local');
      return false;
    }
  }

  /**
   * Desconecta do RabbitMQ
   */
  async disconnect(): Promise<void> {
    try {
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

  /**
   * Verifica se está conectado
   */
  isConnected(): boolean {
    return this.channel !== null && this.connection !== null;
  }

  /**
   * Adiciona uma mensagem à fila
   */
  async addToQueue(message: QueueMessage): Promise<boolean> {
    if (!this.isConnected()) {
      this.logger.warn('RabbitMQ não conectado - não foi possível adicionar à fila');
      return false;
    }

    try {
      const msgBuffer = Buffer.from(JSON.stringify(message));
      
      this.channel!.publish(
        this.EXCHANGE_NAME,
        this.ROUTING_KEY,
        msgBuffer,
        {
          persistent: true, // Mensagem persiste após restart
          priority: message.priority || 5, // Prioridade default = 5
          contentType: 'application/json',
          timestamp: Date.now(),
        }
      );

      this.logger.log(`📨 Laudo ${message.laudoId} adicionado à fila RabbitMQ`);
      return true;
    } catch (error) {
      this.logger.error('Erro ao adicionar à fila RabbitMQ:', error);
      return false;
    }
  }

  /**
   * Consome mensagens da fila
   * @param handler Função que processa cada mensagem
   */
  async consume(handler: (message: QueueMessage) => Promise<void>): Promise<void> {
    if (!this.isConnected()) {
      this.logger.warn('RabbitMQ não conectado - consumo não iniciado');
      return;
    }

    try {
      await this.channel!.consume(
        this.QUEUE_NAME,
        async (msg) => {
          if (!msg) return;

          try {
            const message: QueueMessage = JSON.parse(msg.content.toString());
            this.logger.log(`📥 Processando laudo ${message.laudoId}`);
            
            await handler(message);
            
            // Acknowledge - mensagem processada com sucesso
            this.channel!.ack(msg);
            this.logger.log(`✅ Laudo ${message.laudoId} processado com sucesso`);
          } catch (error) {
            this.logger.error(`❌ Erro ao processar mensagem: ${error.message}`);
            
            // Reject - requeue se for retry, senão move para dead letter
            const requeue = msg.fields.redelivered === false;
            this.channel!.nack(msg, false, requeue);
          }
        },
        { noAck: false } // Acknowledgment manual
      );

      this.logger.log('🔄 Consumer RabbitMQ iniciado');
    } catch (error) {
      this.logger.error('Erro ao iniciar consumer RabbitMQ:', error);
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
      const queueInfo = await this.channel!.checkQueue(this.QUEUE_NAME);
      return queueInfo.messageCount;
    } catch (error) {
      this.logger.error('Erro ao obter tamanho da fila:', error);
      return 0;
    }
  }

  /**
   * Limpa todas as mensagens da fila (cuidado!)
   */
  async purgeQueue(): Promise<number> {
    if (!this.isConnected()) {
      return 0;
    }

    try {
      const result = await this.channel!.purgeQueue(this.QUEUE_NAME);
      this.logger.warn(`Fila limpa: ${result.messageCount} mensagens removidas`);
      return result.messageCount;
    } catch (error) {
      this.logger.error('Erro ao limpar fila:', error);
      return 0;
    }
  }
}
