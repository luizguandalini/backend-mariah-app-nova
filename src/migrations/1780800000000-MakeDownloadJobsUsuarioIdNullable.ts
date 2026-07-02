import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Liberaliza os downloads do drive view para anônimos (não-dono
 * não-admin ou sem token). Para suportar isso, jobs enfileirados via
 * `POST /download/laudo/...` agora podem ter `usuario_id = NULL`
 * (chamador anônimo que conheceu o `laudoId` via drive view aberta).
 *
 * Operação: relaxa `NOT NULL` em `download_jobs.usuario_id`. Não
 * reescreve a tabela — apenas altera a constraint de coluna, que é
 * operação instantânea no PostgreSQL.
 *
 * Jobs existentes (com `usuario_id` não-nulo) permanecem válidos.
 *
 * Change relacionada: `enable-download-in-drive-visualization`.
 */
export class MakeDownloadJobsUsuarioIdNullable1780800000000
  implements MigrationInterface
{
  name = 'MakeDownloadJobsUsuarioIdNullable1780800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "download_jobs"
      ALTER COLUMN "usuario_id" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // O `down` só é seguro se não houver linhas com `usuario_id IS NULL`
    // (a constraint `NOT NULL` voltaria a falhar). Operadores devem
    // limpar dados órfãos antes de reverter.
    await queryRunner.query(`
      ALTER TABLE "download_jobs"
      ALTER COLUMN "usuario_id" SET NOT NULL
    `);
  }
}