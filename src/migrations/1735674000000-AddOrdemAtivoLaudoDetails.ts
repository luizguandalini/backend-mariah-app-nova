import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrdemAtivoLaudoDetails1735674000000 implements MigrationInterface {
  name = 'AddOrdemAtivoLaudoDetails1735674000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Adicionar campos ordem e ativo em laudo_sections
    await queryRunner.query(`
      ALTER TABLE "laudo_sections" 
      ADD COLUMN IF NOT EXISTS "ordem" INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "ativo" BOOLEAN DEFAULT true
    `);

    // Adicionar campos ordem e ativo em laudo_questions  
    await queryRunner.query(`
      ALTER TABLE "laudo_questions"
      ADD COLUMN IF NOT EXISTS "ordem" INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "ativo" BOOLEAN DEFAULT true
    `);

    // Adicionar campos ordem e ativo em laudo_options
    await queryRunner.query(`
      ALTER TABLE "laudo_options"
      ADD COLUMN IF NOT EXISTS "ordem" INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "ativo" BOOLEAN DEFAULT true
    `);

    console.log('✅ Campos ordem e ativo adicionados às tabelas de laudo_details');
    console.log('   - laudo_sections (ordem, ativo)');
    console.log('   - laudo_questions (ordem, ativo)');
    console.log('   - laudo_options (ordem, ativo)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remover campos
    await queryRunner.query(`
      ALTER TABLE "laudo_sections"
      DROP COLUMN IF EXISTS "ordem",
      DROP COLUMN IF EXISTS "ativo"
    `);

    await queryRunner.query(`
      ALTER TABLE "laudo_questions"
      DROP COLUMN IF EXISTS "ordem",
      DROP COLUMN IF EXISTS "ativo"
    `);

    await queryRunner.query(`
      ALTER TABLE "laudo_options"
      DROP COLUMN IF EXISTS "ordem",
      DROP COLUMN IF EXISTS "ativo"
    `);

    console.log('⚠️ Campos ordem e ativo removidos das tabelas de laudo_details');
  }
}
