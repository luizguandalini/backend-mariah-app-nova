import { ConfigService } from '@nestjs/config';

/**
 * Helper para obter configuração baseada no ambiente (DEV ou PROD)
 * 
 * Uso:
 *   const dbHost = getEnvConfig(configService, 'DB_HOST');
 *   
 * Se NODE_ENV=production, busca PROD_DB_HOST
 * Se NODE_ENV=development, busca DEV_DB_HOST
 * Se a variável com prefixo não existir, busca sem prefixo como fallback
 */
export function getEnvConfig(configService: ConfigService, key: string): string {
  const isProduction = configService.get('NODE_ENV') === 'production';
  const prefix = isProduction ? 'PROD_' : 'DEV_';
  
  // Tenta buscar com prefixo primeiro
  const prefixedValue = configService.get(`${prefix}${key}`);
  if (prefixedValue !== undefined && prefixedValue !== '') {
    return prefixedValue;
  }
  
  // Fallback: busca sem prefixo
  return configService.get(key) || '';
}

/**
 * Versão para process.env (sem ConfigService)
 */
export function getEnvConfigRaw(key: string): string {
  const isProduction = process.env.NODE_ENV === 'production';
  const prefix = isProduction ? 'PROD_' : 'DEV_';
  
  // Tenta buscar com prefixo primeiro
  const prefixedValue = process.env[`${prefix}${key}`];
  if (prefixedValue !== undefined && prefixedValue !== '') {
    return prefixedValue;
  }
  
  // Fallback: busca sem prefixo
  return process.env[key] || '';
}

/**
 * Retorna o ambiente atual formatado
 */
export function getEnvironmentName(): string {
  return process.env.NODE_ENV === 'production' ? 'PRODUÇÃO' : 'DESENVOLVIMENTO';
}

/**
 * Verifica se está em modo produção
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}
