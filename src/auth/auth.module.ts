import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { Usuario } from '../users/entities/usuario.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { WebLoginTicket } from './entities/web-login-ticket.entity';
import { Laudo } from '../laudos/entities/laudo.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Usuario, RefreshToken, WebLoginTicket, Laudo]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET') || 'secret-key-change-this',
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}

