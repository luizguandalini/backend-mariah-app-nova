import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDescricaoItensAmbiente1735668000000 implements MigrationInterface {
  name = 'AddDescricaoItensAmbiente1735668000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Adiciona coluna descrição para itens de ambiente
    await queryRunner.query(`
      ALTER TABLE "itens_ambiente" 
      ADD COLUMN IF NOT EXISTS "descricao" TEXT
    `);

    console.log('✅ Coluna descricao adicionada à tabela itens_ambiente');
    console.log('   - descricao (TEXT) - nullable para itens existentes');
    console.log('   ℹ️  Campo usado para exibição no app mobile');
    console.log('   ℹ️  Campo "prompt" permanece apenas para uso interno da IA');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove a coluna descrição
    await queryRunner.query(`
      ALTER TABLE "itens_ambiente" 
      DROP COLUMN IF EXISTS "descricao"
    `);

    console.log('⚠️ Coluna descricao removida da tabela itens_ambiente');
  }
}
