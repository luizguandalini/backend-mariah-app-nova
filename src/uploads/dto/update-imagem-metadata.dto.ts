import { IsString, IsOptional, IsInt, Min } from 'class-validator';

export class UpdateImagemMetadataDto {
  @IsOptional()
  @IsString()
  ambiente?: string;

  @IsOptional()
  @IsString()
  tipoAmbiente?: string;

  @IsOptional()
  @IsString()
  tipo?: string;

  @IsOptional()
  @IsString()
  categoria?: string;

  @IsOptional()
  @IsString()
  avariaLocal?: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  ordem?: number;

  @IsOptional()
  @IsString()
  ambienteComentario?: string;
}
