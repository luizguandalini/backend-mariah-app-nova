import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LaudoDetailsController } from './laudo-details.controller';
import { LaudoDetailsService } from './laudo-details.service';
import { LaudoSection } from './entities/laudo-section.entity';
import { LaudoQuestion } from './entities/laudo-question.entity';
import { LaudoOption } from './entities/laudo-option.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LaudoSection, LaudoQuestion, LaudoOption])],
  controllers: [LaudoDetailsController],
  providers: [LaudoDetailsService],
  exports: [LaudoDetailsService],
})
export class LaudoDetailsModule {}
