import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSystemConfig1736308157000 implements MigrationInterface {
  name = 'CreateSystemConfig1736308157000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Tabela de configurações do sistema
    await queryRunner.query(`
      CREATE TABLE "system_config" (
        "key" VARCHAR(100) PRIMARY KEY,
        "value" TEXT NOT NULL,
        "is_encrypted" BOOLEAN DEFAULT false,
        "description" VARCHAR(500) NULL,
        "updated_at" TIMESTAMPTZ DEFAULT NOW(),
        "updated_by" UUID NULL
      )
    `);

    // Tabela de fila de análise de laudos
    await queryRunner.query(`
      CREATE TABLE "analysis_queue" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "laudo_id" UUID NOT NULL REFERENCES "laudos"("id") ON DELETE CASCADE,
        "usuario_id" UUID NOT NULL REFERENCES "usuarios"("id") ON DELETE CASCADE,
        "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
        "position" INTEGER NULL,
        "total_images" INTEGER NOT NULL DEFAULT 0,
        "processed_images" INTEGER NOT NULL DEFAULT 0,
        "current_image_id" UUID NULL,
        "error_message" TEXT NULL,
        "created_at" TIMESTAMPTZ DEFAULT NOW(),
        "started_at" TIMESTAMPTZ NULL,
        "completed_at" TIMESTAMPTZ NULL,
        CONSTRAINT "UQ_analysis_queue_laudo" UNIQUE ("laudo_id")
      )
    `);

    // Índices para performance
    await queryRunner.query(`
      CREATE INDEX "IDX_analysis_queue_status" ON "analysis_queue" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_analysis_queue_position" ON "analysis_queue" ("position")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_analysis_queue_usuario" ON "analysis_queue" ("usuario_id")
    `);

    // Inserir configurações padrão
    await queryRunner.query(`
      INSERT INTO "system_config" ("key", "value", "description") VALUES
      ('openai_api_key', '', 'Chave da API OpenAI (criptografada)'),
      ('openai_model', 'gpt-4o', 'Modelo OpenAI para análise de imagens'),
      ('openai_max_tokens', '500', 'Máximo de tokens na resposta'),
      ('rate_limit_rpm', '20', 'Requisições por minuto (Tier 1 conservador)'),
      ('rate_limit_delay_ms', '3000', 'Delay entre requisições em ms'),
      ('analysis_enabled', 'false', 'Se a análise está habilitada')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "analysis_queue"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "system_config"`);
  }
}
