import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuestionariosLaudos1735320000000 implements MigrationInterface {
  name = 'AddQuestionariosLaudos1735320000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Adiciona colunas para questionários e informações detalhadas
    await queryRunner.query(`
      ALTER TABLE "laudos" 
      ADD COLUMN IF NOT EXISTS "incluir_atestado" INTEGER,
      ADD COLUMN IF NOT EXISTS "atestado" TEXT,
      ADD COLUMN IF NOT EXISTS "analises_hidraulicas" JSONB,
      ADD COLUMN IF NOT EXISTS "analises_eletricas" JSONB,
      ADD COLUMN IF NOT EXISTS "sistema_ar" JSONB,
      ADD COLUMN IF NOT EXISTS "mecanismos_abertura" JSONB,
      ADD COLUMN IF NOT EXISTS "revestimentos" JSONB,
      ADD COLUMN IF NOT EXISTS "mobilias" JSONB
    `);

    console.log('✅ Colunas de questionários adicionadas à tabela laudos');
    console.log('   - incluir_atestado (INTEGER)');
    console.log('   - atestado (TEXT)');
    console.log('   - analises_hidraulicas (JSONB)');
    console.log('   - analises_eletricas (JSONB)');
    console.log('   - sistema_ar (JSONB)');
    console.log('   - mecanismos_abertura (JSONB)');
    console.log('   - revestimentos (JSONB)');
    console.log('   - mobilias (JSONB)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove as colunas adicionadas
    await queryRunner.query(`
      ALTER TABLE "laudos" 
      DROP COLUMN IF EXISTS "incluir_atestado",
      DROP COLUMN IF EXISTS "atestado",
      DROP COLUMN IF EXISTS "analises_hidraulicas",
      DROP COLUMN IF EXISTS "analises_eletricas",
      DROP COLUMN IF EXISTS "sistema_ar",
      DROP COLUMN IF EXISTS "mecanismos_abertura",
      DROP COLUMN IF EXISTS "revestimentos",
      DROP COLUMN IF EXISTS "mobilias"
    `);

    console.log('⚠️ Colunas de questionários removidas da tabela laudos');
  }
}
