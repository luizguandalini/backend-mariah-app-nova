import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandEstadoColumn1749768000000 implements MigrationInterface {
  name = 'ExpandEstadoColumn1749768000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Expande o campo estado de VARCHAR(2) para VARCHAR(50)
    // para aceitar tanto UF ("SP") quanto nome completo ("São Paulo")
    await queryRunner.query(`
      ALTER TABLE "laudos" 
      ALTER COLUMN "estado" TYPE varchar(50)
    `);

    console.log('✅ Coluna estado expandida de VARCHAR(2) para VARCHAR(50)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverte para VARCHAR(2) - pode perder dados!
    await queryRunner.query(`
      ALTER TABLE "laudos" 
      ALTER COLUMN "estado" TYPE varchar(2)
    `);

    console.log('⚠️ Coluna estado revertida para VARCHAR(2)');
  }
}
