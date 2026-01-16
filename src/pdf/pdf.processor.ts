import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { RabbitMQService, QueueMessage } from '../queue/rabbitmq.service';
import { PdfService } from './pdf.service';

@Injectable()
export class PdfProcessor implements OnModuleInit {
  private readonly logger = new Logger(PdfProcessor.name);

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly pdfService: PdfService,
  ) {}

  onModuleInit() {
    this.rabbitMQService.onConnect(async () => {
      try {
        await this.rabbitMQService.consumePdf(async (message: QueueMessage) => {
          this.logger.log(`📄 Recebido pedido de PDF para laudo ${message.laudoId}`);
          await this.pdfService.generateInternal(message.laudoId, message.usuarioId);
        });
        this.logger.log('✅ PdfProcessor ouvindo fila de PDFs');
      } catch (error) {
        this.logger.error('Erro ao iniciar consumo de fila de PDF', error);
      }
    });
  }
}
