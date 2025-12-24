import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlanosController } from './planos.controller';
import { PlanosService } from './planos.service';
import { BeneficiosController } from './beneficios.controller';
import { BeneficiosService } from './beneficios.service';
import { Plano } from './entities/plano.entity';
import { PlanoBeneficio } from './entities/plano-beneficio.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Plano, PlanoBeneficio])],
  controllers: [PlanosController, BeneficiosController],
  providers: [PlanosService, BeneficiosService],
  exports: [PlanosService, BeneficiosService],
})
export class PlanosModule {}
