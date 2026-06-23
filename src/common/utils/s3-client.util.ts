import { ConfigService } from '@nestjs/config';
import { S3ClientConfig } from '@aws-sdk/client-s3';

/**
 * Monta a configuração do S3Client de forma compatível com PROD e DEV.
 *
 * Em PRODUÇÃO, S3_ENDPOINT fica vazio e o SDK usa o endpoint padrão da AWS
 * (comportamento inalterado).
 *
 * Em DESENVOLVIMENTO, é possível apontar para um S3 local compatível
 * (ex.: MinIO) definindo S3_ENDPOINT (ex.: http://localhost:9000). Nesse
 * caso usamos path-style, exigido pela maioria dos S3 self-hosted.
 */
export function buildS3ClientConfig(configService: ConfigService): S3ClientConfig {
  const endpoint = configService.get<string>('S3_ENDPOINT', '');

  const config: S3ClientConfig = {
    region: configService.get<string>('AWS_REGION', 'us-east-1'),
    credentials: {
      accessKeyId: configService.get<string>('AWS_ACCESS_KEY_ID', ''),
      secretAccessKey: configService.get<string>('AWS_SECRET_ACCESS_KEY', ''),
    },
  };

  if (endpoint) {
    config.endpoint = endpoint;
    config.forcePathStyle = true;
  }

  return config;
}
