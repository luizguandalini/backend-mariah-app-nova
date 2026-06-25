import { IsString, IsNotEmpty, MaxLength, IsOptional, IsInt, Min, Max } from 'class-validator';

export class ConfirmContestacaoUploadDto {
  @IsString()
  @IsNotEmpty()
  s3Key: string;

  /**
   * Legenda individual da imagem. OBRIGATÓRIA — sem ela o backend rejeita
   * o confirm (e o frontend bloqueia o envio antes mesmo de chegar aqui).
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  legenda: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  ordem?: number;
}