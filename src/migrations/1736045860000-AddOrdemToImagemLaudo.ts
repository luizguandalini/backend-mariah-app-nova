import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrdemToImagemLaudo1736045860000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE imagens_laudo 
      ADD COLUMN IF NOT EXISTS ordem INTEGER NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE imagens_laudo 
      DROP COLUMN IF EXISTS ordem
    `);
  }
}
