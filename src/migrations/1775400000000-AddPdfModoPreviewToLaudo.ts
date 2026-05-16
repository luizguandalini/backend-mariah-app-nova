import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPdfModoPreviewToLaudo1775400000000 implements MigrationInterface {
  name = 'AddPdfModoPreviewToLaudo1775400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "laudos"
      ADD COLUMN IF NOT EXISTS "pdf_modo_preview" VARCHAR(20) NOT NULL DEFAULT 'detalhado'
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'CHK_laudos_pdf_modo_preview'
        ) THEN
          ALTER TABLE "laudos"
          ADD CONSTRAINT "CHK_laudos_pdf_modo_preview"
          CHECK ("pdf_modo_preview" IN ('detalhado', 'compacto'));
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "laudos"
      DROP CONSTRAINT IF EXISTS "CHK_laudos_pdf_modo_preview"
    `);

    await queryRunner.query(`
      ALTER TABLE "laudos"
      DROP COLUMN IF EXISTS "pdf_modo_preview"
    `);
  }
}
