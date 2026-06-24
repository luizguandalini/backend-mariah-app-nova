import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

// ============================================================
// DataSource usado SOMENTE pela CLI do TypeORM (migration:*).
// O app em runtime continua configurando o TypeORM em app.module.ts.
// Aqui precisamos carregar o .env manualmente, pois rodamos fora do Nest.
// ============================================================
loadEnv();

const isProduction = process.env.NODE_ENV === 'production';
const prefix = isProduction ? 'PROD_' : 'DEV_';

// Mesma lógica de app.module.ts: prefixo DEV_/PROD_ com fallback sem prefixo.
const getConfig = (key: string): string => {
  const prefixedValue = process.env[`${prefix}${key}`];
  if (prefixedValue !== undefined && prefixedValue !== '') {
    return prefixedValue;
  }
  return process.env[key] || '';
};

const dbSslRaw = getConfig('DB_SSL');
const useSsl = dbSslRaw === '' ? isProduction : dbSslRaw === 'true';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: getConfig('DB_HOST'),
  port: parseInt(getConfig('DB_PORT') || '5432', 10),
  username: getConfig('DB_USERNAME'),
  password: getConfig('DB_PASSWORD'),
  database: getConfig('DB_DATABASE'),
  // Globs com barra "/" (o TypeORM usa glob internamente).
  entities: [`${__dirname}/../**/*.entity{.ts,.js}`],
  migrations: [`${__dirname}/../migrations/*{.ts,.js}`],
  // NUNCA sincronizar a partir da CLI: o objetivo aqui é gerar/rodar migrações.
  synchronize: false,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});
