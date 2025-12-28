import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LaudosService } from './laudos.service';
import { LaudosController } from './laudos.controller';
import { Laudo } from './entities/laudo.entity';
import { Usuario } from '../users/entities/usuario.entity';
import { LaudoOption } from '../laudo-details/entities/laudo-option.entity';
import { LaudoSection } from '../laudo-details/entities/laudo-section.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Laudo, Usuario, LaudoOption, LaudoSection])],
  controllers: [LaudosController],
  providers: [LaudosService],
  exports: [LaudosService],
})
export class LaudosModule {}
