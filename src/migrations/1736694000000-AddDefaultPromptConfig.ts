import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDefaultPromptConfig1736694000000 implements MigrationInterface {
  name = 'AddDefaultPromptConfig1736694000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Inserir configuração do prompt padrão na tabela system_config
    await queryRunner.query(`
      INSERT INTO "system_config" ("key", "value", "description") 
      VALUES (
        'default_prompt', 
        '', 
        'Prompt padrão que é adicionado antes dos prompts de itens na análise de imagens. Máximo 1000 caracteres.'
      )
      ON CONFLICT ("key") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "system_config" WHERE "key" = 'default_prompt'
    `);
  }
}
