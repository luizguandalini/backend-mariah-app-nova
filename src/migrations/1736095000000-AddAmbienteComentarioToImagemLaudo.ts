import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAmbienteComentarioToImagemLaudo1736095000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Adiciona coluna ambiente_comentario para armazenar o comentário livre do ambiente
    await queryRunner.query(`
      ALTER TABLE imagens_laudo 
      ADD COLUMN IF NOT EXISTS ambiente_comentario VARCHAR(1000) DEFAULT '';
    `);
    
    console.log('✅ Coluna ambiente_comentario adicionada à tabela imagens_laudo');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE imagens_laudo 
      DROP COLUMN IF EXISTS ambiente_comentario;
    `);
    
    console.log('✅ Coluna ambiente_comentario removida da tabela imagens_laudo');
  }
}
