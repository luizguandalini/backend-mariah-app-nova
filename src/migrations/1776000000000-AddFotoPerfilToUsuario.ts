import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddFotoPerfilToUsuario1776000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'usuarios',
      new TableColumn({
        name: 'foto_perfil_s3_key',
        type: 'varchar',
        length: '512',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('usuarios', 'foto_perfil_s3_key');
  }
}
