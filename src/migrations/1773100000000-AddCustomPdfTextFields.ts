import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomPdfTextFields1773100000000 implements MigrationInterface {
  name = 'AddCustomPdfTextFields1773100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "configuracoes_pdf_usuario"
      ADD COLUMN IF NOT EXISTS "metodologia_texto" TEXT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "configuracoes_pdf_usuario"
      ADD COLUMN IF NOT EXISTS "termos_gerais_texto" TEXT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "configuracoes_pdf_usuario"
      ADD COLUMN IF NOT EXISTS "assinatura_texto" TEXT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "configuracoes_pdf_usuario"
      DROP COLUMN IF EXISTS "assinatura_texto"
    `);

    await queryRunner.query(`
      ALTER TABLE "configuracoes_pdf_usuario"
      DROP COLUMN IF EXISTS "termos_gerais_texto"
    `);

    await queryRunner.query(`
      ALTER TABLE "configuracoes_pdf_usuario"
      DROP COLUMN IF EXISTS "metodologia_texto"
    `);
  }
}
