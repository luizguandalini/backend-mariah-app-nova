import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { ImagemLaudo } from './entities/imagem-laudo.entity';
import { Usuario } from '../users/entities/usuario.entity';
import { Laudo } from '../laudos/entities/laudo.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ImagemLaudo, Usuario, Laudo]),
  ],
  controllers: [UploadsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
