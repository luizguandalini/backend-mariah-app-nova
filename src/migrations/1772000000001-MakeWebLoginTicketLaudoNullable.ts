import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeWebLoginTicketLaudoNullable1772000000001 implements MigrationInterface {
  name = 'MakeWebLoginTicketLaudoNullable1772000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "web_login_tickets"
      ALTER COLUMN "laudo_id" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "web_login_tickets"
      ALTER COLUMN "laudo_id" SET NOT NULL
    `);
  }
}
