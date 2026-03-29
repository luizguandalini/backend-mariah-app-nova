import { ApiProperty } from '@nestjs/swagger';

export class DashboardStatsDto {
  @ApiProperty({ description: 'Total de laudos criados' })
  totalLaudos: number;

  @ApiProperty({ description: 'Laudos em processamento' })
  emProcessamento: number;

  @ApiProperty({ description: 'Laudos concluídos' })
  concluidos: number;

  @ApiProperty({ description: 'Quantidade de imagens restantes' })
  imagensRestantes: number;

  @ApiProperty({ description: 'Quantidade de classificações web restantes' })
  classificacoesWebRestantes: number;
}
