import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsarNomeArquivoComoLegendaToImagemLaudo1780100000000
  implements MigrationInterface
{
  name = 'AddUsarNomeArquivoComoLegendaToImagemLaudo1780100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "imagens_laudo"
      ADD COLUMN IF NOT EXISTS "usar_nome_arquivo_como_legenda" BOOLEAN NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "imagens_laudo"
      DROP COLUMN IF EXISTS "usar_nome_arquivo_como_legenda"
    `);
  }
}
