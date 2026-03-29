import { IsString, IsOptional, IsInt, Min, IsEnum } from 'class-validator';

export class ConfirmWebUploadDto {
  @IsString()
  laudoId: string;

  @IsString()
  s3Key: string;

  @IsString()
  ambiente: string;

  @IsString()
  tipoAmbiente: string;

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
