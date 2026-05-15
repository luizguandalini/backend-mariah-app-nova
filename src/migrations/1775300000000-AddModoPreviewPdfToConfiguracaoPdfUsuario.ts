import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddModoPreviewPdfToConfiguracaoPdfUsuario1775300000000
  implements MigrationInterface
{
  name = 'AddModoPreviewPdfToConfiguracaoPdfUsuario1775300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "configuracoes_pdf_usuario"
      ADD COLUMN IF NOT EXISTS "modo_preview_pdf" VARCHAR(20) NOT NULL DEFAULT 'detalhado'
    `);

    await queryRunner.query(`
      ALTER TABLE "configuracoes_pdf_usuario"
      ADD CONSTRAINT "CHK_configuracoes_pdf_usuario_modo_preview_pdf"
      CHECK ("modo_preview_pdf" IN ('detalhado', 'compacto'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "configuracoes_pdf_usuario"
      DROP CONSTRAINT IF EXISTS "CHK_configuracoes_pdf_usuario_modo_preview_pdf"
    `);

    await queryRunner.query(`
      ALTER TABLE "configuracoes_pdf_usuario"
      DROP COLUMN IF EXISTS "modo_preview_pdf"
    `);
  }
}
