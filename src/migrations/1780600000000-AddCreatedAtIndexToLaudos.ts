import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índice em `laudos.created_at` (DESC) para suportar a navegação "Drive".
 *
 * Todos os endpoints de `/drive` ordenam/particionam os laudos por
 * `created_at` sobre a tabela inteira (sem filtro por usuário): a listagem
 * flat (mais recente primeiro), as agregações por ano/mês e o recorte por
 * intervalo de datas de um mês. O índice torna a ordenação por data e os
 * predicados de intervalo (`created_at >= x AND < y`) sargáveis.
 */
export class AddCreatedAtIndexToLaudos1780600000000
  implements MigrationInterface
{
  name = 'AddCreatedAtIndexToLaudos1780600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_laudos_created_at"
      ON "laudos" ("created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_laudos_created_at"
    `);
  }
}
