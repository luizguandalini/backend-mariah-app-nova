import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddQuantidadeClassificacoesWebToUsuario1775000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'usuarios',
      new TableColumn({
        name: 'quantidade_classificacoes_web',
        type: 'int',
        default: 0,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('usuarios', 'quantidade_classificacoes_web');
  }
}
