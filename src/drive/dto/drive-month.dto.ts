import { ApiProperty } from '@nestjs/swagger';

/**
 * Um mês (1–12) que possui laudos dentro de um ano, com a contagem.
 * Mês derivado de `created_at` no timezone `America/Sao_Paulo`. O rótulo
 * textual (ex.: "Junho") fica a cargo do frontend/i18n.
 */
export class DriveMonthDto {
  @ApiProperty({ example: 6, description: 'Mês 1–12 (horário de São Paulo)' })
  month: number;

  @ApiProperty({ example: 7, description: 'Quantidade de laudos no mês' })
  count: number;
}
