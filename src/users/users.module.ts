import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { Usuario } from './entities/usuario.entity';
import { ConfiguracaoPdfUsuario } from './entities/configuracao-pdf-usuario.entity';
import { Laudo } from '../laudos/entities/laudo.entity';
import { ImagemLaudo } from '../uploads/entities/imagem-laudo.entity';
import { AnalysisQueue } from '../queue/entities/analysis-queue.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { WebLoginTicket } from '../auth/entities/web-login-ticket.entity';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Usuario,
      ConfiguracaoPdfUsuario,
      Laudo,
      ImagemLaudo,
      AnalysisQueue,
      RefreshToken,
      WebLoginTicket,
    ]),
    UploadsModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
