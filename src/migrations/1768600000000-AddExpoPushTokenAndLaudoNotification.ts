import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExpoPushTokenAndLaudoNotification1768600000000 implements MigrationInterface {
  name = 'AddExpoPushTokenAndLaudoNotification1768600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "usuarios"
      ADD COLUMN IF NOT EXISTS "expo_push_token" VARCHAR(255)
    `);

    await queryRunner.query(`
      ALTER TABLE "laudos"
      ADD COLUMN IF NOT EXISTS "push_notified_at" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "laudos"
      DROP COLUMN IF EXISTS "push_notified_at"
    `);

    await queryRunner.query(`
      ALTER TABLE "usuarios"
      DROP COLUMN IF EXISTS "expo_push_token"
    `);
  }
}
