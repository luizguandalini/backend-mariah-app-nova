import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { ImagemLaudo } from './entities/imagem-laudo.entity';
import { Usuario } from '../users/entities/usuario.entity';
import { Laudo } from '../laudos/entities/laudo.entity';
import { OpenAIModule } from '../openai/openai.module';
import { SystemConfigModule } from '../config/config.module';
import { ItemAmbiente } from '../ambientes/entities/item-ambiente.entity';
import { Ambiente } from '../ambientes/entities/ambiente.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ImagemLaudo, Usuario, Laudo, ItemAmbiente, Ambiente]),
    OpenAIModule,
    SystemConfigModule,
  ],
  controllers: [UploadsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
