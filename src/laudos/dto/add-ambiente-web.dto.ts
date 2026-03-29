import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export enum EstrategiaConflitoAmbienteWeb {
  ERRO = 'erro',
  DESLOCAR = 'deslocar',
}

export class AddAmbienteWebDto {
  @ApiProperty({ description: 'Nome do ambiente' })
  @IsString()
  @IsNotEmpty()
  nomeAmbiente: string;

  @ApiProperty({ description: 'Tipo do ambiente' })
  @IsString()
  @IsNotEmpty()
  tipoAmbiente: string;

  @ApiProperty({ description: 'Número do ambiente na galeria (inicia em 1)' })
  @IsInt()
  @Min(1)
  numeroAmbiente: number;

  @ApiPropertyOptional({
    description:
      'Estratégia quando a posição já existe: erro ou deslocar os ambientes subsequentes',
    enum: EstrategiaConflitoAmbienteWeb,
  })
  @IsOptional()
  @IsEnum(EstrategiaConflitoAmbienteWeb)
  estrategiaConflito?: EstrategiaConflitoAmbienteWeb;
}
