import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix-up: garante a existência da coluna `legenda` em `contestacao_imagens`.
 *
 * Por que essa migration existe separada:
 * - A migration 1780200000000 (AddContestacaoToLaudo) já cria a tabela
 *   `contestacao_imagens` com `legenda` incluída no CREATE TABLE.
 * - Mas em bancos que já passaram pelo `synchronize` legado, o baseline
 *   apenas MARCA a migration como aplicada sem rodar o SQL. Resultado: a
 *   tabela existe, mas sem a coluna `legenda` — e o `migrationsRun` não
 *   re-executa a 1780200000000.
 * - Para esses bancos, essa migration idempotente (IF NOT EXISTS) cria a
 *   coluna faltante sem conflitar com bancos novos onde ela já existe.
 */
export class AddLegendaToContestacaoImagens1780300000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contestacao_imagens"
      ADD COLUMN IF NOT EXISTS "legenda" varchar(500) NOT NULL DEFAULT ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contestacao_imagens"
      DROP COLUMN IF EXISTS "legenda"
    `);
  }
}