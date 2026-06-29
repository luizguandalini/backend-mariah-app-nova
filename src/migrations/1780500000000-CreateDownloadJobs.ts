import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDownloadJobs1780500000000 implements MigrationInterface {
  name = 'CreateDownloadJobs1780500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "download_jobs" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "laudo_id" UUID NOT NULL REFERENCES "laudos"("id") ON DELETE CASCADE,
        "usuario_id" UUID NOT NULL REFERENCES "usuarios"("id") ON DELETE CASCADE,
        "tipo" VARCHAR(20) NOT NULL,
        "ambiente" VARCHAR(255) NULL,
        "status" VARCHAR(20) NOT NULL DEFAULT 'queued',
        "total_imagens" INTEGER NOT NULL DEFAULT 0,
        "zip_s3_key" VARCHAR(1024) NULL,
        "erro" TEXT NULL,
        "created_at" TIMESTAMPTZ DEFAULT NOW(),
        "started_at" TIMESTAMPTZ NULL,
        "completed_at" TIMESTAMPTZ NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_download_jobs_laudo" ON "download_jobs" ("laudo_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_download_jobs_status" ON "download_jobs" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "download_jobs"`);
  }
}
