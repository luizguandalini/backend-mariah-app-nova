import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeAmbienteTiposImovelToTextArray1774000000000
  implements MigrationInterface
{
  name = 'ChangeAmbienteTiposImovelToTextArray1774000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "ambientes"
      ALTER COLUMN "tipos_imovel" TYPE text[]
      USING "tipos_imovel"::text[]
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE tipo_imovel AS ENUM ('Casa', 'Apartamento', 'Estudio');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "ambientes"
      ALTER COLUMN "tipos_imovel" TYPE tipo_imovel[]
      USING "tipos_imovel"::tipo_imovel[]
    `);
  }
}
