import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona a coluna `damage_marker` (jsonb) à tabela `imagens_laudo`.
 *
 * Armazena a posição e o raio do círculo vermelho que o usuário arrasta
 * sobre fotos marcadas como AVARIA, tanto na galeria quanto no PDF.
 *
 * Schema do JSON:
 *   { x: number, y: number, r: number }
 *
 * - `x`, `y` = centro do círculo em coordenadas normalizadas (0..1) em
 *   relação à largura/altura da imagem renderizada. Por que normalizado:
 *   a mesma posição precisa funcionar em thumbnails (~180px), no card
 *   médio da galeria (~250-400px), no lightbox full-screen e nas várias
 *   resoluções que o PDF usa para imprimir — todas a partir do mesmo
 *   par (x, y).
 * - `r` = raio também normalizado, expresso como fração do MENOR lado da
 *   imagem (min(width, height)). Garante que o círculo nunca exceda os
 *   limites da foto em qualquer tamanho de renderização.
 *
 * Quando o usuário desmarca a foto como AVARIA, o `damage_marker`
 * continua persistido no banco — assim, se ele re-marcar a foto como
 * AVARIA depois, o círculo reaparece exatamente na mesma posição em que
 * foi deixado pela última vez. A exibição do overlay é gated pelo
 * `categoria === 'AVARIA'` no frontend e no `PdfService`.
 */
export class AddDamageMarkerToImagemLaudo1780400000000
  implements MigrationInterface
{
  name = 'AddDamageMarkerToImagemLaudo1780400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "imagens_laudo"
      ADD COLUMN IF NOT EXISTS "damage_marker" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "imagens_laudo"
      DROP COLUMN IF EXISTS "damage_marker"
    `);
  }
}
