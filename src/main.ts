import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { SshTunnelService } from './config/ssh-tunnel.service';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  // Em modo development, estabelece o túnel SSH antes de criar a aplicação
  const nodeEnv = process.env.NODE_ENV;
  const sshEnabled = process.env.SSH_ENABLED === 'true';

  if (nodeEnv === 'development' && sshEnabled) {
    console.log('🔐 Modo desenvolvimento detectado - estabelecendo túnel SSH...');

    // Cria uma instância temporária do ConfigService para o SshTunnelService
    const { ConfigModule } = await import('@nestjs/config');
    const tempApp = await NestFactory.createApplicationContext(
      ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    );
    const configService = tempApp.get(ConfigService);
    const sshTunnelService = new SshTunnelService(configService);

    try {
      await sshTunnelService.connect();
      console.log('✅ Túnel SSH estabelecido - prosseguindo com inicialização...');
    } catch (error) {
      console.error('❌ Erro ao estabelecer túnel SSH:', error.message);
      console.error(
        '💡 Verifique se a chave SSH está no local correto e se o servidor EC2 está acessível',
      );
      process.exit(1);
    }

    await tempApp.close();
  }

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  // Habilita CORS baseado no ambiente
  const isProduction = process.env.NODE_ENV === 'production';
  const prefix = isProduction ? 'PROD_' : 'DEV_';
  
  // Busca FRONTEND_URL com prefixo do ambiente
  const frontendUrl = process.env[`${prefix}FRONTEND_URL`] 
    || process.env.FRONTEND_URL 
    || 'http://localhost:5173';
  const allowedOrigins = frontendUrl.split(',').map(url => url.trim());

  app.enableCors({
    origin: isProduction ? allowedOrigins : true, // Em prod, só origens específicas; em dev, todas
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  console.log(`🔒 CORS: ${isProduction ? allowedOrigins.join(', ') : 'Todas as origens (dev)'}`);


  // Habilita validação global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Configuração do Swagger
  const config = new DocumentBuilder()
    .setTitle('API Nova Mariah')
    .setDescription('Documentação da API do sistema Nova Mariah')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Autenticação e registro')
    .addTag('users', 'Gerenciamento de usuários')
    .addTag('planos', 'Gerenciamento de planos')
    .addTag('beneficios', 'Gerenciamento de benefícios dos planos')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  // Descobre o IP local para exibir
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let localIp = 'localhost';

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        localIp = net.address;
        break;
      }
    }
  }

  console.log('🚀 Servidor rodando em:');
  console.log('   - Local:   http://localhost:' + port);
  console.log('   - Rede:    http://' + localIp + ':' + port);
  console.log('📚 Documentação: http://' + localIp + ':' + port + '/api/docs');
  console.log('📊 Banco de dados: PostgreSQL (AWS)');
}

bootstrap();
