import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddItemAnalysisFlagsToImagemLaudo1775200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('imagens_laudo', [
      new TableColumn({
        name: 'item_ja_foi_analisado_pela_ia',
        type: 'varchar',
        length: '3',
        default: "'nao'",
      }),
      new TableColumn({
        name: 'subitem_ja_foi_analisado_pela_ia',
        type: 'varchar',
        length: '3',
        default: "'nao'",
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('imagens_laudo', 'subitem_ja_foi_analisado_pela_ia');
    await queryRunner.dropColumn('imagens_laudo', 'item_ja_foi_analisado_pela_ia');
  }
}
