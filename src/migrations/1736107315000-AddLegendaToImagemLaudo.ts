import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLegendaToImagemLaudo1736107315000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Adiciona coluna legenda para armazenar legendas das imagens
    await queryRunner.query(`
      ALTER TABLE imagens_laudo 
      ADD COLUMN IF NOT EXISTS legenda VARCHAR(200) DEFAULT 'sem legenda';
    `);
    
    console.log('✅ Coluna legenda adicionada à tabela imagens_laudo');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE imagens_laudo 
      DROP COLUMN IF EXISTS legenda;
    `);
    
    console.log('✅ Coluna legenda removida da tabela imagens_laudo');
  }
}
