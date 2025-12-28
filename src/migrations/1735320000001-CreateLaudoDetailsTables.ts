import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLaudoDetailsTables1735320000001 implements MigrationInterface {
  name = 'CreateLaudoDetailsTables1735320000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Criar tabela laudo_sections
    await queryRunner.query(`
      CREATE TABLE "laudo_sections" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(255) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_laudo_sections" PRIMARY KEY ("id")
      )
    `);

    // Criar tabela laudo_questions
    await queryRunner.query(`
      CREATE TABLE "laudo_questions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "section_id" uuid NOT NULL,
        "question_text" varchar(500),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_laudo_questions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_laudo_questions_section" FOREIGN KEY ("section_id") REFERENCES "laudo_sections"("id") ON DELETE CASCADE
      )
    `);

    // Criar tabela laudo_options
    await queryRunner.query(`
      CREATE TABLE "laudo_options" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "question_id" uuid NOT NULL,
        "option_text" varchar(500) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_laudo_options" PRIMARY KEY ("id"),
        CONSTRAINT "FK_laudo_options_question" FOREIGN KEY ("question_id") REFERENCES "laudo_questions"("id") ON DELETE CASCADE
      )
    `);

    console.log('✅ Tabelas de detalhes do laudo criadas:');
    console.log('   - laudo_sections');
    console.log('   - laudo_questions');
    console.log('   - laudo_options');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remover tabelas em ordem reversa
    await queryRunner.query(`DROP TABLE IF EXISTS "laudo_options"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "laudo_questions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "laudo_sections"`);

    console.log('⚠️ Tabelas de detalhes do laudo removidas');
  }
}
