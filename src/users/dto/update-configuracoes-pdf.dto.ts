import { IsInt, Min, Max, IsOptional, IsString, MaxLength } from 'class-validator';

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

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  metodologiaTexto?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  termosGeraisTexto?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  assinaturaTexto?: string | null;
}
