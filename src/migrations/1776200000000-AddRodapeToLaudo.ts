import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddRodapeToLaudo1776200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'laudos',
      new TableColumn({
        name: 'rodape',
        type: 'text',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('laudos', 'rodape');
  }
}