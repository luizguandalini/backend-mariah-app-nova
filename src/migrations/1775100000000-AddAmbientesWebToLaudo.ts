import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAmbientesWebToLaudo1775100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE laudos
      ADD COLUMN IF NOT EXISTS ambientes_web jsonb DEFAULT '[]'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE laudos
      DROP COLUMN IF EXISTS ambientes_web
    `);
  }
}
