import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateConfiguracaoPdfUsuario1736113000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'configuracoes_pdf_usuario',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'usuario_id',
            type: 'uuid',
            isUnique: true,
          },
          {
            name: 'espacamento_horizontal',
            type: 'integer',
            default: 10,
          },
          {
            name: 'espacamento_vertical',
            type: 'integer',
            default: 15,
          },
          {
            name: 'margem_pagina',
            type: 'integer',
            default: 20,
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['usuario_id'],
            referencedTableName: 'usuarios',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('configuracoes_pdf_usuario');
  }
}
