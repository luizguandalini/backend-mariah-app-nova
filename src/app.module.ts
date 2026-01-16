import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PlanosModule } from './planos/planos.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AmbientesModule } from './ambientes/ambientes.module';
import { LaudosModule } from './laudos/laudos.module';
import { LaudoDetailsModule } from './laudo-details/laudo-details.module';
import { UploadsModule } from './uploads/uploads.module';
import { OpenAIModule } from './openai/openai.module';
import { QueueModule } from './queue/queue.module';
import { PdfModule } from './pdf/pdf.module';
import { SystemConfigModule } from './config/config.module';
import { DatabaseSeedService } from './database/database-seed.service';
import { Usuario } from './users/entities/usuario.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get('NODE_ENV') === 'production';
        const prefix = isProduction ? 'PROD_' : 'DEV_';
        
        // Helper para buscar config com prefixo do ambiente
        const getConfig = (key: string): string => {
          const prefixedValue = configService.get(`${prefix}${key}`);
          if (prefixedValue !== undefined && prefixedValue !== '') {
            return prefixedValue;
          }
          return configService.get(key) || '';
        };

        const dbHost = getConfig('DB_HOST');
        const dbPort = parseInt(getConfig('DB_PORT') || '5432', 10);
        const dbUsername = getConfig('DB_USERNAME');
        const dbPassword = getConfig('DB_PASSWORD');
        const dbDatabase = getConfig('DB_DATABASE');

        // Log da configuração (sem dados sensíveis)
        console.log(`📊 Banco de dados: ${dbHost}:${dbPort} (${isProduction ? 'PRODUÇÃO' : 'DESENVOLVIMENTO'})`);

        return {
          type: 'postgres',
          host: dbHost,
          port: dbPort,
          username: dbUsername,
          password: dbPassword,
          database: dbDatabase,
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          // NUNCA true em produção!
          synchronize: !isProduction,
          // Em prod, só loga erros; em dev, loga tudo
          logging: isProduction ? ['error'] : true,
          ssl: {
            rejectUnauthorized: false,
          },
        };
      },
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Usuario]),
    PlanosModule,
    AuthModule,
    UsersModule,
    AmbientesModule,
    LaudosModule,
    LaudoDetailsModule,
    UploadsModule,
    OpenAIModule,
    QueueModule,
    PdfModule,
    SystemConfigModule,
  ],
  controllers: [AppController],
  providers: [AppService, DatabaseSeedService],
})
export class AppModule {}

