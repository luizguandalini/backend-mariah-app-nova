import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LaudosService } from './laudos.service';
import { LaudosController } from './laudos.controller';
import { Laudo } from './entities/laudo.entity';
import { Usuario } from '../users/entities/usuario.entity';
import { LaudoOption } from '../laudo-details/entities/laudo-option.entity';
import { LaudoSection } from '../laudo-details/entities/laudo-section.entity';
import { ImagemLaudo } from '../uploads/entities/imagem-laudo.entity';
import { UploadsModule } from '../uploads/uploads.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Laudo, Usuario, LaudoOption, LaudoSection, ImagemLaudo]),
    UploadsModule,
    forwardRef(() => QueueModule),
  ],
  controllers: [LaudosController],
  providers: [LaudosService],
  exports: [LaudosService],
})
export class LaudosModule {}
