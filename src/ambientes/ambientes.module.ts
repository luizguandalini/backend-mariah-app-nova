import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AmbientesService } from './ambientes.service';
import { AmbientesController } from './ambientes.controller';
import { ItensAmbienteService } from './itens-ambiente.service';
import { ItensAmbienteController } from './itens-ambiente.controller';
import { Ambiente } from './entities/ambiente.entity';
import { ItemAmbiente } from './entities/item-ambiente.entity';
import { SystemConfigModule } from '../config/config.module';

@Module({
  imports: [TypeOrmModule.forFeature([Ambiente, ItemAmbiente]), SystemConfigModule],
  controllers: [AmbientesController, ItensAmbienteController],
  providers: [AmbientesService, ItensAmbienteService],
  exports: [AmbientesService, ItensAmbienteService],
})
export class AmbientesModule {}
