import {
  IsIn,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsString,
  MaxLength,
  IsBoolean,
  IsNumber,
} from 'class-validator';

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
  @IsIn(['detalhado', 'compacto'])
  modoPreviewPdf?: 'detalhado' | 'compacto';

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

  // --- Logo da capa ---
  @IsOptional()
  @IsBoolean()
  mostrarLogoCapa?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2000)
  logoCapaX?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2000)
  logoCapaY?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(2000)
  logoCapaLargura?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(2000)
  logoCapaAltura?: number | null;
}
