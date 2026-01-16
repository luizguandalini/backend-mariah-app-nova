import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PdfService } from './pdf.service';
import { PdfProcessor } from './pdf.processor';
import { Laudo } from '../laudos/entities/laudo.entity';
import { ImagemLaudo } from '../uploads/entities/imagem-laudo.entity';
import { QueueModule } from '../queue/queue.module';
import { UploadsModule } from '../uploads/uploads.module';
import { UsersModule } from '../users/users.module';

import { Ambiente } from '../ambientes/entities/ambiente.entity';
import { LaudoSection } from '../laudo-details/entities/laudo-section.entity';
import { LaudoOption } from '../laudo-details/entities/laudo-option.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Laudo,
      ImagemLaudo,
      Ambiente,
      LaudoSection,
      LaudoOption
    ]),
    QueueModule, // Para acesso ao RabbitMQ e Gateway
    UploadsModule,
    UsersModule,
  ],
  providers: [PdfService, PdfProcessor],
  exports: [PdfService],
})
export class PdfModule {}
