import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFilenameCaptionPreferenceToLaudo1775500000000
  implements MigrationInterface
{
  name = 'AddFilenameCaptionPreferenceToLaudo1775500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "laudos"
      ADD COLUMN IF NOT EXISTS "usar_nome_arquivo_como_legenda" BOOLEAN NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "laudos"
      DROP COLUMN IF EXISTS "usar_nome_arquivo_como_legenda"
    `);
  }
}
