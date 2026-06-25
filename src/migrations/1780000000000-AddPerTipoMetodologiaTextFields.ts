import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerTipoMetodologiaTextFields1780000000000
  implements MigrationInterface
{
  name = 'AddPerTipoMetodologiaTextFields1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "configuracoes_pdf_usuario"
      ADD COLUMN IF NOT EXISTS "metodologia_entrada_texto" TEXT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "configuracoes_pdf_usuario"
      ADD COLUMN IF NOT EXISTS "metodologia_saida_texto" TEXT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "configuracoes_pdf_usuario"
      ADD COLUMN IF NOT EXISTS "metodologia_constatacao_texto" TEXT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "configuracoes_pdf_usuario"
      ADD COLUMN IF NOT EXISTS "metodologia_periodica_texto" TEXT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "configuracoes_pdf_usuario"
      DROP COLUMN IF EXISTS "metodologia_periodica_texto"
    `);

    await queryRunner.query(`
      ALTER TABLE "configuracoes_pdf_usuario"
      DROP COLUMN IF EXISTS "metodologia_constatacao_texto"
    `);

    await queryRunner.query(`
      ALTER TABLE "configuracoes_pdf_usuario"
      DROP COLUMN IF EXISTS "metodologia_saida_texto"
    `);

    await queryRunner.query(`
      ALTER TABLE "configuracoes_pdf_usuario"
      DROP COLUMN IF EXISTS "metodologia_entrada_texto"
    `);
  }
}
