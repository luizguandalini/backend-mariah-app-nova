import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';
import { AnalysisQueue } from './entities/analysis-queue.entity';
import { ImagemLaudo } from '../uploads/entities/imagem-laudo.entity';
import { Laudo } from '../laudos/entities/laudo.entity';
import { Ambiente } from '../ambientes/entities/ambiente.entity';
import { ItemAmbiente } from '../ambientes/entities/item-ambiente.entity';
import { SystemConfig } from '../config/entities/system-config.entity';
import { OpenAIModule } from '../openai/openai.module';
import { RabbitMQService } from './rabbitmq.service';
import { UploadsModule } from '../uploads/uploads.module';
import { QueueGateway } from './queue.gateway';
import { LaudosModule } from '../laudos/laudos.module';
import { SystemConfigModule } from '../config/config.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AnalysisQueue,
      ImagemLaudo,
      Laudo,
      Ambiente,
      ItemAmbiente,
      SystemConfig,
    ]),
    OpenAIModule,
    UploadsModule,
    forwardRef(() => LaudosModule),
    SystemConfigModule,
    NotificationsModule,
  ],
  controllers: [QueueController],
  providers: [QueueService, RabbitMQService, QueueGateway],
  exports: [QueueService, RabbitMQService, QueueGateway],
})
export class QueueModule {}

