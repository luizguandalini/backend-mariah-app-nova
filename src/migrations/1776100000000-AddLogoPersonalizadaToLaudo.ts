import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddLogoPersonalizadaToLaudo1776100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'laudos',
      new TableColumn({
        name: 'logo_personalizada_s3_key',
        type: 'varchar',
        length: '512',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('laudos', 'logo_personalizada_s3_key');
  }
}
