import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWebLoginTickets1772000000000 implements MigrationInterface {
  name = 'CreateWebLoginTickets1772000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "web_login_tickets" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "token" VARCHAR(255) NOT NULL,
        "usuario_id" UUID NOT NULL REFERENCES "usuarios"("id") ON DELETE CASCADE,
        "laudo_id" UUID NOT NULL REFERENCES "laudos"("id") ON DELETE CASCADE,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "used_at" TIMESTAMPTZ NULL,
        "created_at" TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT "UQ_web_login_tickets_token" UNIQUE ("token")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_web_login_tickets_usuario" ON "web_login_tickets" ("usuario_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_web_login_tickets_laudo" ON "web_login_tickets" ("laudo_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_web_login_tickets_expires" ON "web_login_tickets" ("expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "web_login_tickets"`);
  }
}
