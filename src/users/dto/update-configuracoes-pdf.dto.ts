import { IsInt, Min, Max, IsOptional } from 'class-validator';

export class UpdateConfiguracoesPdfDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  espacamentoHorizontal?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  espacamentoVertical?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  margemPagina?: number;
}
