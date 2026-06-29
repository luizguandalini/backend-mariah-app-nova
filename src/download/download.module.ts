import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DownloadController } from './download.controller';
import { DownloadService } from './download.service';
import { DownloadProcessor } from './download.processor';
import { DownloadGateway } from './download.gateway';
import { DownloadJob } from './entities/download-job.entity';
import { Laudo } from '../laudos/entities/laudo.entity';
import { ImagemLaudo } from '../uploads/entities/imagem-laudo.entity';
import { QueueModule } from '../queue/queue.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DownloadJob, Laudo, ImagemLaudo]),
    QueueModule, // RabbitMQService
    UploadsModule, // UploadsService (otimização, S3, presigned URLs)
  ],
  controllers: [DownloadController],
  providers: [DownloadService, DownloadProcessor, DownloadGateway],
  exports: [DownloadService],
})
export class DownloadModule {}
