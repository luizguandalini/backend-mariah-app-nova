import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

/**
 * Adiciona suporte a "Registros Complementares" (contestação) em laudos já
 * concluídos.
 *
 * - laudos.contestacao_realizada: flag que indica se o usuário já exerceu o
 *   direito (uma única vez por laudo).
 * - laudos.contestacao_data: timestamp da contestação (carimbo de auditoria
 *   no PDF).
 *
 * - contestacao_imagens: tabela de imagens anexadas à contestação. Cada
 *   imagem tem uma legenda OBRIGATÓRIA (varchar 500). Reaproveita o mesmo
 *   padrão das imagens de laudo (cascade no laudo, FK ao usuário), com
 *   s3Key UNIQUE para suportar o UPSERT do confirm do upload.
 *
 * Padrão de path S3 (consistente com o restante do sistema):
 *   users/{userId}/laudos/{laudoId}/contestacao/{uuid}_{filename}
 */
export class AddContestacaoToLaudo1780200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'laudos',
      new TableColumn({
        name: 'contestacao_realizada',
        type: 'boolean',
        default: false,
      }),
    );

    await queryRunner.addColumn(
      'laudos',
      new TableColumn({
        name: 'contestacao_data',
        type: 'timestamptz',
        isNullable: true,
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'contestacao_imagens',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'laudo_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'usuario_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 's3_key',
            type: 'text',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'legenda',
            type: 'varchar',
            length: '500',
            isNullable: false,
          },
          {
            name: 'ordem',
            type: 'int',
            default: 0,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'contestacao_imagens',
      new TableForeignKey({
        name: 'fk_contestacao_imagens_laudo',
        columnNames: ['laudo_id'],
        referencedTableName: 'laudos',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'contestacao_imagens',
      new TableForeignKey({
        name: 'fk_contestacao_imagens_usuario',
        columnNames: ['usuario_id'],
        referencedTableName: 'usuarios',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      'contestacao_imagens',
      new TableIndex({
        name: 'idx_contestacao_imagens_laudo_ordem',
        columnNames: ['laudo_id', 'ordem'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'contestacao_imagens',
      'idx_contestacao_imagens_laudo_ordem',
    );
    await queryRunner.dropForeignKey(
      'contestacao_imagens',
      'fk_contestacao_imagens_usuario',
    );
    await queryRunner.dropForeignKey(
      'contestacao_imagens',
      'fk_contestacao_imagens_laudo',
    );
    await queryRunner.dropTable('contestacao_imagens', true);

    await queryRunner.dropColumn('laudos', 'contestacao_data');
    await queryRunner.dropColumn('laudos', 'contestacao_realizada');
  }
}