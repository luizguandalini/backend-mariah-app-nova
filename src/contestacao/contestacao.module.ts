import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ContestacaoService } from './contestacao.service';
import { ContestacaoController } from './contestacao.controller';
import { ContestacaoImagem } from './entities/contestacao-imagem.entity';
import { Laudo } from '../laudos/entities/laudo.entity';
import { Usuario } from '../users/entities/usuario.entity';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ContestacaoImagem, Laudo, Usuario]),
    UploadsModule,
  ],
  controllers: [ContestacaoController],
  providers: [ContestacaoService],
  exports: [ContestacaoService],
})
export class ContestacaoModule {}