import { Module } from '@nestjs/common';
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
  ],
  controllers: [QueueController],
  providers: [QueueService, RabbitMQService],
  exports: [QueueService, RabbitMQService],
})
export class QueueModule {}

