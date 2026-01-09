import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTipoAmbienteToImagemLaudo1736308156000 implements MigrationInterface {
  name = 'AddTipoAmbienteToImagemLaudo1736308156000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "imagens_laudo" 
      ADD COLUMN "tipo_ambiente" VARCHAR(255) NULL
    `);

    // Índice para busca rápida por tipo_ambiente (normalizado)
    await queryRunner.query(`
      CREATE INDEX "IDX_imagens_laudo_tipo_ambiente" 
      ON "imagens_laudo" ("tipo_ambiente")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_imagens_laudo_tipo_ambiente"`);
    await queryRunner.query(`
      ALTER TABLE "imagens_laudo" 
      DROP COLUMN "tipo_ambiente"
    `);
  }
}
