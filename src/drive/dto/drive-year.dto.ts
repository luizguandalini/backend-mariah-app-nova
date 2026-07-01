import { ApiProperty } from '@nestjs/swagger';

/**
 * Um ano que possui laudos, com a contagem de laudos daquele ano.
 * Ano derivado de `created_at` no timezone `America/Sao_Paulo`.
 */
export class DriveYearDto {
  @ApiProperty({ example: 2026, description: 'Ano (horário de São Paulo)' })
  year: number;

  @ApiProperty({ example: 42, description: 'Quantidade de laudos no ano' })
  count: number;
}
